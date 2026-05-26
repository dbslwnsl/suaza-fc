"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import {
  autoBalanceTeams,
  cycleMatchTeam,
  resetMatchTeams,
  setMatchTeam,
  setTeamColor,
} from "@/lib/matches/actions";
import {
  DEFAULT_TEAM_COLOR,
  UNIFORM_COLORS,
} from "@/lib/matches/helpers";
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
  teamAColor,
  teamBColor,
  teamAName,
  teamBName,
  readonly,
}: {
  matchId: string;
  attendees: TeamMember[];
  absentCount: number;
  undecidedCount: number;
  nonVoterCount: number;
  teamAColor: string | null;
  teamBColor: string | null;
  teamAName: string;
  teamBName: string;
  readonly: boolean;
}) {
  const [, startTransition] = useTransition();
  // 데스크탑 드래그앤드롭 상태
  const [dragging, setDragging] = useState(false);
  // 유니폼 색 (낙관적)
  const [colorA, setColorA] = useState(teamAColor ?? DEFAULT_TEAM_COLOR.A);
  const [colorB, setColorB] = useState(teamBColor ?? DEFAULT_TEAM_COLOR.B);
  // 팀 편성도 낙관적 업데이트: 서버 응답/revalidate 를 기다리지 않고 즉시 반영.
  // reducer 는 인자로 받은 다음 attendees 배열을 그대로 사용 (단순 교체).
  const [optimisticAttendees, applyOptimistic] = useOptimistic<
    TeamMember[],
    TeamMember[]
  >(attendees, (_current, next) => next);

  const changeColor = (team: "A" | "B", color: string) => {
    if (readonly) return;
    if (team === "A") setColorA(color);
    else setColorB(color);
    startTransition(() => setTeamColor(matchId, team, color));
  };

  const sorted = useMemo(
    () =>
      [...optimisticAttendees].sort((a, b) =>
        a.name.localeCompare(b.name, "ko"),
      ),
    [optimisticAttendees],
  );
  const teamA = sorted.filter((m) => m.team === "A");
  const teamB = sorted.filter((m) => m.team === "B");
  const unassigned = sorted.filter((m) => m.team === null);

  const setTeamLocally = (playerId: string, team: "A" | "B" | null) =>
    optimisticAttendees.map((m) =>
      m.id === playerId ? { ...m, team } : m,
    );

  const cycle = (playerId: string) => {
    if (readonly) return;
    const cur = optimisticAttendees.find((m) => m.id === playerId);
    if (!cur) return;
    const next: "A" | "B" | null =
      cur.team === null ? "A" : cur.team === "A" ? "B" : null;
    startTransition(() => {
      applyOptimistic(setTeamLocally(playerId, next));
      cycleMatchTeam(matchId, playerId);
    });
  };
  const dropTo = (playerId: string, team: "A" | "B" | null) => {
    if (readonly) return;
    startTransition(() => {
      applyOptimistic(setTeamLocally(playerId, team));
      setMatchTeam(matchId, playerId, team);
    });
  };
  const auto = () => {
    if (readonly) return;
    // 클라이언트에서도 동일한 셔플(랜덤) → 앞 절반 A, 뒤 절반 B. 결과는 서버 셔플과
    // 다를 수 있지만 시각적으로 즉시 변하는 게 우선. revalidate 가 도착하면 자동
    // 으로 서버 기준 결과로 정리된다.
    const ids = optimisticAttendees.map((m) => m.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const half = Math.ceil(ids.length / 2);
    const aSet = new Set(ids.slice(0, half));
    const next = optimisticAttendees.map((m) => ({
      ...m,
      team: (aSet.has(m.id) ? "A" : "B") as "A" | "B" | null,
    }));
    startTransition(() => {
      applyOptimistic(next);
      autoBalanceTeams(matchId);
    });
  };
  const reset = () => {
    if (readonly) return;
    const next = optimisticAttendees.map((m) => ({
      ...m,
      team: null as "A" | "B" | null,
    }));
    startTransition(() => {
      applyOptimistic(next);
      resetMatchTeams(matchId);
    });
  };

  const total = attendees.length;
  // 게이지는 가운데를 기준으로 양쪽으로 뻗어가며 한 팀이 11명일 때 절반(=영역) 가득 참.
  // 어느 한 팀이 11명을 넘으면 그 인원에 맞춰 1명당 너비가 줄어들도록 cap 을 늘린다.
  const cap = Math.max(11, teamA.length, teamB.length);
  // 좌/우 절반(50%) 영역 내부에서의 채움 비율 (0~100)
  const aFill = cap > 0 ? (teamA.length / cap) * 100 : 0;
  const bFill = cap > 0 ? (teamB.length / cap) * 100 : 0;

  return (
    <section className="bg-white rounded-2xl border border-suaza-border desktop:border-0 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-5 desktop:p-8 flex flex-col gap-4 desktop:h-full">
      {/* 편성 결과 */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-suaza-ink text-lg">A & B 팀 편성 결과</h3>
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

      {/* 비율 바 — 가운데를 기준으로 A팀(좌)·B팀(우)이 유니폼 색으로 채워짐.
          한 팀 기준 11명일 때 각 영역이 가득 차고, 초과 시 비율이 자동 축소된다. */}
      <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-200">
        <div className="w-1/2 flex justify-end">
          <div
            style={{ width: `${aFill}%`, backgroundColor: colorA }}
            className="h-full"
          />
        </div>
        <div className="w-1/2 flex justify-start">
          <div
            style={{ width: `${bFill}%`, backgroundColor: colorB }}
            className="h-full"
          />
        </div>
      </div>

      {/* A팀 */}
      <TeamGroup
        label={teamAName}
        color="#EF3E3E"
        members={teamA}
        chipClass="bg-red-50 text-suaza-accent border-red-200"
        team="A"
        readonly={readonly}
        dragging={dragging}
        uniformColor={colorA}
        onColorChange={(c) => changeColor("A", c)}
        onCycle={cycle}
        onDropTo={dropTo}
        onDragStateChange={setDragging}
      />
      {/* B팀 */}
      <TeamGroup
        label={teamBName}
        color="#3B82F6"
        members={teamB}
        chipClass="bg-blue-50 text-blue-600 border-blue-200"
        team="B"
        readonly={readonly}
        dragging={dragging}
        uniformColor={colorB}
        onColorChange={(c) => changeColor("B", c)}
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

function JerseyIcon({ color }: { color: string }) {
  // 유니폼 상의(반팔 티셔츠) 실루엣. 흰색/밝은 색도 보이도록 외곽선 추가.
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 24 24"
      aria-hidden
      className="shrink-0 drop-shadow-sm"
    >
      <path
        d="M8.6 3 L4 5.2 L2.2 9 L5.1 10.7 L6.5 9.5 V21 H17.5 V9.5 L18.9 10.7 L21.8 9 L20 5.2 L15.4 3 C15.4 4.5 13.9 5.4 12 5.4 C10.1 5.4 8.6 4.5 8.6 3 Z"
        fill={color}
        stroke="rgba(0,0,0,0.28)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
    </svg>
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
  uniformColor,
  onColorChange,
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
  uniformColor: string;
  onColorChange: (color: string) => void;
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

      {/* 유니폼 상의 + 색 선택 */}
      <div className="flex items-center gap-2.5">
        <JerseyIcon color={uniformColor} />
        {readonly ? (
          <span className="text-xs text-suaza-ink-muted">유니폼</span>
        ) : (
          <div className="flex items-center gap-1 flex-wrap">
            {UNIFORM_COLORS.map((c) => {
              const active = c.toLowerCase() === uniformColor.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onColorChange(c)}
                  aria-label={`${label} 유니폼 색`}
                  className={`w-5 h-5 rounded-full transition ${
                    active
                      ? "ring-2 ring-offset-1 ring-suaza-ink"
                      : "ring-1 ring-suaza-border hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                />
              );
            })}
          </div>
        )}
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
