import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/back-button";
import NotificationSettings from "./notification-settings";

// 알림(푸시) 설정 전용 페이지 — 모든 로그인 회원 대상.
// 홈 헤더의 종 아이콘에서 진입한다.
export default async function NotificationSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <main className="flex-1 bg-suaza-bg min-h-[100dvh]">
      <header className="sticky top-0 z-10 flex items-center justify-center h-14 bg-white border-b border-suaza-border">
        <BackButton
          label="‹"
          className="absolute left-1 flex items-center justify-center w-11 h-11 text-3xl leading-none text-suaza-ink hover:text-suaza-ink-muted"
        />
        <h1 className="text-lg font-bold text-suaza-ink">알림 설정</h1>
      </header>

      <div className="max-w-[600px] mx-auto pb-12">
        <NotificationSettings />
      </div>
    </main>
  );
}
