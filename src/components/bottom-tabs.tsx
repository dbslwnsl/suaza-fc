"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const HIDE_ON = ["/login", "/signup", "/auth"];

type TabDef = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.JSX.Element;
  disabled?: boolean;
};

export default function BottomTabs({
  isManager,
  canOpenSettings = false,
}: {
  isManager: boolean;
  canOpenSettings?: boolean;
}) {
  const pathname = usePathname();
  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null;

  const tabs: TabDef[] = [
    { href: "/members", label: "회원명단", Icon: IconUsers },
    { href: "/matches", label: "일정&결과", Icon: IconCalendar },
    { href: "/", label: "홈", Icon: IconHome },
    { href: "/board", label: "게시판", Icon: IconBoard },
    {
      href: "/settings",
      label: isManager ? "감독설정" : "선수설정",
      Icon: IconGear,
      // 회장/감독만 활성화, 그 외는 비활성(준비 중)
      disabled: !canOpenSettings,
    },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <>
      {/* 탭이 콘텐츠를 가리지 않도록 spacer */}
      <div aria-hidden className="h-[64px] shrink-0" />
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-suaza-border z-50">
        <ul className="grid grid-cols-5 max-w-[600px] mx-auto">
          {tabs.map((t) => {
            const active = isActive(t.href);
            if (t.disabled) {
              return (
                <li key={t.href}>
                  <span
                    aria-disabled
                    title="준비 중"
                    className="flex flex-col items-center justify-center gap-1 py-2.5 text-suaza-ink-faint opacity-50 cursor-not-allowed"
                  >
                    <t.Icon className="w-5 h-5" />
                    <span className="text-[11px] font-medium">{t.label}</span>
                  </span>
                </li>
              );
            }
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className={`flex flex-col items-center justify-center gap-1 py-2.5 transition ${
                    active
                      ? "text-suaza-button"
                      : "text-suaza-ink-muted hover:text-suaza-ink"
                  }`}
                >
                  <t.Icon className="w-5 h-5" />
                  <span className="text-[11px] font-medium">{t.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconHome({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconBoard({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}

function IconGear({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
