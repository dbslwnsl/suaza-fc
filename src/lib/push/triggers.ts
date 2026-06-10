// 알림 트리거 — 발송 "대상"을 한곳에서 결정한다.
//
// 각 트리거는 두 가지를 수행한다:
//   1) 인앱 알림(새소식 수신함) 기록 — 실제 수신자 기준으로 항상 남긴다.
//   2) 푸시(OS 알림) 발송 — ⚠️ 현재 [테스트 단계]라 회장(president)에게만 보낸다.
//      운영 전환 시 각 함수의 `sendPushToPresident(payload)` 를 주석의 "운영:" 줄로
//      교체하면 된다. (실제 대상 id 는 이미 인자로 받고 있어 한 줄 교체로 끝)
//
// 주의: 이 모듈은 서버 전용(send.ts → web-push/service_role, record.ts → admin).
//       클라이언트 import 금지.

import { sendPushToPresident, type PushPayload } from "./send";
import { recordForAll, recordForUsers } from "@/lib/notifications/record";

/** 새 경기 일정 — (운영) 전체 회원, 작성자 제외 */
export async function notifyNewMatch(payload: PushPayload, actorId: string) {
  await recordForAll(actorId, "match_schedule", payload);
  // 운영: return sendPushToAll(payload, actorId);
  return sendPushToPresident(payload);
}

/** 새 게시글 — (운영) 전체 회원, 작성자 제외 */
export async function notifyNewPost(payload: PushPayload, actorId: string) {
  await recordForAll(actorId, "new_post", payload);
  // 운영: return sendPushToAll(payload, actorId);
  return sendPushToPresident(payload);
}

/** 새 공지 — (운영) 전체 회원, 작성자 제외 */
export async function notifyNotice(payload: PushPayload, actorId: string) {
  await recordForAll(actorId, "notice", payload);
  // 운영: return sendPushToAll(payload, actorId);
  return sendPushToPresident(payload);
}

/** 내 댓글에 달린 답글 — (운영) 부모 댓글 작성자에게 */
export async function notifyReply(payload: PushPayload, targetUserId: string) {
  await recordForUsers([targetUserId], "comment", payload);
  // 운영: return sendPushToUsers([targetUserId], payload);
  return sendPushToPresident(payload);
}

/** 내 게시글에 달린 댓글 — (운영) 원 글 작성자에게 */
export async function notifyPostComment(
  payload: PushPayload,
  postAuthorId: string,
) {
  await recordForUsers([postAuthorId], "comment", payload);
  // 운영: return sendPushToUsers([postAuthorId], payload);
  return sendPushToPresident(payload);
}

/** 팀 편성/변경 — (운영) 배정된 선수 본인에게 */
export async function notifyTeamChange(payload: PushPayload, playerId: string) {
  await recordForUsers([playerId], "team_change", payload);
  // 운영: return sendPushToUsers([playerId], payload);
  return sendPushToPresident(payload);
}
