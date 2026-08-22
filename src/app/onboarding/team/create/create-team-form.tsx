"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createTeam } from "@/lib/teams/onboarding-actions";

export default function CreateTeamForm({
  backHref,
  backLabel,
}: {
  /** 하단 돌아가기 버튼 — 기존 회원은 홈, 무소속 신규 가입자는 팀 선택 */
  backHref: string;
  backLabel: string;
}) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await createTeam(name, region, description);
        if (res && !res.ok) {
          setError(res.error ?? "처리에 실패했습니다");
          return;
        }
        // 기존 회원(다른 소속 있음) — 접수 안내. 신규 가입자는 액션이 승인 대기로 리다이렉트.
        setMessage(
          "팀 생성 신청이 접수되었습니다. 승인되면 알림으로 알려드리고, 홈 상단 팀 전환에 나타납니다.",
        );
        setName("");
        setRegion("");
        setDescription("");
      } catch (e) {
        if (
          e instanceof Error &&
          /NEXT_REDIRECT/.test(String((e as Error).message))
        ) {
          return; // 정상 리다이렉트 (신규 가입자 → 승인 대기 화면)
        }
        setError("처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>
      )}
      {message && (
        <p className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">
          {message}
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-suaza-ink-muted">팀 이름 (필수)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 수원삼성"
          maxLength={20}
          className="w-full px-3 py-2 rounded-lg border border-suaza-border text-sm focus:outline-none focus:border-suaza-button"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-suaza-ink-muted">활동 지역 (선택)</span>
        <input
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder="예: 서울 강서구"
          maxLength={30}
          className="w-full px-3 py-2 rounded-lg border border-suaza-border text-sm focus:outline-none focus:border-suaza-button"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-suaza-ink-muted">팀 소개 (선택)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="어떤 팀인지 간단히 소개해 주세요 (100자 이내)"
          maxLength={100}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-suaza-border text-sm focus:outline-none focus:border-suaza-button resize-none"
        />
      </label>

      <div className="flex items-center justify-end gap-2">
        <Link
          href={backHref}
          className="px-4 py-2 rounded-lg border border-suaza-border text-suaza-ink text-sm font-medium hover:bg-gray-50 transition"
        >
          {backLabel}
        </Link>
        <button
          type="button"
          disabled={!name.trim() || isPending}
          onClick={submit}
          className="px-4 py-2 rounded-lg bg-suaza-accent text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          팀 생성 신청
        </button>
      </div>
    </div>
  );
}
