"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setMatchTeam } from "@/lib/matches/actions";
import { displayMemberName } from "@/lib/members/name";

type RecapMember = { id: string; name: string; team: "A" | "B" | null };

export default function TeamRecapCard({
  attendees,
  teamAName,
  teamBName,
  matchId,
  editable = false,
}: {
  attendees: RecapMember[];
  teamAName: string;
  teamBName: string;
  /** 편집(드래그앤드롭) 활성화 시 필수 */
  matchId?: string;
  editable?: boolean;
}) {
  const [optimistic, applyOptimistic] = useOptimistic<
    RecapMember[],
    RecapMember[]
  >(attendees, (_current, next) => next);
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

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
        <h3 className="font-bold text-suaza-ink text-lg">
          A & B 팀 편성 결과
        </h3>
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
          members={teamA}
          editable={editable}
          dragging={dragging}
          onDragStateChange={setDragging}
          onDropTo={moveTo}
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
          members={teamB}
          editable={editable}
          dragging={dragging}
          onDragStateChange={setDragging}
          onDropTo={moveTo}
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
            <div className="flex flex-wrap items-start content-start gap-2 min-h-[28px]">
              {unassigned.length === 0 ? (
                <span className="text-xs text-suaza-ink-faint">—</span>
              ) : (
                unassigned.map((m) => (
                  <PlayerChip
                    key={m.id}
                    member={m}
                    chipClass="border-dashed border-gray-300 bg-gray-100 text-suaza-ink-muted"
                    editable={editable}
                    onDragStateChange={setDragging}
                  />
                ))
              )}
            </div>
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
  members,
  editable,
  dragging,
  onDragStateChange,
  onDropTo,
}: {
  team: "A" | "B";
  label: string;
  dotColor: string;
  chipClass: string;
  members: RecapMember[];
  editable: boolean;
  dragging: boolean;
  onDragStateChange: (b: boolean) => void;
  onDropTo: (playerId: string, team: "A" | "B" | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 font-bold text-suaza-ink">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
          {label}
        </span>
        <span className="text-sm text-suaza-ink-muted font-normal leading-none">
          {members.length}명
        </span>
      </div>
      <DropZone
        team={team}
        editable={editable}
        dragging={dragging}
        onDropTo={onDropTo}
        className="flex flex-wrap items-start content-start gap-2 min-h-[36px] rounded-lg"
      >
        {members.length === 0 ? (
          <span className="text-xs text-suaza-ink-faint">—</span>
        ) : (
          members.map((m) => (
            <PlayerChip
              key={m.id}
              member={m}
              chipClass={`border ${chipClass}`}
              editable={editable}
              onDragStateChange={onDragStateChange}
            />
          ))
        )}
      </DropZone>
    </div>
  );
}

function PlayerChip({
  member,
  chipClass,
  editable,
  onDragStateChange,
}: {
  member: RecapMember;
  chipClass: string;
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
      className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full border select-none ${chipClass} ${
        editable
          ? "cursor-grab active:cursor-grabbing hover:opacity-80"
          : ""
      }`}
    >
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
