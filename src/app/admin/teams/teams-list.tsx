"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveTeam, rejectTeam } from "@/lib/teams/platform-actions";

export type AdminTeam = {
  id: string;
  name: string;
  status: string;
  region: string | null;
  description: string | null;
  createdAt: string;
  memberCount: number;
};

function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  }).format(d);
}

export default function TeamsAdminList({ teams }: { teams: AdminTeam[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "처리에 실패했습니다");
      router.refresh();
    });
  };

  const pending = teams.filter((t) => t.status === "pending");
  const active = teams.filter((t) => t.status === "active");


  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>
      )}

      {/* ── 승인 대기 ── */}
      <section className="flex flex-col gap-2">
        <h2 className="font-bold text-suaza-ink">
          승인 대기{" "}
          {pending.length > 0 && (
            <span className="text-suaza-accent">{pending.length}</span>
          )}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-suaza-ink-muted">
            대기 중인 팀 생성 신청이 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-suaza-border">
            {pending.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 py-3 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-suaza-ink">{t.name}</p>
                    <p className="text-xs text-suaza-ink-muted mt-0.5">
                      {t.region && <span>{t.region} · </span>}
                      {dateLabel(t.createdAt)} 신청
                    </p>
                    {t.description && (
                      <p className="text-[13px] text-suaza-ink-muted mt-1 leading-snug">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `"${t.name}" 팀 생성을 거절할까요? 신청이 삭제됩니다.`,
                          )
                        )
                          run(() => rejectTeam(t.id));
                      }}
                      className="px-3 py-1.5 rounded-lg border border-suaza-border text-sm text-suaza-ink-muted hover:bg-gray-50 transition disabled:opacity-40"
                    >
                      거절
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => approveTeam(t.id))}
                      className="px-3 py-1.5 rounded-lg bg-suaza-button text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40"
                    >
                      승인
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div aria-hidden className="h-px bg-suaza-border" />

      {/* ── 운영 중인 팀 ── */}
      <section className="flex flex-col gap-2">
        <h2 className="font-bold text-suaza-ink">
          운영 중인 팀{" "}
          <span className="text-suaza-ink-muted font-normal">
            {active.length}
          </span>
        </h2>
        <p className="text-xs text-suaza-ink-muted -mt-1">
          팀을 누르면 관리 화면(열람·회원 탈퇴·팀 삭제)으로 이동합니다.
        </p>
        <ul className="flex flex-col divide-y divide-suaza-border">
          {active.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => router.push(`/admin/teams/${t.id}`)}
                className="flex w-full items-center gap-3 py-3 first:pt-0 last:pb-0 text-left transition hover:opacity-70 disabled:opacity-40"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-suaza-ink truncate">{t.name}</p>
                  <p className="text-xs text-suaza-ink-muted mt-0.5">
                    멤버 {t.memberCount}명
                    {t.region && <span> · {t.region}</span>}
                    <span> · {dateLabel(t.createdAt)} 생성</span>
                  </p>
                </div>
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 shrink-0 text-suaza-ink-faint"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
