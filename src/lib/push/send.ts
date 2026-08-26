// 주의: 이 모듈은 서버 전용(web-push + service_role 사용). 클라이언트에서 import 금지.
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendExpoPush, type ExpoMessage } from "./expo-push";
import { DEFAULT_TEAM_ID } from "@/lib/teams/context";

export type PushPayload = {
  title: string;
  body: string;
  /** 알림 클릭 시 이동할 앱 내 경로 (기본 "/") */
  url?: string;
  /** 알림 아이콘 (기본 /icon-192.png) */
  icon?: string;
};

/** 웹/네이티브 구독을 한 테이블에서 읽으므로 플랫폼별 컬럼은 nullable 이다. */
type SubscriptionRow = {
  id: string;
  platform: "web" | "ios" | "android";
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  expo_push_token: string | null;
};

let vapidConfigured = false;

// VAPID 자격증명을 1회 설정. 키가 없으면 false → 웹 발송만 건너뛴다.
// (네이티브는 Expo Push 를 쓰므로 VAPID 와 무관하게 나가야 한다)
function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:senceyh@gmail.com";
  if (!publicKey || !privateKey) {
    console.warn(
      "[push] VAPID 키가 설정되지 않았습니다 (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY). 발송을 건너뜁니다.",
    );
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

// 구독 묶음에 실제 발송. 플랫폼별로 전송 수단이 다르므로 여기서 갈라진다.
//
//   web              → web-push (VAPID)
//   ios / android    → Expo Push Service (Expo 가 APNs/FCM 으로 분배)
//
// 무효해진 구독은 양쪽 모두 DB 에서 정리한다.
async function sendToRows(rows: SubscriptionRow[], payload: PushPayload) {
  // 개발 모드(NEXT_PUBLIC_DEV_TOOLS=1)에서는 실제 사용자에게 푸시를 보내지 않는다.
  // (프로덕션엔 이 값이 없어 정상 발송된다.)
  if (process.env.NEXT_PUBLIC_DEV_TOOLS === "1") {
    console.log(`[push][dev] DEV_TOOLS=1 — 푸시 발송 생략: ${payload.title}`);
    return;
  }
  if (rows.length === 0) return;

  const url = payload.url ?? "/";
  const staleIds: string[] = [];

  const webRows = rows.filter((r) => r.platform === "web");
  const nativeRows = rows.filter((r) => r.platform !== "web");

  await Promise.all([
    sendWeb(webRows, payload, url, staleIds),
    sendNative(nativeRows, payload, url, staleIds),
  ]);

  if (staleIds.length > 0) {
    const admin = createAdminClient();
    await admin.from("push_subscriptions").delete().in("id", staleIds);
  }
}

/** 브라우저 구독 — web-push. VAPID 키가 없으면 이 갈래만 건너뛴다. */
async function sendWeb(
  rows: SubscriptionRow[],
  payload: PushPayload,
  url: string,
  staleIds: string[],
) {
  if (rows.length === 0) return;
  if (!ensureVapid()) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url,
    icon: payload.icon ?? "/icon-192.png",
  });

  await Promise.allSettled(
    rows.map(async (row) => {
      // shape_check 제약이 보장하지만, 런타임에서도 방어한다.
      if (!row.endpoint || !row.p256dh || !row.auth) return;
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          body,
        );
      } catch (err: unknown) {
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        // 410 Gone / 404 Not Found = 구독 만료 → 정리
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(row.id);
        } else {
          console.error("[push] 발송 실패", row.endpoint, statusCode ?? err);
        }
      }
    }),
  );
}

/** 네이티브(iOS/Android) — Expo Push Service. 두 플랫폼이 같은 코드로 처리된다. */
async function sendNative(
  rows: SubscriptionRow[],
  payload: PushPayload,
  url: string,
  staleIds: string[],
) {
  if (rows.length === 0) return;

  const byToken = new Map<string, string>();
  const messages: ExpoMessage[] = [];

  for (const row of rows) {
    if (!row.expo_push_token) continue;
    byToken.set(row.expo_push_token, row.id);
    messages.push({
      to: row.expo_push_token,
      title: payload.title,
      body: payload.body,
      // 알림을 탭했을 때 이동할 경로. 앱에서 이 값을 읽어 라우팅한다.
      data: { url },
      sound: "default",
      channelId: "default",
    });
  }

  const { invalidTokens } = await sendExpoPush(messages);
  for (const token of invalidTokens) {
    const id = byToken.get(token);
    if (id) staleIds.push(id);
  }
}

/**
 * 해당 팀 전체 멤버에게 푸시 발송.
 * @param excludeUserId 발송에서 제외할 회원(예: 알림을 유발한 본인)
 * @param teamId 대상 팀 (생략 시 수아자FC — 멀티팀 전환기 폴백)
 */
export async function sendPushToAll(
  payload: PushPayload,
  excludeUserId?: string,
  teamId?: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: members, error: mErr } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId ?? DEFAULT_TEAM_ID)
    .eq("status", "active");
  if (mErr) {
    console.error("[push] 팀 멤버 조회 실패", mErr.message);
    return;
  }
  let ids = (members ?? []).map((r) => r.user_id as string);
  if (excludeUserId) ids = ids.filter((id) => id !== excludeUserId);
  await sendPushToUsers(ids, payload);
}

/**
 * [테스트용] 회장(title=president)에게만 발송.
 * 운영 전환 시 createMatch 에서 sendPushToAll 로 되돌릴 것.
 */
export async function sendPushToPresident(payload: PushPayload): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("title", "president")
    .is("deleted_at", null);
  if (error) {
    console.error("[push] 회장 조회 실패", error.message);
    return;
  }
  const ids = (data ?? []).map((r) => r.id as string);
  await sendPushToUsers(ids, payload);
}

/** 특정 회원들에게만 푸시 발송. */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (userIds.length === 0) return;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, platform, endpoint, p256dh, auth, expo_push_token")
    .in("user_id", userIds);
  if (error) {
    console.error("[push] 구독 조회 실패", error.message);
    return;
  }
  await sendToRows((data ?? []) as SubscriptionRow[], payload);
}
