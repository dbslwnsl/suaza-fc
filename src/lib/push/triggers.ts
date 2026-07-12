// 알림 트리거 — 발송 "대상"을 한곳에서 결정한다.
//
// 각 트리거는 두 가지를 수행한다:
//   1) 인앱 알림(새소식 수신함) 기록 — 실제 수신자 기준.
//   2) 푸시(OS 알림) 발송 — 실제 수신자 전원에게.
//
// 멀티팀: 브로드캐스트 트리거는 teamId 필수 — "그 팀 멤버 전원"에게만 발송.
//   개인 대상 트리거의 teamId 는 새소식 팀 필터용 라벨(생략 시 수아자 폴백).
//
// 주의: 이 모듈은 서버 전용(send.ts → web-push/service_role, record.ts → admin).
//       클라이언트 import 금지.

import {
  sendPushToAll,
  sendPushToUsers,
  type PushPayload,
} from "./send";
import { recordForAll, recordForUsers } from "@/lib/notifications/record";
import { createAdminClient } from "@/lib/supabase/admin";

/** 새 경기 일정 — 그 팀 전체 멤버(작성자 제외) */
export async function notifyNewMatch(
  payload: PushPayload,
  actorId: string,
  teamId: string,
) {
  await recordForAll(actorId, "match_schedule", payload, teamId);
  return sendPushToAll(payload, actorId, teamId);
}

/** 새 게시글 — 그 팀 전체 멤버(작성자 제외) */
export async function notifyNewPost(
  payload: PushPayload,
  actorId: string,
  teamId: string,
) {
  await recordForAll(actorId, "new_post", payload, teamId);
  return sendPushToAll(payload, actorId, teamId);
}

/** 새 공지 — 그 팀 전체 멤버(작성자 제외) */
export async function notifyNotice(
  payload: PushPayload,
  actorId: string,
  teamId: string,
) {
  await recordForAll(actorId, "notice", payload, teamId);
  return sendPushToAll(payload, actorId, teamId);
}

/** 내 댓글에 달린 답글 — 부모 댓글 작성자에게 */
export async function notifyReply(
  payload: PushPayload,
  targetUserId: string,
  teamId?: string,
) {
  await recordForUsers([targetUserId], "comment", payload, teamId);
  return sendPushToUsers([targetUserId], payload);
}

/** 내 게시글에 달린 댓글 — 원 글 작성자에게 */
export async function notifyPostComment(
  payload: PushPayload,
  postAuthorId: string,
  teamId?: string,
) {
  await recordForUsers([postAuthorId], "comment", payload, teamId);
  return sendPushToUsers([postAuthorId], payload);
}

/** 내 게시글·댓글에 달린 좋아요 — 글/댓글 작성자 본인에게 */
export async function notifyLike(
  payload: PushPayload,
  targetUserId: string,
  teamId?: string,
) {
  await recordForUsers([targetUserId], "like", payload, teamId);
  return sendPushToUsers([targetUserId], payload);
}

/** 팀 편성/변경 — 배정된 선수 본인에게 */
export async function notifyTeamChange(
  payload: PushPayload,
  playerId: string,
  teamId?: string,
) {
  await recordForUsers([playerId], "team_change", payload, teamId);
  return sendPushToUsers([playerId], payload);
}

/** 감독 전달사항(경기 메모) 등록·수정 — 그 팀 전체 멤버(작성자 제외) */
export async function notifyCoachNote(
  payload: PushPayload,
  actorId: string,
  teamId: string,
) {
  await recordForAll(actorId, "coach_note", payload, teamId);
  return sendPushToAll(payload, actorId, teamId);
}

/** 경기 상세 새 댓글(최상위) — 그 팀 전체 멤버(작성자 제외) */
export async function notifyNewMatchComment(
  payload: PushPayload,
  actorId: string,
  teamId: string,
) {
  await recordForAll(actorId, "match_comment", payload, teamId);
  return sendPushToAll(payload, actorId, teamId);
}

/** 내 경기 댓글에 달린 답글 — 부모 댓글 작성자에게 */
export async function notifyMatchCommentReply(
  payload: PushPayload,
  targetUserId: string,
  teamId?: string,
) {
  await recordForUsers([targetUserId], "match_comment", payload, teamId);
  return sendPushToUsers([targetUserId], payload);
}

/** 내 경기 댓글에 달린 좋아요 — 댓글 작성자에게 */
export async function notifyMatchCommentLike(
  payload: PushPayload,
  targetUserId: string,
  teamId?: string,
) {
  await recordForUsers([targetUserId], "match_comment_like", payload, teamId);
  return sendPushToUsers([targetUserId], payload);
}

/** 내 카드에 달린 감독·코치 코멘트(경기·프로필) — 해당 선수 본인에게 */
export async function notifyCoachComment(
  payload: PushPayload,
  memberId: string,
  teamId?: string,
) {
  await recordForUsers([memberId], "coach_comment", payload, teamId);
  return sendPushToUsers([memberId], payload);
}

/** 내 감독·코치 코멘트에 달린 답글 — 부모 코멘트 작성자에게 */
export async function notifyCoachCommentReply(
  payload: PushPayload,
  targetUserId: string,
  teamId?: string,
) {
  await recordForUsers([targetUserId], "coach_comment", payload, teamId);
  return sendPushToUsers([targetUserId], payload);
}

/** 내 감독·코치 코멘트에 달린 좋아요 — 코멘트 작성자에게 */
export async function notifyCoachCommentLike(
  payload: PushPayload,
  targetUserId: string,
  teamId?: string,
) {
  await recordForUsers([targetUserId], "coach_comment_like", payload, teamId);
  return sendPushToUsers([targetUserId], payload);
}

/** 팀 가입 신청 — 그 팀 매니저(회장·감독)들에게 */
export async function notifyTeamJoinRequest(
  payload: PushPayload,
  teamId: string,
) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("status", "active")
    .eq("role", "manager");
  if (error) {
    console.error("[notif] 팀 매니저 조회 실패", error.message);
    return;
  }
  const ids = (data ?? []).map((r) => r.user_id as string);
  await recordForUsers(ids, "signup_pending", payload, teamId);
  return sendPushToUsers(ids, payload);
}

/** 팀 가입 승인 완료 — 신청자 본인에게 */
export async function notifyJoinApproved(
  payload: PushPayload,
  userId: string,
  teamId: string,
) {
  await recordForUsers([userId], "new_member", payload, teamId);
  return sendPushToUsers([userId], payload);
}

/** 팀 생성 신청 — 플랫폼 관리자들에게 (인앱 라벨은 기본 팀 폴백) */
export async function notifyTeamCreateRequest(payload: PushPayload) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("is_platform_admin", true)
    .is("deleted_at", null);
  if (error) {
    console.error("[notif] 플랫폼 관리자 조회 실패", error.message);
    return;
  }
  const ids = (data ?? []).map((r) => r.id as string);
  await recordForUsers(ids, "signup_pending", payload);
  return sendPushToUsers(ids, payload);
}

/** 팀 생성 승인/거절 결과 — 신청자(창설자)에게 */
export async function notifyTeamDecision(
  payload: PushPayload,
  userId: string,
  teamId?: string,
) {
  await recordForUsers([userId], "new_member", payload, teamId);
  return sendPushToUsers([userId], payload);
}
