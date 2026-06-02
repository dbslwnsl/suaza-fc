"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setMatchCaptain, setMatchTeam } from "@/lib/matches/actions";
import { displayMemberName } from "@/lib/members/name";
import {
  POSITION_COLOR,
  POSITIONS,
  type Position,
} from "@/lib/members/positions";
import { DEFAULT_TEAM_COLOR } from "@/lib/matches/helpers";
import CaptainPicker, { CAPTAIN_CHIP_CLASS } from "./captain-picker";
import ConditionArrow from "@/components/condition-arrow";

type RecapMember = {
  id: string;
  name: string;
  team: "A" | "B" | null;
  positions?: string[] | null;
  /** 컨디션 1~5 단계 (기본 3) */
  condition?: number | null;
};

// 주포지션(positions[0]) 기준으로 FW → MF → DF → GK 순으로 묶음
const POSITION_ORDER: Position[] = ["FW", "MF", "DF", "GK"];
function groupByPosition(members: RecapMember[]): {
  pos: Position | null;
  list: RecapMember[];
}[] {
  const buckets: Record<Position | "ETC", RecapMember[]> = {
    GK: [],
    DF: [],
    MF: [],
    FW: [],
    ETC: [],
  };
  for (const m of members) {
    const primary = (m.positions?.[0] ?? null) as Position | null;
    if (primary && (POSITIONS as readonly string[]).includes(primary)) {
      buckets[primary].push(m);
    } else {
      buckets.ETC.push(m);
    }
  }
  const out: { pos: Position | null; list: RecapMember[] }[] = [];
  for (const p of POSITION_ORDER) {
    if (buckets[p].length > 0) out.push({ pos: p, list: buckets[p] });
  }
  if (buckets.ETC.length > 0) out.push({ pos: null, list: buckets.ETC });
  return out;
}

export default function TeamRecapCard({
  attendees,
  teamAName,
  teamBName,
  teamACaptain = null,
  teamBCaptain = null,
  teamAColor,
  teamBColor,
  matchId,
  editable = false,
  lockCaptain = false,
}: {
  attendees: RecapMember[];
  teamAName: string;
  teamBName: string;
  teamACaptain?: string | null;
  teamBCaptain?: string | null;
  teamAColor?: string | null;
  teamBColor?: string | null;
  /** 편집(드래그앤드롭) 활성화 시 필수 */
  matchId?: string;
  editable?: boolean;
  /** 주장 변경 잠금 (예: 경기 종료) — editable 이어도 주장은 못 바꿈 */
  lockCaptain?: boolean;
}) {
  const [optimistic, applyOptimistic] = useOptimistic<
    RecapMember[],
    RecapMember[]
  >(attendees, (_current, next) => next);
  const [optCaptains, applyCaptains] = useOptimistic<
    { a: string | null; b: string | null },
    { a: string | null; b: string | null }
  >({ a: teamACaptain, b: teamBCaptain }, (_current, next) => next);
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

  const setCaptain = (team: "A" | "B", playerId: string | null) => {
    if (!editable || lockCaptain || !matchId) return;
    startTransition(() => {
      applyCaptains(
        team === "A"
          ? { ...optCaptains, a: playerId }
          : { ...optCaptains, b: playerId },
      );
      setMatchCaptain(matchId, team, playerId);
    });
  };

  const sortByName = (a: RecapMember, b: RecapMember) =>
    a.name.localeCompare(b.name, "ko");
  const teamA = optimistic.filter((m) => m.team === "A").sort(sortByName);
  const teamB = optimistic.filter((m) => m.team === "B").sort(sortByName);
  const unassigned = optimistic.filter((m) => m.team == null).sort(sortByName);

  const moveTo = (playerId: string, team: "A" | "B" | null) => {
    if (!editable || !matchId) return;
    const cur = optimistic.find((m) => m.id === playerId);
    if (!cur || cur.team === team) return;
    const next = optimistic.map((m) =>
      m.id === playerId ? { ...m, team } : m,
    );
    startTransition(() => {
      applyOptimistic(next);
      setMatchTeam(matchId, playerId, team);
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-suaza-border desktop:border-0 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-5 desktop:p-8 flex flex-col gap-4 desktop:h-full">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-bold text-suaza-ink text-lg">팀 편성 결과</h3>
        {editable && (
          <span className="text-[11px] text-suaza-ink-faint">
            드래그해서 팀 변경
          </span>
        )}
      </div>

      {/* 데스크탑: A | 세로선 | B 3열, 모바일: 세로로 쌓임 (구분선 숨김) */}
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-[1fr_1px_1fr] desktop:gap-x-6">
        <TeamColumn
          team="A"
          label={teamAName}
          dotColor="#EF3E3E"
          chipClass="bg-red-50 text-suaza-accent border-red-200"
          uniformColor={teamAColor ?? DEFAULT_TEAM_COLOR.A}
          members={teamA}
          captainId={optCaptains.a}
          editable={editable}
          lockCaptain={lockCaptain}
          dragging={dragging}
          onDragStateChange={setDragging}
          onDropTo={moveTo}
          onCaptainChange={(id) => setCaptain("A", id)}
        />
        <div
          aria-hidden
          className="hidden desktop:block w-px bg-suaza-border self-stretch"
        />
        <TeamColumn
          team="B"
          label={teamBName}
          dotColor="#3B82F6"
          chipClass="bg-blue-50 text-blue-600 border-blue-200"
          uniformColor={teamBColor ?? DEFAULT_TEAM_COLOR.B}
          members={teamB}
          captainId={optCaptains.b}
          editable={editable}
          lockCaptain={lockCaptain}
          dragging={dragging}
          onDragStateChange={setDragging}
          onDropTo={moveTo}
          onCaptainChange={(id) => setCaptain("B", id)}
        />
      </div>

      {(unassigned.length > 0 || (editable && dragging)) && (
        <>
          <div className="h-px bg-suaza-border" />
          <DropZone
            team={null}
            editable={editable}
            dragging={dragging}
            onDropTo={moveTo}
            className="flex flex-col gap-2"
          >
            <span className="text-sm font-bold text-suaza-ink">
              미편성 인원{" "}
              <span className="text-xs text-suaza-ink-muted font-normal">
                ({unassigned.length}명)
              </span>
            </span>
            {unassigned.length === 0 ? (
              <div className="flex items-start min-h-[28px]">
                <span className="text-xs text-suaza-ink-faint">—</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2 min-h-[28px]">
                {groupByPosition(unassigned).map(({ pos, list }) => (
                  <div key={pos ?? "etc"} className="flex items-start gap-2">
                    <span
                      className="shrink-0 mt-0.5 inline-flex items-center justify-center min-w-[26px] h-5 px-1.5 rounded-full text-[10px] font-bold text-white"
                      style={{
                        backgroundColor: pos
                          ? POSITION_COLOR[pos]
                          : "#9CA3AF",
                      }}
                    >
                      {pos ?? "기타"}
                    </span>
                    <div className="flex flex-wrap items-start content-start gap-1.5">
                      {list.map((m) => (
                        <PlayerChip
                          key={m.id}
                          member={m}
                          chipClass="border-dashed border-gray-300 bg-gray-100 text-suaza-ink-muted"
                          editable={editable}
                          onDragStateChange={setDragging}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DropZone>
        </>
      )}
    </section>
  );
}

function TeamColumn({
  team,
  label,
  dotColor,
  chipClass,
  uniformColor,
  members,
  captainId,
  editable,
  lockCaptain = false,
  dragging,
  onDragStateChange,
  onDropTo,
  onCaptainChange,
}: {
  team: "A" | "B";
  label: string;
  dotColor: string;
  chipClass: string;
  uniformColor: string;
  members: RecapMember[];
  captainId: string | null;
  editable: boolean;
  lockCaptain?: boolean;
  dragging: boolean;
  onDragStateChange: (b: boolean) => void;
  onDropTo: (playerId: string, team: "A" | "B" | null) => void;
  onCaptainChange: (playerId: string | null) => void;
}) {
  const groups = groupByPosition(members);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-bold text-suaza-ink min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: dotColor }}
          />
          <span className="truncate">{label}</span>
          <span className="text-sm text-suaza-ink-muted font-normal leading-none shrink-0">
            {members.length}명
          </span>
        </span>
        <CaptainPicker
          members={members}
          captainId={captainId}
          editable={editable}
          locked={lockCaptain}
          onChange={onCaptainChange}
        />
      </div>
      {/* 유니폼 색 표시 */}
      <div className="flex items-center gap-2">
        <JerseyIcon color={uniformColor} />
        <span className="text-xs text-suaza-ink-muted">유니폼</span>
      </div>
      <DropZone
        team={team}
        editable={editable}
        dragging={dragging}
        onDropTo={onDropTo}
        className="flex flex-col gap-2 min-h-[36px] rounded-lg"
      >
        {members.length === 0 ? (
          <span className="text-xs text-suaza-ink-faint">—</span>
        ) : (
          groups.map(({ pos, list }) => (
            <div
              key={pos ?? "etc"}
              className="flex items-start gap-2"
            >
              <span
                className="shrink-0 mt-0.5 inline-flex items-center justify-center min-w-[26px] h-5 px-1.5 rounded-full text-[10px] font-bold text-white"
                style={{
                  backgroundColor: pos
                    ? POSITION_COLOR[pos]
                    : "#9CA3AF",
                }}
              >
                {pos ?? "기타"}
              </span>
              <div className="flex flex-wrap items-start content-start gap-1.5">
                {list.map((m) => (
                  <PlayerChip
                    key={m.id}
                    member={m}
                    chipClass={`border ${chipClass}`}
                    isCaptain={m.id === captainId}
                    editable={editable}
                    onDragStateChange={onDragStateChange}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </DropZone>
    </div>
  );
}

function JerseyIcon({ color }: { color: string }) {
  return (
    <svg
      width="28"
      height="28"
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

function PlayerChip({
  member,
  chipClass,
  isCaptain = false,
  editable,
  onDragStateChange,
}: {
  member: RecapMember;
  chipClass: string;
  isCaptain?: boolean;
  editable: boolean;
  onDragStateChange: (b: boolean) => void;
}) {
  return (
    <span
      draggable={editable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", member.id);
        e.dataTransfer.effectAllowed = "move";
        setTimeout(() => onDragStateChange(true), 0);
      }}
      onDragEnd={() => onDragStateChange(false)}
      className={`inline-flex items-center gap-1 text-xs pl-1 pr-2.5 py-0.5 rounded-full border select-none ${
        isCaptain ? CAPTAIN_CHIP_CLASS : chipClass
      } ${
        editable
          ? "cursor-grab active:cursor-grabbing hover:opacity-80"
          : ""
      }`}
    >
      <ConditionArrow level={member.condition ?? 3} size={14} />
      {displayMemberName(member.name)}
    </span>
  );
}

function DropZone({
  team,
  editable,
  dragging,
  onDropTo,
  className = "",
  children,
}: {
  team: "A" | "B" | null;
  editable: boolean;
  dragging: boolean;
  onDropTo: (playerId: string, team: "A" | "B" | null) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  if (!editable) {
    return <div className={className}>{children}</div>;
  }
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDropTo(id, team);
      }}
      className={`${className} transition ${
        dragging ? "border border-dashed border-suaza-border" : "border border-transparent"
      } ${over ? "ring-2 ring-suaza-button bg-blue-50/40" : ""}`}
    >
      {children}
    </div>
  );
}
