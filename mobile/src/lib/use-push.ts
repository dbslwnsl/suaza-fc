import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { extractUrl, registerForPushNotifications } from "./push";

/**
 * 로그인 상태에서 푸시를 등록하고, 알림 탭을 라우팅으로 연결한다.
 * (app) 레이아웃에서 한 번만 호출한다.
 *
 * 등록 실패(권한 거부, EAS projectId 없음, 에뮬레이터 등)는 앱 동작을 막지 않는다.
 * 로그만 남기고 넘어간다 — 푸시는 부가 기능이지 진입 조건이 아니다.
 */
export function usePush() {
  const router = useRouter();
  // 콜드 스타트로 열린 알림을 두 번 처리하지 않도록 표시해 둔다.
  const handledColdStart = useRef(false);

  useEffect(() => {
    registerForPushNotifications().then((res) => {
      if (!res.ok) console.log("[push] 등록 안 됨:", res.reason);
    });
  }, []);

  useEffect(() => {
    // 앱이 떠 있는 동안 알림을 탭한 경우
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const url = extractUrl(response);
        if (url) router.push(url as never);
      },
    );

    // 알림을 탭해서 앱이 처음 켜진 경우 — 위 리스너로는 안 잡힌다.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response || handledColdStart.current) return;
      handledColdStart.current = true;
      const url = extractUrl(response);
      if (url) router.push(url as never);
    });

    return () => sub.remove();
  }, [router]);
}
