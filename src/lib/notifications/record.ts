// 주의: 서버 전용 (admin/service_role 사용). 클라이언트에서 import 금지.
// 인앱 알림(새소식) 수신함에 표시할 알림을 수신자별로 기록한다.
import { createAdminClient } from "@/lib/supabase/admin";

export type NotificationType =
  | "new_post"
  | "notice"
  | "comment"
  | "match_schedule"
  | "team_change";

type RecordPayload = {
  title: string;
  body?: string;
  url?: string;
};

/** 지정한 회원들에게 인앱 알림을 한 건씩 기록. */
export async function recordForUsers(
  userIds: string[],
  type: NotificationType,
  payload: RecordPayload,
): Promise<void> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return;
  const admin = createAdminClient();
  const rows = ids.map((uid) => ({
    user_id: uid,
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
