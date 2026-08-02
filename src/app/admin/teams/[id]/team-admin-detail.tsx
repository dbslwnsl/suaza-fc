"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCurrentTeam } from "@/lib/teams/actions";
import {
  deleteTeam,
  removeTeamMember,
} from "@/lib/teams/platform-actions";
import { TITLE_LABEL, type MemberTitle } from "@/lib/members/positions";

export type AdminMember = {
  userId: string;
  role: string;
  title: string;
  status: string;
  joinedAt: string;
  name: string;
  avatarUrl: string | null;
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

export default function TeamAdminDetail({
  teamId,
  teamName,
  members,
}: {
  teamId: string;
  teamName: string;
  members: AdminMember[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // 탈퇴 처리된 멤버는 목록에서 낙관적으로 제거
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const view = () => {
    setError(null);
    startTransition(async () => {
      const res = await setCurrentTeam(teamId);
      if (!res.ok) return setError(res.error ?? "열람에 실패했습니다");
      router.push("/");
    });
  };

  const remove = (m: AdminMember) => {
    if (!confirm(`${m.name} 님을 "${teamName}" 팀에서 탈퇴시킬까요?`)) return;
    setError(null);
    setRemoved((prev) => new Set(prev).add(m.userId));
    startTransition(async () => {
      const res = await removeTeamMember(teamId, m.userId);
      if (!res.ok) {
        setError(res.error ?? "탈퇴 처리에 실패했습니다");
        setRemoved((prev) => {
          const next = new Set(prev);
          next.delete(m.userId);
          return next;
        });
        return;
      }
      router.refresh();
    });
  };

  const destroy = () => {
    const typed = prompt(
      `팀을 삭제하면 경기·게시글·기록 등 모든 데이터가 영구 삭제됩니다.\n삭제하려면 팀 이름을 정확히 입력하세요: ${teamName}`,
    );
    if (typed === null) return;
    if (typed.trim() !== teamName) {
      setError("팀 이름이 일치하지 않아 삭제를 취소했습니다.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteTeam(teamId);
      if (!res.ok) return setError(res.error ?? "팀 삭제에 실패했습니다");
      router.push("/admin/teams");
      router.refresh();
    });
  };

  const visible = members.filter((m) => !removed.has(m.userId));

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>
      )}

      {/* 팀 화면 열람 */}
      <button
        type="button"
        disabled={isPending}
        onClick={view}
        className="self-start px-4 py-2 rounded-lg bg-suaza-button text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40"
      >
        팀 화면 열람 (읽기 전용)
      </button>

      <div aria-hidden className="h-px bg-suaza-border" />

      {/* 멤버 목록 */}
      <section className="flex flex-col gap-2">
        <h2 className="font-bold text-suaza-ink">
          멤버{" "}
          <span className="text-suaza-ink-muted font-normal">
            {visible.length}
          </span>
        </h2>
        <ul className="flex flex-col divide-y divide-suaza-border">
          {visible.map((m) => (
            <li
              key={m.userId}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="relative w-9 h-9 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
                {m.avatarUrl ? (
                  <Image
                    src={m.avatarUrl}
                    alt={m.name}
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                ) : (
                  <span className="text-sm font-bold text-suaza-ink">
                    {m.name.charAt(0)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-suaza-ink text-[15px] truncate">
                  {m.name}
                </p>
                <p className="text-xs text-suaza-ink-muted">
                  {TITLE_LABEL[m.title as MemberTitle] ?? m.title}
                  {m.status === "pending" && <span> · 가입 승인 대기</span>}
                  <span> · {dateLabel(m.joinedAt)} 가입</span>
                </p>
              </div>
              {m.title !== "president" && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => remove(m)}
                  className="shrink-0 px-3 py-1.5 rounded-lg border border-suaza-border text-sm text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                >
                  탈퇴
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div aria-hidden className="h-px bg-suaza-border" />

      {/* 위험 구역 — 팀 삭제 */}
      <section className="flex flex-col gap-2">
        <h2 className="font-bold text-red-600">팀 삭제</h2>
        <p className="text-xs text-suaza-ink-muted">
          경기·게시글·사진·기록·멤버십이 모두 영구 삭제됩니다. 되돌릴 수
          없습니다.
        </p>
        <button
          type="button"
          disabled={isPending}
          onClick={destroy}
          className="self-start px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40"
        >
          팀 삭제
        </button>
      </section>
    </div>
  );
}
