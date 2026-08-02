import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeam, isPlatformAdmin } from "@/lib/teams/context";
import { logout } from "@/lib/auth/actions";

// 설정 메뉴 — 새소식 리스트와 동일 스타일(좌측 색 세로바 + 구분선, 카드 없음).
// 알림 설정은 모두에게, 기록 항목 관리는 감독(manager)에게만 노출한다.
type MenuItem = { href: string; label: string; color: string };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // 현재 팀의 매니저(회장·감독)에게만 가입 신청 관리 노출
  const isTeamManager = (await getCurrentTeam())?.role === "manager";
  // 플랫폼 관리자 — 전체 팀 관리 메뉴
  const isAdmin = await isPlatformAdmin();

  const menu: MenuItem[] = [
    { href: "/settings/notifications", label: "알림 설정", color: "#3B82F6" },
    // 기록 항목 관리: 모두 열람, 수정은 회장·감독만 (페이지 내부에서 분기)
    { href: "/settings/stats", label: "기록 항목 관리", color: "#33BD73" },
    ...(isTeamManager
      ? [
          {
            href: "/settings/team",
            label: "팀 설정",
            color: "#6366F1",
          },
          {
            href: "/admin/join-requests",
            label: "가입 신청 관리",
            color: "#EF3E3E",
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            href: "/admin/teams",
            label: "팀 관리 (플랫폼)",
            color: "#0EA5E9",
          },
        ]
      : []),
    // 팀 가입 번호(초대코드)로 다른 팀에 추가 가입 신청 — 로그아웃 바로 위
    { href: "/settings/join-team", label: "팀 추가 가입", color: "#F59E0B" },
  ];

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex items-center gap-3">
          {/* 탭 아이콘들과 동일한 스트로크 SVG 스타일의 톱니바퀴 */}
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
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
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

        {/* 로그아웃 — 메뉴 아래 구분선 뒤 */}
        <div aria-hidden className="h-px bg-suaza-border" />
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-stretch gap-3 text-left transition hover:opacity-70"
          >
            <span
              aria-hidden
              className="w-1 shrink-0 self-stretch rounded-full bg-gray-300"
            />
            <span className="min-w-0 flex-1 self-center text-sm font-bold text-suaza-ink-muted py-0.5">
              로그아웃
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
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </form>
      </div>
    </main>
  );
}
