"use client";

import { useState, useTransition } from "react";
import { setAttendanceFor } from "@/lib/matches/actions";

export type Member = {
  id: string;
  name: string;
  jersey_number: number | null;
};

type Status = "attending" | "absent" | "undecided" | null;

type ByStatus = {
  attending: Member[];
  absent: Member[];
  undecided: Member[];
};

export default function AttendanceManagerBoard({
  matchId,
  byStatus,
  nonVoters,
}: {
  matchId: string;
  byStatus: ByStatus;
  nonVoters: Member[];
}) {
  const [isPending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

  const handleDrop = (playerId: string, status: Status) => {
    startTransition(async () => {
      try {
        await setAttendanceFor(matchId, playerId, status);
      } catch (e) {
        console.error(e);
      }
    });
  };

  return (
    <div
      className={`flex flex-col gap-2 transition ${isPending ? "opacity-60" : ""}`}
    >
      <DropRow
        label="참석"
        badgeClass="bg-green-100 text-green-700"
        hoverClass="ring-2 ring-green-400"
        members={byStatus.attending}
        status="attending"
        onDrop={handleDrop}
        onDragStateChange={setDragging}
        dragging={dragging}
      />
      <DropRow
        label="불참"
        badgeClass="bg-red-100 text-red-700"
        hoverClass="ring-2 ring-red-400"
        members={byStatus.absent}
        status="absent"
        onDrop={handleDrop}
        onDragStateChange={setDragging}
        dragging={dragging}
      />
      <DropRow
        label="미정"
        badgeClass="bg-gray-200 text-gray-700"
        hoverClass="ring-2 ring-gray-400"
        members={byStatus.undecided}
        status="undecided"
        onDrop={handleDrop}
        onDragStateChange={setDragging}
        dragging={dragging}
      />
      <div className="h-px bg-suaza-border my-1" />
      <NonVoterDropRow
        members={nonVoters}
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
      className={`flex items-start gap-2 p-1.5 rounded-md transition ${
        dragging ? "border border-dashed border-suaza-border" : ""
      } ${over ? hoverClass + " bg-blue-50" : ""}`}
    >
      <span
        className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${badgeClass}`}
      >
        {label} {members.length}
      </span>
      <div className="flex-1 flex flex-wrap gap-1 min-h-[20px]">
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
      className={`flex flex-col gap-1 p-1.5 rounded-md transition ${
        dragging ? "border border-dashed border-suaza-border" : ""
      } ${over ? "ring-2 ring-gray-400 bg-blue-50" : ""}`}
    >
      <span className="text-[11px] text-suaza-ink-faint font-medium">
        미투표 ({members.length})
      </span>
      <div className="flex flex-wrap gap-1 min-h-[20px]">
        {members.length === 0 ? (
          <span className="text-[11px] text-suaza-ink-faint">—</span>
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
        onDragStateChange(true);
      }}
      onDragEnd={() => onDragStateChange(false)}
      className={`select-none cursor-grab active:cursor-grabbing px-2 py-0.5 rounded text-xs border border-suaza-border hover:bg-gray-50 ${
        muted ? "text-suaza-ink-faint" : "text-suaza-ink-muted"
      }`}
    >
      {member.name}
    </span>
  );
}
