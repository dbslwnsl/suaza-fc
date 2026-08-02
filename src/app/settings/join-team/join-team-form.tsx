"use client";

import { useState, useTransition } from "react";
import { requestJoinByCode } from "@/lib/teams/onboarding-actions";

export default function JoinTeamForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await requestJoinByCode(code);
        if (res && !res.ok) {
          setError(res.error ?? "처리에 실패했습니다");
          return;
        }
        setMessage(
          "가입 신청이 접수되었습니다. 그 팀 회장의 승인 후 홈 상단 팀 전환에 나타납니다.",
        );
        setCode("");
      } catch (e) {
        if (
          e instanceof Error &&
          /NEXT_REDIRECT/.test(String((e as Error).message))
        ) {
          return; // 정상 리다이렉트 (무소속 회원 → 승인 대기 화면)
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
        <span className="text-xs text-suaza-ink-muted">팀 가입 번호</span>
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
            onClick={submit}
            className="shrink-0 px-4 py-2 rounded-lg bg-suaza-button text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            가입 신청
          </button>
        </div>
      </label>

      <p className="text-xs text-suaza-ink-faint">
        팀 가입 번호는 그 팀 회장이 설정 → 팀 설정에서 확인해 알려줄 수
        있어요.
      </p>
    </div>
  );
}
