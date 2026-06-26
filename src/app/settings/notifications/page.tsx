import { createClient } from "@/lib/supabase/server";
import NotificationSettings from "./notification-settings-client";

// 알림(푸시) 설정 전용 페이지 — 모든 로그인 회원 대상.
// 설정(/settings) 메뉴에서 진입한다.
export default async function NotificationSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex items-center gap-3">
          <svg
            className="w-9 h-9 text-suaza-ink shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            알림 설정
          </h1>
        </header>

        <NotificationSettings />
      </div>
    </main>
  );
}
