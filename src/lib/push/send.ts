// 주의: 이 모듈은 서버 전용(web-push + service_role 사용). 클라이언트에서 import 금지.
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushPayload = {
  title: string;
  body: string;
  /** 알림 클릭 시 이동할 앱 내 경로 (기본 "/") */
  url?: string;
  /** 알림 아이콘 (기본 /icon-192.png) */
  icon?: string;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

let vapidConfigured = false;

// VAPID 자격증명을 1회 설정. 키가 없으면 false (발송 스킵).
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

// 구독 묶음에 실제 발송. 만료(404/410)된 구독은 DB 에서 제거한다.
async function sendToRows(rows: SubscriptionRow[], payload: PushPayload) {
  if (rows.length === 0) return;
  const admin = createAdminClient();
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    icon: payload.icon ?? "/icon-192.png",
  });

  const staleIds: string[] = [];
  await Promise.allSettled(
    rows.map(async (row) => {
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

  if (staleIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", staleIds);
  }
}

/**
 * 전체 회원에게 푸시 발송.
 * @param excludeUserId 발송에서 제외할 회원(예: 알림을 유발한 본인)
 */
export async function sendPushToAll(
  payload: PushPayload,
  excludeUserId?: string,
): Promise<void> {
  if (!ensureVapid()) return;
  const admin = createAdminClient();
  let query = admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");
  if (excludeUserId) query = query.neq("user_id", excludeUserId);

  const { data, error } = await query;
  if (error) {
    console.error("[push] 구독 조회 실패", error.message);
    return;
  }
  await sendToRows((data ?? []) as SubscriptionRow[], payload);
}

/**
 * [테스트용] 회장(title=president)에게만 발송.
 * 운영 전환 시 createMatch 에서 sendPushToAll 로 되돌릴 것.
 */
export async function sendPushToPresident(payload: PushPayload): Promise<void> {
  if (!ensureVapid()) return;
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
  if (!ensureVapid() || userIds.length === 0) return;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (error) {
    console.error("[push] 구독 조회 실패", error.message);
    return;
  }
  await sendToRows((data ?? []) as SubscriptionRow[], payload);
}
