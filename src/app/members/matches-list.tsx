"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { displayMemberName } from "@/lib/members/name";

export type MatchListEntry = {
  id: string;
  matchDate: string; // ISO
  opponent: string;
  ourScore: number | null;
  opponentScore: number | null;
  result: "W" | "D" | "L" | null;
  attendingCount: number;
};

export type MatchMember = {
  id: string;
  name: string;
  jerseyNumber: number | null;
};

export type MatchCell = {
  matchId: string;
  playerId: string;
  goals: number;
  assists: number;
  cleanSheets: number;
};

type StatKey = "goals" | "assists" | "cleanSheets" | "attended" | "absent";

const STAT_META: {
  key: StatKey;
  label: string;
  color: string;
  bg: string;
}[] = [
  { key: "goals", label: "골", color: "#EF3E3E", bg: "rgba(239,62,62,0.10)" },
  {
    key: "assists",
    label: "어시",
    color: "#3B82F6",
    bg: "rgba(59,130,246,0.10)",
  },
  {
    key: "cleanSheets",
    label: "클린시트",
    color: "#22C55E",
    bg: "rgba(34,197,94,0.10)",
  },
  {
    key: "attended",
    label: "출전",
    color: "#9CA3AF",
    bg: "rgba(156,163,175,0.10)",
  },
  {
    key: "absent",
    label: "미출전",
    color: "#9CA3AF",
    bg: "rgba(156,163,175,0.10)",
  },
];

const ALL_KEYS: StatKey[] = ["goals", "assists", "cleanSheets", "attended", "absent"];

export default function MatchesList({
  year,
  years,
  matches,
  members,
  cells,
  myId,
  wins,
  draws,
  losses,
}: {
  year: number;
  years: number[];
  matches: MatchListEntry[];
  members: MatchMember[];
  cells: MatchCell[];
  myId: string | null;
  wins: number;
  draws: number;
  losses: number;
}) {
  // 표시 옵션 (다중 선택)
  const [shown, setShown] = useState<Set<StatKey>>(() => new Set(ALL_KEYS));
  const toggle = (k: StatKey) => {
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  // cell index (playerId -> matchId -> cell)
  const cellByPlayer = useMemo(() => {
    const map = new Map<string, Map<string, MatchCell>>();
    for (const c of cells) {
      let row = map.get(c.playerId);
      if (!row) {
        row = new Map();
        map.set(c.playerId, row);
      }
      row.set(c.matchId, c);
    }
    return map;
  }, [cells]);

  // 본인 경기별 기록 — 모바일 카드용
  const myCellsByMatch = useMemo(() => {
    const map = new Map<string, MatchCell>();
    if (!myId) return map;
    const row = cellByPlayer.get(myId);
    if (!row) return map;
    for (const [matchId, cell] of row.entries()) map.set(matchId, cell);
    return map;
  }, [cellByPlayer, myId]);

  return (
    <section className="flex flex-col gap-5">
      {/* 시즌 칩 + 카운트 칩 */}
      <div className="flex items-center justify-between gap-2">
        <SeasonSelector year={year} years={years} />
        <span className="shrink-0 text-xs text-suaza-ink-muted bg-gray-100 px-3 py-1 rounded-full">
          {matches.length}경기
          <span className="hidden desktop:inline">
            {matches.length > 0
              ? ` · ${wins}승 ${draws}무 ${losses}패`
              : ""}
          </span>
        </span>
      </div>

      {matches.length === 0 ? (
        <p className="text-suaza-ink-muted text-sm py-10 text-center">
          {year}년 종료된 경기가 없습니다.
        </p>
      ) : (
        <>
          {/* 표시 옵션 (데스크톱 전용) */}
          <div className="hidden desktop:flex items-center gap-3 flex-wrap">
            <span className="text-sm text-suaza-ink-muted shrink-0">표시</span>
            <div className="flex items-center gap-2 flex-wrap">
              {STAT_META.map((s) => (
                <ToggleChip
                  key={s.key}
                  active={shown.has(s.key)}
                  label={s.label}
                  color={s.color}
                  onClick={() => toggle(s.key)}
                />
              ))}
            </div>
          </div>

          {/* 데스크톱 매트릭스 */}
          <div className="hidden desktop:block">
            <MatrixTable
              matches={matches}
              members={members}
              cellByPlayer={cellByPlayer}
              myId={myId}
              shown={shown}
            />
          </div>

          {/* 모바일 카드 리스트 */}
          <div className="desktop:hidden flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold text-suaza-ink">전체 경기</h3>
              <span className="text-xs text-suaza-ink-muted">최근 → 과거 순</span>
            </div>
            <ul className="flex flex-col gap-2">
              {matches.map((m) => (
                <li key={m.id}>
                  <MobileMatchCard
                    match={m}
                    myCell={myCellsByMatch.get(m.id) ?? null}
                  />
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────
// 시즌 칩
// ───────────────────────────────────────────────────────────

function SeasonSelector({ year, years }: { year: number; years: number[] }) {
  if (years.length === 0) {
    return (
      <span className="text-suaza-ink-muted text-sm">기록된 연도가 없습니다.</span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {years.map((y) => {
        const active = y === year;
        return (
          <Link
            key={y}
            href={`/members?tab=matches&year=${y}`}
            className={`shrink-0 inline-flex items-center px-3 py-1 rounded-lg text-sm font-bold transition ${
              active
                ? "bg-suaza-ink text-white border border-suaza-ink"
                : "bg-white text-suaza-ink border border-suaza-border hover:bg-gray-50"
            }`}
          >
            {y} 시즌
          </Link>
        );
      })}
    </div>
  );
}

function ToggleChip({
  active,
  label,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition ${
        active
          ? "bg-white border-suaza-border text-suaza-ink"
          : "bg-white border-suaza-border text-suaza-ink-faint hover:text-suaza-ink"
      }`}
    >
      <span
        className="w-3 h-3 rounded-full border-2"
        style={{
          borderColor: color,
          backgroundColor: active ? color : "transparent",
        }}
      />
      {label}
    </button>
  );
}

// ───────────────────────────────────────────────────────────
// 데스크톱 매트릭스 테이블
// ───────────────────────────────────────────────────────────

function MatrixTable({
  matches,
  members,
  cellByPlayer,
  myId,
  shown,
}: {
  matches: MatchListEntry[];
  members: MatchMember[];
  cellByPlayer: Map<string, Map<string, MatchCell>>;
  myId: string | null;
  shown: Set<StatKey>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-suaza-border">
      <table className="text-sm border-separate border-spacing-0 min-w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 py-3 px-3 text-left text-xs text-suaza-ink-muted font-medium border-b border-r border-suaza-border min-w-[110px]">
              선수
            </th>
            {matches.map((m) => (
              <th
                key={m.id}
                className="py-3 px-2 font-normal border-b border-suaza-border min-w-[100px] align-middle"
              >
                <Link
                  href={`/matches/${m.id}`}
                  className="flex flex-col items-center gap-1 hover:underline"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-suaza-ink text-xs">
                      {shortDate(m.matchDate)}
                    </span>
                    <ResultBadge match={m} small />
                  </div>
                  <span className="text-[10px] text-suaza-ink-faint whitespace-nowrap">
                    {m.opponent}
                  </span>
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const isMe = m.id === myId;
            const row = cellByPlayer.get(m.id);
            return (
              <tr key={m.id} className={isMe ? "bg-red-50/60" : "bg-white"}>
                <td
                  className={`sticky left-0 z-10 py-2.5 px-3 border-b border-r border-suaza-border whitespace-nowrap ${
                    isMe ? "bg-red-50/60" : "bg-white"
                  }`}
                >
                  <Link
                    href={`/members/${m.id}`}
                    className={`inline-flex items-baseline gap-1.5 hover:underline ${
                      isMe ? "text-suaza-accent font-bold" : "text-suaza-ink"
                    }`}
                  >
                    {displayMemberName(m.name)}
                  </Link>
                </td>
                {matches.map((mt) => {
                  const cell = row?.get(mt.id);
                  return (
                    <td
                      key={mt.id}
                      className="py-2.5 px-1 text-center border-b border-suaza-border/60"
                    >
                      <MatrixCell cell={cell} shown={shown} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatrixCell({
  cell,
  shown,
}: {
  cell: MatchCell | undefined;
  shown: Set<StatKey>;
}) {
  const attended = !!cell;
  if (!attended) {
    // 미출전
    return shown.has("absent") ? (
      <span className="text-suaza-ink-faint">—</span>
    ) : (
      <span className="text-transparent">—</span>
    );
  }
  const chips: { key: StatKey; label: string; color: string; bg: string }[] = [];
  if (shown.has("goals") && cell.goals > 0) {
    chips.push({
      key: "goals",
      label: `골 ${cell.goals}`,
      color: "#EF3E3E",
      bg: "rgba(239,62,62,0.10)",
    });
  }
  if (shown.has("assists") && cell.assists > 0) {
    chips.push({
      key: "assists",
      label: `어시 ${cell.assists}`,
      color: "#3B82F6",
      bg: "rgba(59,130,246,0.10)",
    });
  }
  if (shown.has("cleanSheets") && cell.cleanSheets > 0) {
    chips.push({
      key: "cleanSheets",
      label: "CS",
      color: "#22C55E",
      bg: "rgba(34,197,94,0.10)",
    });
  }

  if (chips.length === 0) {
    return shown.has("attended") ? (
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-300" />
    ) : (
      <span className="text-transparent">·</span>
    );
  }

  return (
    <span className="inline-flex items-center justify-center gap-1 flex-wrap">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
          style={{ color: c.color, backgroundColor: c.bg }}
        >
          {c.label}
        </span>
      ))}
    </span>
  );
}

// ───────────────────────────────────────────────────────────
// 모바일 매치 카드
// ───────────────────────────────────────────────────────────

function MobileMatchCard({
  match,
  myCell,
}: {
  match: MatchListEntry;
  myCell: MatchCell | null;
}) {
  const sideColor =
    match.result === "W"
      ? "#22C55E"
      : match.result === "D"
        ? "#F59E0B"
        : match.result === "L"
          ? "#EF4444"
          : "#9CA3AF";
  return (
    <Link
      href={`/matches/${match.id}`}
      className="relative block rounded-xl border border-suaza-border bg-white hover:bg-gray-50 transition pl-3 pr-3 py-3"
    >
      <span
        aria-hidden
        className="absolute top-2 bottom-2 left-2 w-1 rounded-full"
        style={{ backgroundColor: sideColor }}
      />
      <div className="flex items-start gap-3 pl-2">
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <ResultBadge match={match} />
            <span className="text-sm font-bold text-suaza-ink">
              {shortDate(match.matchDate)}
            </span>
            <span className="text-sm text-suaza-ink-muted truncate">
              vs {match.opponent}
            </span>
          </div>
          {/* 본인 기록 */}
          {myCell ? (
            <div className="flex items-center gap-1 flex-wrap">
              {myCell.goals > 0 && (
                <Chip
                  label={`골 ${myCell.goals}`}
                  color="#EF3E3E"
                  bg="rgba(239,62,62,0.10)"
                />
              )}
              {myCell.assists > 0 && (
                <Chip
                  label={`어시 ${myCell.assists}`}
                  color="#3B82F6"
                  bg="rgba(59,130,246,0.10)"
                />
              )}
              {myCell.cleanSheets > 0 && (
                <Chip
                  label={`CS ${myCell.cleanSheets}`}
                  color="#22C55E"
                  bg="rgba(34,197,94,0.10)"
                />
              )}
            </div>
          ) : (
            <span className="inline-flex items-center self-start text-[11px] text-suaza-ink-muted bg-gray-100 px-2 py-0.5 rounded-full">
              미출전
            </span>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1.5 text-suaza-ink-muted text-sm">
          <span className="font-medium text-suaza-ink">
            {match.attendingCount}명
          </span>
          <span aria-hidden>›</span>
        </div>
      </div>
    </Link>
  );
}

function Chip({
  label,
  color,
  bg,
}: {
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold"
      style={{ color, backgroundColor: bg }}
    >
      {label}
    </span>
  );
}

// ───────────────────────────────────────────────────────────
// 공용
// ───────────────────────────────────────────────────────────

function ResultBadge({
  match,
  small,
}: {
  match: MatchListEntry;
  small?: boolean;
}) {
  const r = match.result;
  if (!r) return null;
  const color =
    r === "W" ? "#22C55E" : r === "D" ? "#F59E0B" : "#EF4444";
  const bg =
    r === "W"
      ? "rgba(34,197,94,0.12)"
      : r === "D"
        ? "rgba(245,158,11,0.12)"
        : "rgba(239,68,68,0.12)";
  return (
    <span
      className={`inline-flex items-center gap-1 ${
        small ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5"
      } rounded-full font-bold tabular-nums`}
      style={{ color, backgroundColor: bg }}
    >
      <span>{r}</span>
      {match.ourScore != null && match.opponentScore != null && (
        <span className="opacity-90">
          {match.ourScore}-{match.opponentScore}
        </span>
      )}
    </span>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
