"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import {
  requestJoinByCode,
  requestJoinTeam,
} from "@/lib/teams/onboarding-actions";

export type TeamOption = {
  id: string;
  name: string;
  emblem_url: string | null;
  region: string | null;
  description: string | null;
  memberCount: number;
};

function TeamEmblem({ team }: { team: TeamOption }) {
  if (team.emblem_url) {
    return (
      <div className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0">
        <Image
          src={team.emblem_url}
          alt={team.name}
          fill
          sizes="36px"
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className="w-9 h-9 rounded-lg bg-suaza-button text-white font-bold flex items-center justify-center shrink-0"
      aria-hidden
    >
      {team.name.charAt(0)}
    </div>
  );
}

export default function OnboardingForm({ teams }: { teams: TeamOption[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // redirect() 는 정상 흐름에서 throw 되므로, 반환값(Result)이 있을 때만 처리.
  const run = (fn: () => Promise<{ ok: boolean; error?: string } | never>) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res && !res.ok) setError(res.error ?? "처리에 실패했습니다");
      } catch (e) {
        if (
          e instanceof Error &&
          /NEXT_REDIRECT/.test(String((e as Error).message))
        ) {
          return; // 정상 리다이렉트
        }
        setError("처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>
      )}

      {/* ── 팀 목록에서 선택 ── */}
      {teams.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-bold text-suaza-ink">팀 목록에서 선택</h2>

          {/* 지역 필터 칩 */}
          {(() => {
            const regions = [
              ...new Set(
                teams
                  .map((t) => t.region)
                  .filter((r): r is string => !!r && r.trim() !== ""),
              ),
            ].sort((a, b) => a.localeCompare(b, "ko"));
            if (regions.length === 0) return null;
            return (
              <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
                {[null, ...regions].map((r) => {
                  const active = regionFilter === r;
                  return (
                    <button
                      key={r ?? "전체"}
                      type="button"
                      onClick={() => {
                        setRegionFilter(r);
                        setSelected(null);
                      }}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition shrink-0 ${
                        active
                          ? "bg-suaza-ink text-white border border-suaza-ink"
                          : "bg-white text-suaza-ink border border-suaza-border hover:bg-gray-100"
                      }`}
                    >
                      {r ?? "전체"}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          <div className="flex flex-col divide-y divide-suaza-border rounded-xl border border-suaza-border overflow-hidden">
            {teams
              .filter((t) => !regionFilter || t.region === regionFilter)
              .map((t) => {
                const active = selected === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelected(active ? null : t.id)}
                    className={`flex items-start gap-3 px-4 py-3 text-left transition ${
                      active ? "bg-suaza-bg" : "bg-white hover:bg-suaza-bg/50"
                    }`}
                  >
                    <TeamEmblem team={t} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 truncate font-medium text-suaza-ink">
                          {t.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-suaza-ink-faint">
                          {t.memberCount}명
                        </span>
                      </span>
                      {t.region && (
                        <span className="mt-0.5 block text-xs text-suaza-ink-muted">
                          {t.region}
                        </span>
                      )}
                      {t.description && (
                        <span className="mt-0.5 block text-[13px] text-suaza-ink-muted leading-snug line-clamp-2">
                          {t.description}
                        </span>
                      )}
                    </span>
                    {active && (
                      <svg
                        viewBox="0 0 24 24"
                        className="mt-1 h-4 w-4 shrink-0 text-suaza-button"
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
          <button
            type="button"
            disabled={!selected || isPending}
            onClick={() => selected && run(() => requestJoinTeam(selected))}
            className="self-end px-4 py-2 rounded-lg bg-suaza-button text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            가입 신청
          </button>
        </section>
      )}

      <div aria-hidden className="h-px bg-suaza-border" />

      {/* ── 초대코드로 가입 ── */}
      <section className="flex flex-col gap-3">
        <h2 className="font-bold text-suaza-ink">초대코드로 가입</h2>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="6자리 코드"
            maxLength={6}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-suaza-border text-sm tracking-widest uppercase focus:outline-none focus:border-suaza-button"
          />
          <button
            type="button"
            disabled={code.trim().length < 6 || isPending}
            onClick={() => run(() => requestJoinByCode(code))}
            className="shrink-0 px-4 py-2 rounded-lg bg-suaza-button text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            가입 신청
          </button>
        </div>
      </section>

    </div>
  );
}
