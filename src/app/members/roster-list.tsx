"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  POSITION_COLOR,
  POSITIONS,
  TITLE_BADGE,
  TITLE_LABEL,
  type MemberTitle,
  type Position,
} from "@/lib/members/positions";

export type RosterMember = {
  id: string;
  name: string;
  displayName: string;
  initial: string;
  nickname: string | null;
  title: MemberTitle;
  positions: Position[];
  jerseyNumber: number | null;
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  points: number;
};

type Filter = "ALL" | Position;

export default function RosterList({ members }: { members: RosterMember[] }) {
  const [filter, setFilter] = useState<Filter>("ALL");

  const counts = useMemo(() => {
    const c: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
    for (const m of members) {
      for (const p of m.positions) c[p] += 1;
    }
    return c;
  }, [members]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return members;
    return members.filter((m) => m.positions.includes(filter));
  }, [members, filter]);

  return (
    <div className="flex flex-col gap-4">
      {/* 헤더: 포지션 라벨 + 총 인원 */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-suaza-ink-muted shrink-0">포지션</span>
        <span className="text-sm text-suaza-ink-muted bg-gray-100 px-3 py-1 rounded-full">
          총 {members.length}명
        </span>
      </div>

      {/* 포지션 필터 칩 (한 줄) */}
      <div className="flex items-center gap-1.5 desktop:gap-2">
        <FilterChip
          label="전체"
          count={members.length}
          active={filter === "ALL"}
          onClick={() => setFilter("ALL")}
        />
        {POSITIONS.map((p) => (
          <FilterChip
            key={p}
            label={p}
            count={counts[p]}
            color={POSITION_COLOR[p]}
            oneDigit={p === "GK"}
            active={filter === p}
            onClick={() => setFilter(p)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-suaza-ink-muted text-sm py-8 text-center">
          해당 포지션 회원이 없습니다.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 desktop:grid-cols-2 desktop:gap-4">
          {filtered.map((m) => (
            <li key={m.id}>
              <MemberCard member={m} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  color,
  oneDigit = false,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color?: string;
  oneDigit?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 desktop:gap-1.5 px-2 desktop:px-3 py-0.5 desktop:py-1 rounded-full text-xs desktop:text-sm font-medium transition shrink-0 ${
        active
          ? "bg-suaza-ink text-white border border-suaza-ink"
          : "bg-white text-suaza-ink border border-suaza-border hover:bg-gray-50"
      }`}
    >
      {color && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span>{label}</span>
      <span
        className={`text-[10px] desktop:text-xs text-center tabular-nums ${oneDigit ? "min-w-[1ch]" : "min-w-[2ch]"} ${active ? "text-white/70" : "text-suaza-ink-muted"}`}
      >
        {count}
      </span>
    </button>
  );
}

function MemberCard({ member: m }: { member: RosterMember }) {
  const primary = m.positions[0] ?? null;
  const ringColor = primary ? POSITION_COLOR[primary] : "var(--suaza-border)";

  return (
    <Link
      href={`/members/${m.id}`}
      className="block p-4 desktop:p-5 border border-suaza-border rounded-xl bg-white hover:bg-gray-50 transition"
    >
      <div className="flex items-center gap-3 desktop:gap-4">
        <div
          className="shrink-0 w-12 h-12 desktop:w-14 desktop:h-14 rounded-full bg-gray-100 flex items-center justify-center border-2"
          style={{ borderColor: ringColor }}
          aria-hidden
        >
          <span className="text-base desktop:text-lg font-bold text-suaza-ink">
            {m.initial}
          </span>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="font-bold text-suaza-ink truncate">
                {m.displayName}
              </span>
              {m.jerseyNumber != null && (
                <span className="text-suaza-accent font-bold shrink-0">
                  #{m.jerseyNumber}
                </span>
              )}
              {m.nickname && (
                <span className="text-sm text-suaza-ink-muted truncate">
                  ({m.nickname})
                </span>
              )}
            </div>
            <TitleBadge title={m.title} />
          </div>

          {m.positions.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {m.positions.map((p) => (
                <PositionChip key={p} position={p} />
              ))}
            </div>
          )}

          <div className="text-xs desktop:text-sm text-suaza-ink-muted flex items-center gap-1.5 flex-wrap">
            <span>
              출전 <b className="text-suaza-ink">{m.appearances}</b>
            </span>
            <Dot />
            <span>
              골 <b className="text-suaza-ink">{m.goals}</b>
            </span>
            <Dot />
            <span>
              도움 <b className="text-suaza-ink">{m.assists}</b>
            </span>
            <Dot />
            <span>
              클린시트 <b className="text-suaza-ink">{m.cleanSheets}</b>
            </span>
            <Dot />
            <span>
              포인트 <b className="text-suaza-ink">{m.points}</b>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function Dot() {
  return <span className="text-suaza-ink-faint">·</span>;
}

function TitleBadge({ title }: { title: MemberTitle }) {
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 text-[11px] desktop:text-xs px-2 py-0.5 rounded-full font-medium ${TITLE_BADGE[title] ?? TITLE_BADGE.player}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {TITLE_LABEL[title] ?? title}
    </span>
  );
}

function PositionChip({ position }: { position: Position }) {
  const color = POSITION_COLOR[position];
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] desktop:text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ color, backgroundColor: `${color}1a` }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {position}
    </span>
  );
}
