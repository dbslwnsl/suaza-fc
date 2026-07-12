// 주의: 서버 전용 (admin/service_role 사용). 클라이언트에서 import 금지.
// 인앱 알림(새소식) 수신함에 표시할 알림을 수신자별로 기록한다.
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TEAM_ID } from "@/lib/teams/context";

export type NotificationType =
  | "new_post"
  | "notice"
  | "comment"
  | "like"
  | "match_schedule"
  | "team_change"
  | "coach_note"
  | "match_comment"
  | "match_comment_like"
  | "coach_comment"
  | "coach_comment_like"
  | "signup_pending"
  | "new_member";

type RecordPayload = {
  title: string;
  body?: string;
  url?: string;
};

/** 지정한 회원들에게 인앱 알림을 한 건씩 기록. teamId 는 새소식 팀 필터용 라벨. */
export async function recordForUsers(
  userIds: string[],
  type: NotificationType,
  payload: RecordPayload,
  teamId?: string,
): Promise<void> {
  // 개발 모드(NEXT_PUBLIC_DEV_TOOLS=1)에서는 인앱 알림(새소식)도 기록하지 않는다.
  // (프로덕션엔 이 값이 없어 정상 기록된다.)
  if (process.env.NEXT_PUBLIC_DEV_TOOLS === "1") {
    console.log(`[notif][dev] DEV_TOOLS=1 — 인앱 알림 기록 생략: ${type}`);
    return;
  }
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return;
  const admin = createAdminClient();
  const rows = ids.map((uid) => ({
    user_id: uid,
    team_id: teamId ?? DEFAULT_TEAM_ID,
    type,
    title: payload.title,
    body: payload.body ?? null,
    url: payload.url ?? "/",
  }));
  const { error } = await admin.from("notifications").insert(rows);
  if (error) {
    console.error("[notif] 인앱 알림 기록 실패", error.message);
  }
}

/** 전체 회원(작성자/본인 제외)에게 인앱 알림 기록 — 브로드캐스트 알림용. */
export async function recordForAll(
  excludeUserId: string | null,
  type: NotificationType,
  payload: RecordPayload,
): Promise<void> {
  const admin = createAdminClient();
  let query = admin.from("profiles").select("id").is("deleted_at", null);
  if (excludeUserId) query = query.neq("id", excludeUserId);
  const { data, error } = await query;
  if (error) {
    console.error("[notif] 전체 회원 조회 실패", error.message);
    return;
  }
  const ids = (data ?? []).map((r) => r.id as string);
  await recordForUsers(ids, type, payload);
}
