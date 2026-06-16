"use client";

import { useTransition } from "react";
import {
  MEMBER_TITLES,
  TITLE_BADGE,
  TITLE_LABEL,
  type MemberTitle,
} from "@/lib/members/positions";
import { setMemberTitle } from "./actions";

// 회장 전용 — 다른 회원에게 직책을 부여한다. (회원삭제 버튼 바로 위에 표시)
export default function MemberTitleEditor({
  profileId,
  currentTitle,
  name,
}: {
  profileId: string;
  currentTitle: MemberTitle;
  name: string;
}) {
  const [isPending, startTransition] = useTransition();

  const pick = (t: MemberTitle) => {
    if (isPending || t === currentTitle) return;
    // 회장 이양 — 본인이 회원으로 강등되므로 확인 + 경고
    if (t === "president") {
      const ok = window.confirm(
        `${name} 님을 회장으로 지정하시겠습니까?\n\n` +
          `· 회장은 1명만 유지됩니다.\n` +
          `· 지정과 동시에 당신의 직책은 '회원'으로 변경되고 매니저 권한도 해제됩니다.\n` +
          `· 이 작업 후에는 직책 부여를 더 이상 할 수 없습니다.`,
      );
      if (!ok) return;
    }
    startTransition(() => setMemberTitle(profileId, t));
  };

  return (
    <div className="mt-2 rounded-xl border border-suaza-border p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-suaza-ink">직책 부여</span>
        <span className="text-xs text-suaza-ink-muted">현재</span>
        <span
          className={`text-[11px] leading-none px-2 py-1 rounded-full ${
            TITLE_BADGE[currentTitle] ?? TITLE_BADGE.player
          }`}
        >
          {TITLE_LABEL[currentTitle] ?? currentTitle}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {MEMBER_TITLES.map((t) => {
          const active = t === currentTitle;
          return (
            <button
              key={t}
              type="button"
              onClick={() => pick(t)}
              disabled={isPending || active}
              aria-pressed={active}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition disabled:cursor-default ${
                active
                  ? "border-suaza-ink bg-suaza-ink text-white"
                  : "border-suaza-border text-suaza-ink hover:bg-gray-50 disabled:opacity-50"
              }`}
            >
              {TITLE_LABEL[t]}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-suaza-accent">
        ⚠ <span className="font-medium">회장</span>을 부여하면 본인의 직책이
        ‘회원’으로 변경되고 매니저 권한도 해제됩니다. (회장은 1명만 유지)
      </p>
    </div>
  );
}
