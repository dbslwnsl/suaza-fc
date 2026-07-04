"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  MEMBER_TITLES,
  TITLE_LABEL,
  type MemberTitle,
} from "@/lib/members/positions";
import { devSetMyRoleTitle } from "@/lib/dev/actions";

/**
 * 개발 전용 직책 전환기 — 한 계정으로 로그인한 채 직책/권한을 바꿔 테스트.
 * NEXT_PUBLIC_DEV_TOOLS=1 일 때만 layout 에서 렌더된다.
 */
export default function DevRoleSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pick = (title: MemberTitle) => {
    if (pending || title === current) return;
    setOpen(false); // 선택하면 펼쳐진 패널을 닫는다
    setError(null);
    startTransition(async () => {
      const r = await devSetMyRoleTitle(title);
      if (r.ok) router.refresh();
      else setError(r.error ?? "알 수 없는 오류");
    });
  };

  return (
    <div className="fixed bottom-20 left-3 z-[200] flex flex-col items-start gap-1">
      {open && (
        <div className="flex flex-col gap-1 rounded-xl border border-amber-400 bg-white p-2 shadow-xl">
          <span className="px-1 text-[10px] font-bold text-amber-600">
            DEV · 직책 전환
          </span>
          {MEMBER_TITLES.map((t) => {
            const active = t === current;
            return (
              <button
                key={t}
                type="button"
                onClick={() => pick(t)}
                disabled={pending}
                className={`text-left text-xs px-2 py-1 rounded-md transition disabled:opacity-50 ${
                  active
                    ? "bg-amber-500 text-white font-bold"
                    : "text-suaza-ink hover:bg-amber-50"
                }`}
              >
                {TITLE_LABEL[t]}
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-700 shadow-lg"
        title="개발 전용 직책 전환"
      >
        🛠 {TITLE_LABEL[current as MemberTitle] ?? current}
        {pending && <span className="animate-pulse">…</span>}
      </button>
      {error && (
        <p className="max-w-[240px] rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-[11px] leading-snug text-red-700 shadow">
          {error}
        </p>
      )}
    </div>
  );
}
