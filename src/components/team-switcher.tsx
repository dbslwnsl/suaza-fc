"use client";

// 홈 상단 팀이름 — 멀티팀 Phase 3.
// 소속 팀이 2개 이상이면 탭해서 팀 전환 시트(앱 공통 스타일)를 연다.
import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { setCurrentTeam } from "@/lib/teams/actions";

export type SwitcherTeam = {
  id: string;
  name: string;
  emblem_url: string | null;
};

function Emblem({
  team,
  size,
}: {
  team: SwitcherTeam;
  size: number;
}) {
  if (team.emblem_url) {
    return (
      <div
        className="relative rounded-lg overflow-hidden shrink-0"
        style={{ width: size, height: size }}
      >
        <Image
          src={team.emblem_url}
          alt={team.name}
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className="rounded-lg bg-suaza-button text-white font-bold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      aria-hidden
    >
      {team.name.charAt(0)}
    </div>
  );
}

export default function TeamSwitcher({
  current,
  teams,
}: {
  current: SwitcherTeam;
  teams: SwitcherTeam[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // 팀이 2개 이상일 때만 전환 시트 — 팀 만들기/참여 진입은 설정 메뉴에서.
  const switchable = teams.length > 1;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const pick = (id: string) => {
    setOpen(false);
    if (id === current.id) return;
    startTransition(async () => {
      const res = await setCurrentTeam(id);
      if (res.ok) router.refresh();
    });
  };

  const inner = (
    <>
      <Emblem team={current} size={28} />
      <span className="font-bold text-suaza-ink text-2xl sm:text-[28px]">
        {current.name}
      </span>
      {switchable && (
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4 shrink-0 text-suaza-ink-faint"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      )}
    </>
  );

  return (
    <>
      {switchable ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={isPending}
          className={`flex items-center gap-2.5 transition hover:opacity-80 ${
            isPending ? "opacity-50" : ""
          }`}
          aria-label="팀 전환"
        >
          {inner}
        </button>
      ) : (
        <div className="flex items-center gap-2.5">{inner}</div>
      )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black/40 flex items-end sm:items-center justify-center"
            role="dialog"
            aria-modal="true"
            onClick={() => setOpen(false)}
          >
            <div
              className="bg-white w-full sm:max-w-md mb-2 sm:mb-0 rounded-2xl shadow-xl max-h-[70vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 pt-4 pb-3 border-b border-suaza-border shrink-0">
                <h3 className="text-base font-bold text-suaza-ink">팀 전환</h3>
                <p className="text-xs text-suaza-ink-muted mt-0.5">
                  보고 싶은 팀을 선택하세요.
                </p>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-suaza-border/60">
                {teams.map((t) => {
                  const active = t.id === current.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pick(t.id)}
                      className={`flex w-full items-center gap-3 px-5 py-3 text-left text-sm transition hover:bg-suaza-bg ${
                        active ? "font-bold" : ""
                      } text-suaza-ink`}
                    >
                      <Emblem team={t} size={32} />
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      {active && (
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4 shrink-0 text-suaza-button"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>

            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
