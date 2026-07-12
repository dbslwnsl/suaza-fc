// 알림 트리거 — 발송 "대상"을 한곳에서 결정한다.
//
// 각 트리거는 두 가지를 수행한다:
//   1) 인앱 알림(새소식 수신함) 기록 — 실제 수신자 기준.
//   2) 푸시(OS 알림) 발송 — 실제 수신자 전원에게.
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

/** 새 경기 일정 — 전체 회원(작성자 제외) */
export async function notifyNewMatch(payload: PushPayload, actorId: string) {
  await recordForAll(actorId, "match_schedule", payload);
  return sendPushToAll(payload, actorId);
}

/** 새 게시글 — 전체 회원(작성자 제외) */
export async function notifyNewPost(payload: PushPayload, actorId: string) {
  await recordForAll(actorId, "new_post", payload);
  return sendPushToAll(payload, actorId);
}

/** 새 공지 — 전체 회원(작성자 제외) */
export async function notifyNotice(payload: PushPayload, actorId: string) {
  await recordForAll(actorId, "notice", payload);
  return sendPushToAll(payload, actorId);
}

/** 내 댓글에 달린 답글 — 부모 댓글 작성자에게 */
export async function notifyReply(payload: PushPayload, targetUserId: string) {
  await recordForUsers([targetUserId], "comment", payload);
  return sendPushToUsers([targetUserId], payload);
}

/** 내 게시글에 달린 댓글 — 원 글 작성자에게 */
export async function notifyPostComment(
  payload: PushPayload,
  postAuthorId: string,
) {
  await recordForUsers([postAuthorId], "comment", payload);
  return sendPushToUsers([postAuthorId], payload);
}

/** 내 게시글·댓글에 달린 좋아요 — 글/댓글 작성자 본인에게 */
export async function notifyLike(payload: PushPayload, targetUserId: string) {
  await recordForUsers([targetUserId], "like", payload);
  return sendPushToUsers([targetUserId], payload);
}

/** 팀 편성/변경 — 배정된 선수 본인에게 */
export async function notifyTeamChange(payload: PushPayload, playerId: string) {
  await recordForUsers([playerId], "team_change", payload);
  return sendPushToUsers([playerId], payload);
}

/** 감독 전달사항(경기 메모) 등록·수정 — 전체 회원(작성자 제외) */
export async function notifyCoachNote(payload: PushPayload, actorId: string) {
  await recordForAll(actorId, "coach_note", payload);
  return sendPushToAll(payload, actorId);
}

/** 경기 상세 새 댓글(최상위) — 전체 회원(작성자 제외) */
export async function notifyNewMatchComment(
  payload: PushPayload,
  actorId: string,
) {
  await recordForAll(actorId, "match_comment", payload);
  return sendPushToAll(payload, actorId);
}

/** 내 경기 댓글에 달린 답글 — 부모 댓글 작성자에게 */
export async function notifyMatchCommentReply(
  payload: PushPayload,
  targetUserId: string,
) {
  await recordForUsers([targetUserId], "match_comment", payload);
  return sendPushToUsers([targetUserId], payload);
}

/** 내 경기 댓글에 달린 좋아요 — 댓글 작성자에게 */
export async function notifyMatchCommentLike(
  payload: PushPayload,
  targetUserId: string,
) {
  await recordForUsers([targetUserId], "match_comment_like", payload);
  return sendPushToUsers([targetUserId], payload);
}

/** 내 카드에 달린 감독·코치 코멘트(경기·프로필) — 해당 선수 본인에게 */
export async function notifyCoachComment(
  payload: PushPayload,
  memberId: string,
) {
  await recordForUsers([memberId], "coach_comment", payload);
  return sendPushToUsers([memberId], payload);
}

/** 내 감독·코치 코멘트에 달린 답글 — 부모 코멘트 작성자에게 */
export async function notifyCoachCommentReply(
  payload: PushPayload,
  targetUserId: string,
) {
  await recordForUsers([targetUserId], "coach_comment", payload);
  return sendPushToUsers([targetUserId], payload);
}

/** 내 감독·코치 코멘트에 달린 좋아요 — 코멘트 작성자에게 */
export async function notifyCoachCommentLike(
  payload: PushPayload,
  targetUserId: string,
) {
  await recordForUsers([targetUserId], "coach_comment_like", payload);
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
