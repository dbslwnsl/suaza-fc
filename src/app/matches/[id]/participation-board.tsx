"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  addParticipant,
  incrementStat,
  setAttendanceFor,
  unrecordParticipant,
} from "@/lib/matches/actions";
import {
  POSITION_COLOR,
  TITLE_LABEL,
  type MemberTitle,
  type Position,
} from "@/lib/members/positions";
import { POINTS_WEIGHT_CUTOFF_MS } from "@/lib/stats/helpers";

type Player = {
  id: string;
  name: string;
  jersey_number: number | null;
  positions: Position[] | null;
  title: MemberTitle | null;
};

type Stats = {
  goals: number;
  assists: number;
  clean_sheets: number;
  referee_count: number;
  mom: number;
  win_points: number;
  attendance: number;
};

export type ParticipationData = {
  id: string;
  player_id: string;
  goals: number;
  assists: number;
  custom_stats: Record<string, number> | null;
  player: Player;
};

type StatKey = keyof Stats;

const STAT_META: {
  key: StatKey;
  label: string;
  icon: string;
  color: string;
  bg: string;
  weight: number;
  locked?: boolean;
}[] = [
  {
    key: "goals",
    label: "골",
    icon: "⚽",
    color: "#22C55E",
    bg: "rgba(34,197,94,0.10)",
    weight: 3,
  },
  {
    key: "assists",
    label: "어시",
    icon: "🅰",
    color: "#A855F7",
    bg: "rgba(168,85,247,0.10)",
    weight: 2,
  },
  {
    key: "clean_sheets",
    label: "클린",
    icon: "🛡️",
    color: "#338CF2",
    bg: "rgba(51,140,242,0.10)",
    weight: 2,
  },
  {
    key: "referee_count",
    label: "심판",
    icon: "🟨",
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.10)",
    weight: 1,
  },
  {
    key: "mom",
    label: "MOM",
    icon: "🏆",
    color: "#EAB308",
    bg: "rgba(234,179,8,0.10)",
    weight: 0,
  },
  {
    key: "win_points",
    label: "승점",
    icon: "🏅",
    color: "#EC4899",
    bg: "rgba(236,72,153,0.10)",
    weight: 0,
  },
  {
    key: "attendance",
    label: "출석",
    icon: "✓",
    color: "#14B8A6",
    bg: "rgba(20,184,166,0.10)",
    weight: 1,
    locked: true,
  },
];

function readStats(p: ParticipationData): Stats {
  return {
    goals: p.goals ?? 0,
    assists: p.assists ?? 0,
    clean_sheets: p.custom_stats?.clean_sheets ?? 0,
    referee_count: p.custom_stats?.referee_count ?? 0,
    mom: p.custom_stats?.mom ?? 0,
    win_points: p.custom_stats?.win_points ?? 0,
    // 출석은 active participation 이면 기본 1점
    attendance: p.custom_stats?.attendance ?? 1,
  };
}

// weights: 항목별 기준점수 맵 (없으면 STAT_META 기본 가중치 사용)
function calcPoints(s: Stats, weights?: Record<string, number>): number {
  let sum = 0;
  for (const meta of STAT_META) {
    const w = weights?.[meta.key] ?? meta.weight;
    sum += s[meta.key] * w;
  }
  return sum;
}

export default function ParticipationBoard({
  matchId,
  participations,
  attendingMembers,
  isStaff,
  isManager,
  isStarted,
  pointValues,
  matchDate,
}: {
  matchId: string;
  participations: ParticipationData[];
  attendingMembers: Player[];
  isStaff: boolean;
  isManager: boolean;
  isStarted: boolean;
  pointValues?: Record<string, number>;
  matchDate?: string | null;
}) {
  const canEdit = isStaff && isStarted;
  // 기준일 이전 경기는 직접 입력한 포인트(custom_stats.points) 를 그대로 사용
  const useStoredPoints = matchDate
    ? new Date(matchDate).getTime() < POINTS_WEIGHT_CUTOFF_MS
    : false;
  const [edited, setEdited] = useState<Map<string, Stats>>(() => {
    const m = new Map<string, Stats>();
    for (const p of participations) m.set(p.id, readStats(p));
    return m;
  });
  const [, startTransition] = useTransition();

  const recordedCount = participations.length;
  const totalCount = recordedCount + attendingMembers.length;

  // 합계 포인트
  const totalPoints = useMemo(() => {
    let sum = 0;
    for (const p of participations) {
      if (useStoredPoints) {
        sum += p.custom_stats?.points ?? 0;
      } else {
        const s = edited.get(p.id);
        if (s) sum += calcPoints(s, pointValues);
      }
    }
    return sum;
  }, [edited, participations, pointValues, useStoredPoints]);

  // 기록 중인 선수 리스트 (본인 포함 전체)
  const others = participations;

  // 서버 데이터 바뀌면 (action 후 revalidate) edited 를 서버 기준으로 재동기화.
  useEffect(() => {
    const next = new Map<string, Stats>();
    for (const p of participations) {
      next.set(p.id, readStats(p));
    }
    setEdited(next);
  }, [participations]);

  // 클릭 시 optimistic UI + 백그라운드 서버 저장
  const updateStat = (id: string, key: StatKey, delta: number) => {
    // 출석은 고정 1점 (UI 가 막아주지만 안전장치)
    if (key === "attendance") return;
    setEdited((prev) => {
      const next = new Map(prev);
      let cur = next.get(id);
      if (!cur) {
        const p = participations.find((pp) => pp.id === id);
        if (!p) return prev;
        cur = readStats(p);
      }
      const newVal = Math.max(0, cur[key] + delta);
      next.set(id, { ...cur, [key]: newVal });
      return next;
    });
    startTransition(() => {
      incrementStat(id, matchId, key, delta);
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-suaza-border desktop:border-0 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-5 desktop:p-8 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="font-bold text-suaza-ink text-lg">선수별 기록</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
            {recordedCount}/{totalCount}
            <span className="hidden desktop:inline"> 명 기록 완료</span>
          </span>
        </div>
        {isStaff && isManager && (
          <Link
            href="/settings/stats"
            className="text-xs text-suaza-accent hover:underline"
          >
            <span className="hidden desktop:inline">항목 </span>관리 ›
          </Link>
        )}
      </div>

      {/* 시작 전 안내 */}
      {!isStarted && isStaff && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          🔒 경기 시작 전에는 기록을 입력할 수 없습니다. 상단의{" "}
          <span className="font-bold">"경기 시작"</span> 버튼을 누르거나 경기
          시각이 지나야 활성화됩니다.
        </div>
      )}

      {/* Points formula */}
      <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-center gap-1.5 flex-wrap text-xs">
        <span className="text-suaza-ink-faint">
          ⓘ 포인트<span className="hidden desktop:inline"> 계산</span>
        </span>
        {STAT_META.map((s, i) => (
          <span key={s.key} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-suaza-ink-faint">+</span>}
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium"
              style={{ color: s.color, backgroundColor: s.bg }}
            >
              <span>{s.icon}</span>
              <span className="hidden desktop:inline">{s.label} </span>×{s.weight}
            </span>
          </span>
        ))}
        <span className="text-suaza-ink-faint">= ⭐</span>
      </div>

      {/* Quick add — 내 기록 위 */}
      {isStaff && (
        <div className="border-2 border-dashed border-suaza-border rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-suaza-ink text-sm">
              + 기록 시작
            </span>
            <span className="text-xs text-suaza-ink-faint">
              참석 멤버에서 빠르게 선택
            </span>
          </div>
          {attendingMembers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {attendingMembers.map((m) => (
                <QuickAddChip
                  key={m.id}
                  member={m}
                  matchId={matchId}
                  isManager={isManager}
                  isStarted={isStarted}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-suaza-ink-faint py-1">
              아직 추가할 참석 멤버가 없어요
            </p>
          )}
        </div>
      )}


      {/* Other players */}
      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-suaza-ink text-sm">
              기록 중인 선수 {others.length}
            </span>
            {isStaff && (
              <span className="text-xs text-suaza-ink-faint">
                · 탭 +1 & 길게 눌러 ±
              </span>
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {others.map((p) => (
              <OtherPlayerRow
                key={p.id}
                p={p}
                matchId={matchId}
                stats={edited.get(p.id) ?? readStats(p)}
                onChangeStat={(key, delta) => updateStat(p.id, key, delta)}
                isStaff={isStaff}
                canEditStats={canEdit}
                pointValues={pointValues}
                storedPoints={useStoredPoints ? p.custom_stats?.points ?? 0 : null}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Footer — 합계 정보만 */}
      <div className="pt-3 border-t border-suaza-border text-sm text-suaza-ink-muted">
        기록 합계{" "}
        <span className="text-suaza-accent font-bold text-lg">
          {totalPoints}
        </span>{" "}
        <span className="text-xs">pt</span>
        <span className="text-suaza-ink-faint"> · {recordedCount}명 기록</span>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────
// Other player row
// ───────────────────────────────────────────────────────────

function OtherPlayerRow({
  p,
  matchId,
  stats,
  onChangeStat,
  isStaff,
  canEditStats,
  pointValues,
  storedPoints,
}: {
  p: ParticipationData;
  matchId: string;
  stats: Stats;
  onChangeStat: (key: StatKey, delta: number) => void;
  isStaff: boolean;
  canEditStats: boolean;
  pointValues?: Record<string, number>;
  storedPoints?: number | null;
}) {
  const points =
    storedPoints != null ? storedPoints : calcPoints(stats, pointValues);
  const trailing = (
    <>
      <PointStar points={points} small />
      {isStaff && (
        <form action={unrecordParticipant.bind(null, p.id, matchId)}>
          <button
            type="submit"
            aria-label={`${p.player.name} 기록에서 제외`}
            className="w-5 h-5 inline-flex items-center justify-center rounded text-suaza-ink-faint hover:text-red-600 hover:bg-red-50 transition text-sm leading-none"
          >
            ✕
          </button>
        </form>
      )}
    </>
  );
  return (
    <li className="border border-suaza-border rounded-xl p-3 flex flex-col desktop:flex-row desktop:items-center gap-2 desktop:gap-3">
      <div className="flex items-center justify-between gap-2 desktop:flex-1">
        <PlayerInfo player={p.player} />
        <div className="flex items-center gap-1.5 desktop:hidden">{trailing}</div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap desktop:justify-end">
        {STAT_META.map((s) => (
          <StatChip
            key={s.key}
            meta={s}
            value={stats[s.key]}
            onChange={(delta) => onChangeStat(s.key, delta)}
            disabled={!canEditStats}
          />
        ))}
        <span className="hidden desktop:inline-flex items-center gap-1.5">
          {trailing}
        </span>
      </div>
    </li>
  );
}

function StatChip({
  meta,
  value,
  onChange,
  disabled,
}: {
  meta: (typeof STAT_META)[number];
  value: number;
  onChange: (delta: number) => void;
  disabled?: boolean;
}) {
  const active = value > 0;
  const locked = meta.locked === true;
  const interactive = !disabled && !locked;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const cancelTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const startTimer = () => {
    if (!interactive) return;
    longPressFired.current = false;
    cancelTimer();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setPopoverOpen(true);
    }, 450);
  };
  const handleClick = () => {
    if (!interactive) return;
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    onChange(+1);
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={handleClick}
        onMouseDown={startTimer}
        onMouseUp={cancelTimer}
        onMouseLeave={cancelTimer}
        onTouchStart={startTimer}
        onTouchEnd={cancelTimer}
        onTouchCancel={cancelTimer}
        onContextMenu={(e) => e.preventDefault()}
        disabled={disabled}
        aria-disabled={locked}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border-2 text-xs transition select-none disabled:opacity-60 disabled:cursor-not-allowed ${
          locked ? "cursor-default" : "hover:opacity-80"
        }`}
        style={
          active
            ? {
                color: meta.color,
                borderColor: meta.color,
                backgroundColor: meta.bg,
              }
            : {
                color: "var(--suaza-ink-faint)",
                borderColor: "var(--suaza-border)",
                backgroundColor: "transparent",
              }
        }
      >
        <span>{meta.icon}</span>
        <span className="font-bold">{value}</span>
      </button>
      {popoverOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setPopoverOpen(false)}
            onTouchStart={() => setPopoverOpen(false)}
          />
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40 flex items-stretch rounded-lg overflow-hidden shadow-lg select-none"
            style={{
              backgroundColor: meta.bg,
              border: `2px solid ${meta.color}`,
            }}
          >
            <button
              type="button"
              onClick={() => onChange(-1)}
              disabled={value === 0}
              className="px-3 py-1 text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed transition hover:opacity-90"
              style={{ backgroundColor: meta.color }}
              aria-label={`${meta.label} 감소`}
            >
              −
            </button>
            <span
              className="px-4 py-1 text-sm font-bold bg-white min-w-[2.5rem] text-center"
              style={{ color: meta.color }}
            >
              {value}
            </span>
            <button
              type="button"
              onClick={() => onChange(+1)}
              className="px-3 py-1 text-sm font-bold text-white transition hover:opacity-90"
              style={{ backgroundColor: meta.color }}
              aria-label={`${meta.label} 증가`}
            >
              +
            </button>
          </div>
        </>
      )}
    </span>
  );
}

// ───────────────────────────────────────────────────────────
// Player info (avatar + name + meta)
// ───────────────────────────────────────────────────────────

function PlayerInfo({
  player,
  large,
}: {
  player: Player;
  large?: boolean;
}) {
  const positions = (player.positions ?? []) as Position[];
  const primary = positions[0];
  const ringColor = primary
    ? POSITION_COLOR[primary]
    : "var(--suaza-border)";

  const size = large ? "w-11 h-11 desktop:w-14 desktop:h-14" : "w-11 h-11";
  const textSize = large ? "text-base" : "text-base";
  const numberSize = large ? "text-base" : "text-sm";

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div
        className={`${size} rounded-full border-2 flex items-center justify-center bg-white shrink-0`}
        style={{ borderColor: ringColor }}
      >
        <span className="text-suaza-ink-muted font-bold">
          {player.name.charAt(0)}
        </span>
      </div>
      <div className="flex flex-col min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className={`font-bold text-suaza-ink ${textSize}`}>
            {player.name}
          </span>
          {player.jersey_number != null && (
            <span
              className={`${numberSize} font-bold`}
              style={{ color: "#22C55E" }}
            >
              #{player.jersey_number}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          {positions.map((pos) => (
            <span
              key={pos}
              className="inline-flex items-center gap-1 font-bold"
              style={{ color: POSITION_COLOR[pos] }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: POSITION_COLOR[pos] }}
              />
              {pos}
            </span>
          ))}
          {player.title && (
            <>
              {positions.length > 0 && (
                <span className="text-suaza-ink-faint">·</span>
              )}
              <span className="text-suaza-ink-muted">
                {TITLE_LABEL[player.title]}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PointStar({ points, small }: { points: number; small?: boolean }) {
  const muted = points === 0;
  if (small) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
          muted ? "bg-gray-100 text-suaza-ink-faint" : "bg-suaza-accent text-white"
        }`}
      >
        <span>{muted ? "☆" : "★"}</span>
        {points} <span className="text-[10px] font-normal">pt</span>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 desktop:px-3 desktop:py-1.5 rounded-full text-sm desktop:text-base font-bold ${
        muted ? "bg-gray-100 text-suaza-ink-faint" : "bg-suaza-accent text-white"
      }`}
    >
      <span>{muted ? "☆" : "★"}</span>
      {points} <span className="text-[10px] desktop:text-xs font-normal">pt</span>
    </span>
  );
}

// ───────────────────────────────────────────────────────────
// Quick add chip
// ───────────────────────────────────────────────────────────

function QuickAddChip({
  member,
  matchId,
  isManager,
  isStarted,
}: {
  member: Player;
  matchId: string;
  isManager: boolean;
  isStarted: boolean;
}) {
  const positions = (member.positions ?? []) as Position[];
  const primary = positions[0];
  const color = primary ? POSITION_COLOR[primary] : "#9CA3AF";

  return (
    <div className="inline-flex items-center border border-suaza-border rounded-md overflow-hidden bg-white">
      <form action={addParticipant.bind(null, matchId)} className="contents">
        <input type="hidden" name="player_id" value={member.id} />
        <button
          type="submit"
          className="inline-flex items-center gap-1 pl-1 pr-2 py-1 text-xs hover:bg-gray-50 transition"
        >
          <span
            className="w-5 h-5 rounded text-white text-[10px] font-bold flex items-center justify-center"
            style={{ backgroundColor: color }}
          >
            {member.jersey_number ?? "?"}
          </span>
          <span className="text-suaza-ink font-medium">{member.name}</span>
        </button>
      </form>
      {isManager && !isStarted && (
        <form
          action={setAttendanceFor.bind(null, matchId, member.id, "absent")}
          className="contents"
        >
          <button
            type="submit"
            aria-label={`${member.name} 후보에서 제외`}
            className="px-1.5 py-1 text-suaza-ink-faint hover:text-red-600 hover:bg-red-50 transition border-l border-suaza-border text-xs"
          >
            ✕
          </button>
        </form>
      )}
    </div>
  );
}
