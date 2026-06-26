import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// 설정 메뉴 — 새소식 리스트와 동일 스타일(좌측 색 세로바 + 구분선, 카드 없음).
// 알림 설정은 모두에게, 기록 항목 관리는 감독(manager)에게만 노출한다.
type MenuItem = { href: string; label: string; color: string };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const menu: MenuItem[] = [
    { href: "/settings/notifications", label: "알림 설정", color: "#3B82F6" },
    // 기록 항목 관리: 모두 열람, 수정은 회장·감독만 (페이지 내부에서 분기)
    { href: "/settings/stats", label: "기록 항목 관리", color: "#33BD73" },
  ];

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            설정
          </h1>
        </header>

        <nav className="flex flex-col divide-y divide-suaza-border">
          {menu.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-stretch gap-3 py-3 first:pt-0 last:pb-0 transition hover:opacity-70"
            >
              {/* 좌측: 메뉴 색 세로바 (새소식 스타일) */}
              <span
                aria-hidden
                className="w-1 shrink-0 self-stretch rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="min-w-0 flex-1 self-center truncate text-sm font-bold text-suaza-ink">
                {item.label}
              </span>
              <svg
                viewBox="0 0 24 24"
                className="ml-auto h-4 w-4 shrink-0 self-center text-suaza-ink-faint"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
