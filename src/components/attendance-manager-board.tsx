"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setAttendanceFor } from "@/lib/matches/actions";

export type Member = {
  id: string;
  name: string;
  jersey_number?: number | null;
};

type Status = "attending" | "absent" | "undecided" | null;

type ByStatus = {
  attending: Member[];
  absent: Member[];
  undecided: Member[];
};

type BoardState = {
  byStatus: ByStatus;
  nonVoters: Member[];
};

type Move = { playerId: string; status: Status };

/**
 * 드래그앤드롭 결과를 byStatus/nonVoters 에 즉시 반영해 새 state 를 만든다.
 * - 옛 위치(어떤 status row 든, 또는 미투표)에서 해당 player 제거
 * - status=null 이면 미투표 row 맨 앞에 추가, 아니면 해당 status row 맨 뒤에 추가
 * - 이름 기준 정렬은 유지 (한국어 로케일)
 */
function applyMove(state: BoardState, move: Move): BoardState {
  const { playerId, status } = move;
  const byName = (a: Member, b: Member) => a.name.localeCompare(b.name, "ko");
  const stripFrom = (arr: Member[]) => arr.filter((m) => m.id !== playerId);

  let moved: Member | null = null;
  const findIn = (arr: Member[]) => arr.find((m) => m.id === playerId);
  moved =
    findIn(state.byStatus.attending) ??
    findIn(state.byStatus.absent) ??
    findIn(state.byStatus.undecided) ??
    findIn(state.nonVoters) ??
    null;
  if (!moved) return state;

  const nextBy: ByStatus = {
    attending: stripFrom(state.byStatus.attending),
    absent: stripFrom(state.byStatus.absent),
    undecided: stripFrom(state.byStatus.undecided),
  };
  let nextNon = stripFrom(state.nonVoters);

  if (status === null) {
    nextNon = [moved, ...nextNon].sort(byName);
  } else {
    nextBy[status] = [...nextBy[status], moved].sort(byName);
  }
  return { byStatus: nextBy, nonVoters: nextNon };
}

export default function AttendanceManagerBoard({
  matchId,
  byStatus,
  nonVoters,
}: {
  matchId: string;
  byStatus: ByStatus;
  nonVoters: Member[];
}) {
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [optimistic, applyOptimistic] = useOptimistic<BoardState, Move>(
    { byStatus, nonVoters },
    applyMove,
  );

  const handleDrop = (playerId: string, status: Status) => {
    startTransition(async () => {
      applyOptimistic({ playerId, status });
      try {
        await setAttendanceFor(matchId, playerId, status);
      } catch (e) {
        console.error(e);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <DropRow
        label="참석"
        badgeClass="bg-green-100 text-green-700"
        hoverClass="ring-2 ring-green-400"
        members={optimistic.byStatus.attending}
        status="attending"
        onDrop={handleDrop}
        onDragStateChange={setDragging}
        dragging={dragging}
      />
      <DropRow
        label="불참"
        badgeClass="bg-red-100 text-red-700"
        hoverClass="ring-2 ring-red-400"
        members={optimistic.byStatus.absent}
        status="absent"
        onDrop={handleDrop}
        onDragStateChange={setDragging}
        dragging={dragging}
      />
      <DropRow
        label="미정"
        badgeClass="bg-gray-200 text-gray-700"
        hoverClass="ring-2 ring-gray-400"
        members={optimistic.byStatus.undecided}
        status="undecided"
        onDrop={handleDrop}
        onDragStateChange={setDragging}
        dragging={dragging}
      />
      <div className="h-px bg-suaza-border my-1" />
      <NonVoterDropRow
        members={optimistic.nonVoters}
        onDrop={(id) => handleDrop(id, null)}
        onDragStateChange={setDragging}
        dragging={dragging}
      />
    </div>
  );
}

function DropRow({
  label,
  badgeClass,
  hoverClass,
  members,
  status,
  onDrop,
  onDragStateChange,
  dragging,
}: {
  label: string;
  badgeClass: string;
  hoverClass: string;
  members: Member[];
  status: Status;
  onDrop: (playerId: string, status: Status) => void;
  onDragStateChange: (dragging: boolean) => void;
  dragging: boolean;
}) {
  const [over, setOver] = useState(false);
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
        const playerId = e.dataTransfer.getData("text/plain");
        if (playerId) onDrop(playerId, status);
      }}
      className={`flex flex-col gap-1.5 p-1.5 rounded-md border border-dashed transition ${
        dragging ? "border-suaza-border" : "border-transparent"
      } ${over ? hoverClass + " bg-blue-50" : ""}`}
    >
      <span
        className={`self-start shrink-0 text-xs px-2 py-0.5 rounded font-medium ${badgeClass}`}
      >
        {label} {members.length}
      </span>
      <div className="flex flex-wrap gap-1 min-h-[20px]">
        {members.length === 0 ? (
          <span className="text-sm text-suaza-ink-muted">—</span>
        ) : (
          members.map((m) => (
            <Chip key={m.id} member={m} onDragStateChange={onDragStateChange} />
          ))
        )}
      </div>
    </div>
  );
}

function NonVoterDropRow({
  members,
  onDrop,
  onDragStateChange,
  dragging,
}: {
  members: Member[];
  onDrop: (playerId: string) => void;
  onDragStateChange: (dragging: boolean) => void;
  dragging: boolean;
}) {
  const [over, setOver] = useState(false);
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
        const playerId = e.dataTransfer.getData("text/plain");
        if (playerId) onDrop(playerId);
      }}
      className={`flex flex-col gap-1.5 p-1.5 rounded-md border border-dashed transition ${
        dragging ? "border-suaza-border" : "border-transparent"
      } ${over ? "ring-2 ring-gray-400 bg-blue-50" : ""}`}
    >
      <span className="self-start shrink-0 text-xs px-2 py-0.5 rounded font-medium bg-gray-100 text-gray-500">
        미투표 {members.length}
      </span>
      <div className="flex flex-wrap gap-1 min-h-[20px]">
        {members.length === 0 ? (
          <span className="text-sm text-suaza-ink-muted">—</span>
        ) : (
          members.map((m) => (
            <Chip
              key={m.id}
              member={m}
              onDragStateChange={onDragStateChange}
              muted
            />
          ))
        )}
      </div>
    </div>
  );
}

function Chip({
  member,
  onDragStateChange,
  muted,
}: {
  member: Member;
  onDragStateChange: (dragging: boolean) => void;
  muted?: boolean;
}) {
  return (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", member.id);
        e.dataTransfer.effectAllowed = "move";
        // 드래그 시작 직후 동기 setState 는 일부 브라우저에서 드래그를
        // 취소시키므로 다음 틱으로 미룬다.
        setTimeout(() => onDragStateChange(true), 0);
      }}
      onDragEnd={() => onDragStateChange(false)}
      className={`select-none cursor-grab active:cursor-grabbing px-2.5 py-0.5 rounded-full text-xs border border-suaza-border hover:bg-gray-50 ${
        muted ? "text-suaza-ink-faint" : "text-suaza-ink-muted"
      }`}
    >
      {member.name}
    </span>
  );
}
