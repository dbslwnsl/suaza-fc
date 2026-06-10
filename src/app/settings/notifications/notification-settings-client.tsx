"use client";

import dynamic from "next/dynamic";

// 알림 설정 토글은 기기 상태(브라우저 구독 + localStorage)에 의존한다.
// 서버에서 기본값으로 렌더되면 첫 페인트에 OFF 가 보였다가 켜지는 깜빡임이 생기므로,
// ssr:false 로 클라이언트에서만 렌더해 첫 렌더부터 실제 상태를 표시한다.
const NotificationSettings = dynamic(() => import("./notification-settings"), {
  ssr: false,
  loading: () => <SettingsSkeleton />,
});

// 로딩 중 레이아웃 흔들림 방지용 자리표시(토글 위치는 비워둠 — 잘못된 ON/OFF 를 보이지 않게).
function SettingsSkeleton() {
  return (
    <div className="mt-3 mx-4 h-[71px] rounded-2xl border border-suaza-border/60 bg-white animate-pulse" />
  );
}

export default function NotificationSettingsClient() {
  return <NotificationSettings />;
}
