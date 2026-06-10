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

/** 팀 편성/변경 — 배정된 선수 본인에게 */
export async function notifyTeamChange(payload: PushPayload, playerId: string) {
  await recordForUsers([playerId], "team_change", payload);
  return sendPushToUsers([playerId], payload);
}
