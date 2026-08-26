// Expo Push Service 전송 계층.
//
// 왜 APNs/FCM 을 직접 부르지 않는가:
//   - APNs 는 .p8 키 + JWT 서명, FCM 은 서비스 계정 + OAuth 로 인증 방식이 완전히 다르다.
//   - Expo 에 한 번 보내면 토큰의 플랫폼을 보고 알아서 분배한다.
//   - 덕분에 iOS 를 나중에 붙여도 이 파일과 서버 발송 코드는 바뀌지 않는다.
//     (Apple Push Key 를 EAS 에 등록하는 것으로 끝)
//
// 주의: 서버 전용. 클라이언트에서 import 금지.

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

/** Expo 가 한 요청에 받는 메시지 상한. */
const BATCH_SIZE = 100;

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  /** Android 알림 채널 — 앱에서 만든 채널 id 와 일치해야 소리/중요도가 적용된다. */
  channelId?: string;
};

type ExpoTicket =
  | { status: "ok"; id: string }
  | {
      status: "error";
      message: string;
      details?: { error?: string };
    };

export type ExpoSendResult = {
  /** 더 이상 유효하지 않아 DB 에서 지워야 할 토큰들. */
  invalidTokens: string[];
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Expo Push Service 로 발송하고, 죽은 토큰 목록을 돌려준다.
 *
 * 티켓(ticket)은 "Expo 가 접수했다"는 뜻이지 "기기에 도착했다"는 뜻이 아니다.
 * 최종 결과는 receipt 를 따로 조회해야 알 수 있는데, 지금은 접수 단계에서
 * 확실히 판별되는 DeviceNotRegistered 만 처리한다. receipt 폴링은
 * 발송량이 늘어 실제 유실이 문제될 때 도입한다.
 */
export async function sendExpoPush(
  messages: ExpoMessage[],
): Promise<ExpoSendResult> {
  const invalidTokens: string[] = [];
  if (messages.length === 0) return { invalidTokens };

  // 푸시 보안(Enhanced Security)을 켠 프로젝트만 필요. 없으면 생략된다.
  const accessToken = process.env.EXPO_ACCESS_TOKEN;

  for (const batch of chunk(messages, BATCH_SIZE)) {
    let res: Response;
    try {
      res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {}),
        },
        body: JSON.stringify(batch),
      });
    } catch (err) {
      console.error("[push][expo] 요청 실패", err);
      continue;
    }

    if (!res.ok) {
      console.error(
        "[push][expo] HTTP",
        res.status,
        (await res.text()).slice(0, 300),
      );
      continue;
    }

    const json = (await res.json()) as { data?: ExpoTicket[] };
    const tickets = json.data ?? [];

    // 티켓은 보낸 순서대로 1:1 대응한다.
    tickets.forEach((ticket, i) => {
      if (ticket.status === "ok") return;

      const token = batch[i]?.to;
      const code = ticket.details?.error;

      if (code === "DeviceNotRegistered" && token) {
        // 앱 삭제/재설치 등으로 토큰이 무효화됨 → 정리 대상
        invalidTokens.push(token);
      } else {
        console.error("[push][expo] 발송 실패", code ?? "", ticket.message);
      }
    });
  }

  return { invalidTokens };
}
