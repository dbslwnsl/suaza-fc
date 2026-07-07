"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveJoinRequest,
  rejectJoinRequest,
} from "@/lib/teams/admin-actions";

export type JoinRequest = {
  teamId: string;
  userId: string;
  requestedAt: string;
  teamName: string;
  name: string;
  avatarUrl: string | null;
};

function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).format(d);
}

export default function RequestsList({
  requests,
  showTeamName,
}: {
  requests: JoinRequest[];
  showTeamName: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // 처리된 항목은 목록에서 낙관적으로 제거
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const keyOf = (r: JoinRequest) => `${r.teamId}:${r.userId}`;
  const visible = requests.filter((r) => !handled.has(keyOf(r)));

  const run = (
    r: JoinRequest,
    fn: (teamId: string, userId: string) => Promise<{ ok: boolean; error?: string }>,
  ) => {
    setError(null);
    setHandled((prev) => new Set(prev).add(keyOf(r)));
    startTransition(async () => {
      const res = await fn(r.teamId, r.userId);
      if (!res.ok) {
        setError(res.error ?? "처리에 실패했습니다");
        setHandled((prev) => {
          const next = new Set(prev);
          next.delete(keyOf(r));
          return next;
        });
        return;
      }
      router.refresh();
    });
  };

  if (visible.length === 0) {
    return (
      <p className="text-sm text-suaza-ink-muted py-8 text-center">
        대기 중인 가입 신청이 없습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>
      )}
      <ul className="flex flex-col divide-y divide-suaza-border">
        {visible.map((r) => (
          <li
            key={keyOf(r)}
            className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
              {r.avatarUrl ? (
                <Image
                  src={r.avatarUrl}
                  alt={r.name}
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              ) : (
                <span className="font-bold text-suaza-ink">
                  {r.name.charAt(0)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-suaza-ink text-[15px] truncate">
                {r.name}
              </p>
              <p className="text-xs text-suaza-ink-muted">
                {showTeamName && (
                  <span className="font-medium">{r.teamName} · </span>
                )}
                {dateLabel(r.requestedAt)} 신청
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(r, rejectJoinRequest)}
                className="px-3 py-1.5 rounded-lg border border-suaza-border text-sm text-suaza-ink-muted hover:bg-gray-50 transition disabled:opacity-40"
              >
                거절
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(r, approveJoinRequest)}
                className="px-3 py-1.5 rounded-lg bg-suaza-button text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40"
              >
                승인
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
