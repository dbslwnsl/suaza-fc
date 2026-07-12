"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import {
  createTeam,
  requestJoinByCode,
  requestJoinTeam,
} from "@/lib/teams/onboarding-actions";

export type TeamOption = {
  id: string;
  name: string;
  emblem_url: string | null;
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
  const [code, setCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newRegion, setNewRegion] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // redirect() 는 정상 흐름에서 throw 되므로, 반환값(Result)이 있을 때만 처리.
  const run = (
    fn: () => Promise<{ ok: boolean; error?: string } | never>,
    onSuccess?: () => void,
  ) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res && !res.ok) setError(res.error ?? "처리에 실패했습니다");
        else if (res && res.ok) onSuccess?.();
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
      {message && (
        <p className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">
          {message}
        </p>
      )}

      {/* ── 팀 목록에서 선택 ── */}
      {teams.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-bold text-suaza-ink">팀 목록에서 선택</h2>
          <div className="flex flex-col divide-y divide-suaza-border rounded-xl border border-suaza-border overflow-hidden">
            {teams.map((t) => {
              const active = selected === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(active ? null : t.id)}
                  className={`flex items-center gap-3 px-4 py-3 text-left transition ${
                    active ? "bg-suaza-bg" : "bg-white hover:bg-suaza-bg/50"
                  }`}
                >
                  <TeamEmblem team={t} />
                  <span className="min-w-0 flex-1 truncate font-medium text-suaza-ink">
                    {t.name}
                  </span>
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

      <div aria-hidden className="h-px bg-suaza-border" />

      {/* ── 새 팀 만들기 (신청 → 플랫폼 관리자 승인 후 시작) ── */}
      <section className="flex flex-col gap-3">
        <h2 className="font-bold text-suaza-ink">새 팀 만들기</h2>
        <p className="text-xs text-suaza-ink-muted -mt-1">
          신청하면 관리자 승인 후 회장으로 시작합니다. 팀 이름·엠블럼은
          나중에 바꿀 수 있어요.
        </p>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="팀 이름 (필수, 20자 이내)"
          maxLength={20}
          className="w-full px-3 py-2 rounded-lg border border-suaza-border text-sm focus:outline-none focus:border-suaza-button"
        />
        <input
          value={newRegion}
          onChange={(e) => setNewRegion(e.target.value)}
          placeholder="활동 지역 (선택 — 예: 서울 강서구)"
          maxLength={30}
          className="w-full px-3 py-2 rounded-lg border border-suaza-border text-sm focus:outline-none focus:border-suaza-button"
        />
        <textarea
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="팀 소개 (선택 — 어떤 팀인지 간단히, 100자 이내)"
          maxLength={100}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-suaza-border text-sm focus:outline-none focus:border-suaza-button resize-none"
        />
        <button
          type="button"
          disabled={!newName.trim() || isPending}
          onClick={() =>
            run(
              () => createTeam(newName, newRegion, newDescription),
              () => {
                setMessage(
                  "팀 생성 신청이 접수되었습니다. 승인되면 알림으로 알려드리고, 홈 상단 팀 전환에 나타납니다.",
                );
                setNewName("");
                setNewRegion("");
                setNewDescription("");
              },
            )
          }
          className="self-end px-4 py-2 rounded-lg bg-suaza-accent text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          팀 생성 신청
        </button>
      </section>
    </div>
  );
}
