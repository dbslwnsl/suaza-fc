// SUAZA FC 웹 푸시 Service Worker
// 서버(web-push)가 보낸 push 이벤트를 받아 시스템 알림을 띄우고,
// 알림 클릭 시 해당 경로(data.url)로 이동/포커스한다.

// 새 버전 SW 가 즉시 활성화되도록 (디버깅/배포 갱신 편의)
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  console.log("[sw] push 이벤트 수신", event.data ? "(data 있음)" : "(data 없음)");

  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: "SUAZA FC", body: event.data.text() };
    }
  } else {
    // DevTools 의 빈 Push 버튼 테스트 대비 — 기본 알림 표시
    data = { title: "SUAZA FC", body: "테스트 푸시" };
  }

  const title = data.title || "SUAZA FC";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [100, 50, 100],
    // 알림 클릭 시 열 경로
    data: { url: data.url || "/" },
  };

  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .then(() => console.log("[sw] showNotification 성공:", title))
      .catch((err) => console.error("[sw] showNotification 실패:", err)),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // 이미 열린 탭이 있으면 그 탭으로 이동/포커스
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // navigate 실패(다른 origin 등)는 무시
            }
          }
          return;
        }
      }
      // 열린 탭이 없으면 새 창
      if (clients.openWindow) {
        await clients.openWindow(targetUrl);
      }
    })(),
  );
});
