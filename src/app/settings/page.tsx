import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// 설정 메뉴 — 리스트로 항목을 보여주고, 한 뎁스 더 들어가면 각 관리 화면.
// 알림 설정은 모두에게, 기록 항목 관리는 감독(manager)에게만 노출한다.
type MenuItem = { href: string; label: string; icon: React.ReactNode };

const BellIcon = (
  <svg
    viewBox="0 0 24 24"
    className="h-[18px] w-[18px]"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const BarsIcon = (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
    <rect x="3" y="13" width="4.5" height="8" rx="1" />
    <rect x="9.75" y="8" width="4.5" height="13" rx="1" />
    <rect x="16.5" y="4" width="4.5" height="17" rx="1" />
  </svg>
);

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isManager = me?.role === "manager";

  const menu: MenuItem[] = [
    { href: "/settings/notifications", label: "알림 설정", icon: BellIcon },
    // 기록 항목 관리는 감독/회장만
    ...(isManager
      ? [{ href: "/settings/stats", label: "기록 항목 관리", icon: BarsIcon }]
      : []),
  ];

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            설정
          </h1>
        </header>

        <nav className="flex flex-col divide-y divide-suaza-border overflow-hidden rounded-xl border border-suaza-border">
          {menu.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-gray-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-suaza-button/10 text-suaza-button">
                {item.icon}
              </span>
              <span className="min-w-0 truncate text-sm font-bold text-suaza-ink">
                {item.label}
              </span>
              <svg
                viewBox="0 0 24 24"
                className="ml-auto h-4 w-4 shrink-0 text-suaza-ink-faint"
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
