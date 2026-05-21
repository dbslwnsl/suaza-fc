"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  autoBalanceTeams,
  cycleMatchTeam,
  resetMatchTeams,
  setMatchTeam,
} from "@/lib/matches/actions";
import { displayMemberName } from "@/lib/members/name";

export type TeamMember = {
  id: string;
  name: string;
  team: "A" | "B" | null;
};

export default function TeamBuilder({
  matchId,
  attendees,
  absentCount,
  undecidedCount,
  nonVoterCount,
  readonly,
}: {
  matchId: string;
  attendees: TeamMember[];
  absentCount: number;
  undecidedCount: number;
  nonVoterCount: number;
  readonly: boolean;
}) {
  const [, startTransition] = useTransition();
  // 데스크탑 드래그앤드롭 상태
  const [dragging, setDragging] = useState(false);

  const sorted = useMemo(
    () => [...attendees].sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [attendees],
  );
  const teamA = sorted.filter((m) => m.team === "A");
  const teamB = sorted.filter((m) => m.team === "B");
  const unassigned = sorted.filter((m) => m.team === null);

  const cycle = (playerId: string) => {
    if (readonly) return;
    startTransition(() => cycleMatchTeam(matchId, playerId));
  };
  const dropTo = (playerId: string, team: "A" | "B" | null) => {
    if (readonly) return;
    startTransition(() => setMatchTeam(matchId, playerId, team));
  };
  const auto = () => {
    if (readonly) return;
    startTransition(() => autoBalanceTeams(matchId));
  };
  const reset = () => {
    if (readonly) return;
    startTransition(() => resetMatchTeams(matchId));
  };

  const total = attendees.length;
  const aPct = total > 0 ? (teamA.length / total) * 100 : 0;
  const bPct = total > 0 ? (teamB.length / total) * 100 : 0;

  return (
    <section className="bg-white rounded-2xl border border-suaza-border desktop:border-0 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-5 desktop:p-8 flex flex-col gap-4 desktop:h-full">
      {/* 편성 결과 */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-suaza-ink text-lg">A · B 팀 편성 결과</h3>
        {!readonly && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center text-xs font-medium text-suaza-ink-muted border border-suaza-border bg-white hover:bg-gray-50 transition px-2.5 py-1 rounded-md"
            >
              초기화
            </button>
            <button
              type="button"
              onClick={auto}
              className="inline-flex items-center gap-1 text-xs font-bold text-white bg-suaza-button hover:opacity-90 transition px-2.5 py-1 rounded-md"
            >
              ⚖ 자동 배분
            </button>
          </div>
        )}
      </div>

      {/* 비율 바 */}
      <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-200">
        <div style={{ width: `${aPct}%` }} className="bg-suaza-accent" />
        <div style={{ width: `${bPct}%` }} className="bg-blue-500" />
      </div>

      {/* A팀 */}
      <TeamGroup
        label="A팀"
        color="#EF3E3E"
        members={teamA}
        chipClass="bg-red-50 text-suaza-accent border-red-200"
        team="A"
        readonly={readonly}
        dragging={dragging}
        onCycle={cycle}
        onDropTo={dropTo}
        onDragStateChange={setDragging}
      />
      {/* B팀 */}
      <TeamGroup
        label="B팀"
        color="#3B82F6"
        members={teamB}
        chipClass="bg-blue-50 text-blue-600 border-blue-200"
        team="B"
        readonly={readonly}
        dragging={dragging}
        onCycle={cycle}
        onDropTo={dropTo}
        onDragStateChange={setDragging}
      />

      <div className="h-px bg-suaza-border" />

      {/* 헤더 + 탭/드래그 가능한 참석자 칩 */}
      <div className="flex flex-col gap-1">
        <h2 className="font-bold text-suaza-ink text-lg">
          참석 {total}명 · 탭해서 팀 지정
        </h2>
        {!readonly && (
          <p className="text-xs text-suaza-ink-muted">
            <span className="hidden desktop:inline">
              드래그해서 팀으로 옮기거나{" "}
            </span>
            이름을 탭하면 미배정 → A팀(빨강) → B팀(파랑) 순환
          </p>
        )}
      </div>

      {/* 미배정 영역 (드롭존) */}
      <DropZone
        team={null}
        readonly={readonly}
        dragging={dragging}
        onDropTo={dropTo}
        className="flex flex-wrap items-start content-start gap-2 min-h-[36px] rounded-lg"
      >
        {total === 0 ? (
          <p className="text-sm text-suaza-ink-muted py-2">
            참석으로 표시된 회원이 없습니다
          </p>
        ) : unassigned.length === 0 ? (
          <p className="text-sm text-suaza-ink-muted py-2">
            모든 참석자가 배정되었습니다 ✓
          </p>
        ) : (
          unassigned.map((m) => (
            <TapChip
              key={m.id}
              member={m}
              readonly={readonly}
              onClick={() => cycle(m.id)}
              onDragStateChange={setDragging}
            />
          ))
        )}
      </DropZone>

      <p className="text-xs text-suaza-ink-faint">
        불참 {absentCount} · 미정 {undecidedCount} · 미투표 {nonVoterCount}{" "}
        (편성 제외)
      </p>

      {/* 완료 → 포메이션 */}
      {!readonly && (
        <Link
          href={`/matches/${matchId}/formation`}
          className="mt-2 h-[52px] rounded-lg bg-suaza-button text-white text-base font-bold flex items-center justify-center hover:opacity-90 transition"
        >
          팀 편성 완료 · 포메이션 설정 →
        </Link>
      )}
    </section>
  );
}

function TapChip({
  member,
  readonly,
  onClick,
  onDragStateChange,
}: {
  member: TeamMember;
  readonly: boolean;
  onClick: () => void;
  onDragStateChange?: (dragging: boolean) => void;
}) {
  // 미배정 전용 칩 (탭하면 A팀으로). 점선 회색으로 미배정 표시.
  // 데스크탑 드래그 가능 — span 으로 구현 (button 은 HTML5 drag 불안정).
  return (
    <span
      role="button"
      tabIndex={readonly ? -1 : 0}
      onClick={readonly ? undefined : onClick}
      draggable={!readonly}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", member.id);
        e.dataTransfer.effectAllowed = "move";
        setTimeout(() => onDragStateChange?.(true), 0);
      }}
      onDragEnd={() => onDragStateChange?.(false)}
      className={`px-2.5 py-0.5 rounded-full text-xs font-medium border border-dashed border-gray-300 bg-gray-100 text-suaza-ink-muted transition select-none ${
        readonly
          ? "cursor-default"
          : "cursor-pointer hover:opacity-80 desktop:cursor-grab desktop:active:cursor-grabbing"
      }`}
    >
      {displayMemberName(member.name)}
    </span>
  );
}

// 드롭존 — 데스크탑에서 칩을 끌어다 놓으면 해당 팀으로 배정
function DropZone({
  team,
  readonly,
  dragging,
  onDropTo,
  className = "",
  children,
}: {
  team: "A" | "B" | null;
  readonly: boolean;
  dragging: boolean;
  onDropTo: (playerId: string, team: "A" | "B" | null) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (readonly) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (readonly) return;
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDropTo(id, team);
      }}
      className={`${className} border border-dashed transition ${
        dragging && !readonly ? "border-suaza-border" : "border-transparent"
      } ${over ? "ring-2 ring-suaza-button bg-blue-50/50" : ""}`}
    >
      {children}
    </div>
  );
}

function TeamGroup({
  label,
  color,
  members,
  chipClass,
  team,
  readonly,
  dragging,
  onCycle,
  onDropTo,
  onDragStateChange,
}: {
  label: string;
  color: string;
  members: TeamMember[];
  chipClass: string;
  team: "A" | "B";
  readonly: boolean;
  dragging: boolean;
  onCycle: (playerId: string) => void;
  onDropTo: (playerId: string, team: "A" | "B" | null) => void;
  onDragStateChange: (dragging: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-bold text-suaza-ink">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          {label}
        </span>
        <span className="font-bold text-suaza-ink">{members.length}명</span>
      </div>
      <DropZone
        team={team}
        readonly={readonly}
        dragging={dragging}
        onDropTo={onDropTo}
        className="flex flex-wrap items-start content-start gap-2 min-h-[36px] rounded-lg"
      >
        {members.length === 0 ? (
          <span className="text-xs text-suaza-ink-faint self-center">—</span>
        ) : (
          members.map((m) => (
            <span
              key={m.id}
              role="button"
              tabIndex={readonly ? -1 : 0}
              onClick={() => !readonly && onCycle(m.id)}
              draggable={!readonly}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", m.id);
                e.dataTransfer.effectAllowed = "move";
                setTimeout(() => onDragStateChange(true), 0);
              }}
              onDragEnd={() => onDragStateChange(false)}
              className={`text-xs px-2.5 py-0.5 rounded-full border select-none ${chipClass} ${
                readonly
                  ? "cursor-default"
                  : "cursor-pointer hover:opacity-80 desktop:cursor-grab desktop:active:cursor-grabbing"
              }`}
            >
              {displayMemberName(m.name)}
            </span>
          ))
        )}
      </DropZone>
    </div>
  );
}
