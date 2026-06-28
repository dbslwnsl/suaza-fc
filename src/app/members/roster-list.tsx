"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  FOOT_LABEL,
  POSITION_COLOR,
  POSITIONS,
  type MemberTitle,
  type Position,
  type PreferredFoot,
} from "@/lib/members/positions";
import { getMemberBadges } from "@/lib/members/badges";
import AvatarBadges from "@/components/avatar-badges";

export type RosterMember = {
  id: string;
  name: string;
  displayName: string;
  initial: string;
  nickname: string | null;
  title: MemberTitle;
  role: string | null;
  positions: Position[];
  jerseyNumber: number | null;
  avatarUrl: string | null;
  birthDate: string | null;
  preferredFoot: PreferredFoot | null;
  isInjured: boolean;
  onLeave: boolean;
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  points: number;
  /** 시즌 카테고리 1위 (공동 1위 포함) */
  isGoalKing?: boolean;
  isAssistKing?: boolean;
  isCleanSheetKing?: boolean;
  isRefereeKing?: boolean;
  /** 이 회원이 MVP인 월 목록 (예: [3, 5]). 오름차순. */
  mvpMonths?: number[];
  /** 시즌 카테고리별 순위(1~3위). 없으면 null/undefined. */
  ranks?: {
    appearances?: number | null;
    goals?: number | null;
    assists?: number | null;
    cleanSheets?: number | null;
    referee?: number | null;
  };
  /** MOM 받은 횟수 (순위 아님 — 1회 이상이면 표기) */
  momCount?: number;
};

// 3번째 줄 순위 배지 — 표기 순서/라벨 (출전 → 골 → 어시 → 클린 → 심판, 그 뒤 월별 MVP)
const RANK_CATS: {
  key: keyof NonNullable<RosterMember["ranks"]>;
  label: string;
}[] = [
  { key: "appearances", label: "출전" },
  { key: "goals", label: "골" },
  { key: "assists", label: "어시" },
  { key: "cleanSheets", label: "클린" },
  { key: "referee", label: "심판" },
];

type Filter = "ALL" | Position;
type SortKey = "priority" | "name" | "age";

// 직책 기반 정렬 우선순위 (작을수록 먼저).
// 본인 → 회장 → 부회장 → 총무 → 감사 → 감독 → 코치 → 그 외(가나다순)
const TITLE_PRIORITY: Record<MemberTitle, number> = {
  president: 1,
  vice_president: 2,
  treasurer: 3,
  auditor: 4,
  head_coach: 5,
  coach: 6,
  player: 99,
};

// 생년월일(YYYY-MM-DD)에서 만나이 계산. 타임존 영향 없도록 문자열로 파싱.
function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const [y, mo, d] = birthDate.slice(0, 10).split("-").map(Number);
  if (!y || !mo || !d) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  const beforeBirthday =
    now.getMonth() + 1 < mo ||
    (now.getMonth() + 1 === mo && now.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

// 칩은 가나다순/나이순만 노출. "priority" 는 칩 없이 페이지 첫 진입 시의 기본 정렬로만 사용.
const SORT_OPTIONS: { key: Exclude<SortKey, "priority">; label: string }[] = [
  { key: "name", label: "가나다순" },
  { key: "age", label: "나이순" },
];

// 처음 클릭 시 기본 방향: 직책(우선순)·이름은 정순(asc), 나이는 많은순(desc)
const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  priority: "asc",
  name: "asc",
  age: "desc",
};

export default function RosterList({
  members,
  myId,
}: {
  members: RosterMember[];
  myId: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [sort, setSort] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const onSelectSort = (key: SortKey) => {
    if (key === sort) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSort(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  };

  const counts = useMemo(() => {
    const c: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
    // 주포지션(positions[0]) 기준으로만 카운트한다.
    for (const m of members) {
      const primary = m.positions[0];
      if (primary && primary in c) c[primary] += 1;
    }
    return c;
  }, [members]);

  const filtered = useMemo(() => {
    const base =
      filter === "ALL"
        ? members
        : members.filter((m) => m.positions.includes(filter));

    const byName = (a: RosterMember, b: RosterMember) =>
      a.name.localeCompare(b.name, "ko");
    // 나이순(많은→적은): 생년월일이 빠른(나이 많은) 순. 미입력은 뒤로.
    const byAge = (a: RosterMember, b: RosterMember) => {
      if (!a.birthDate && !b.birthDate) return byName(a, b);
      if (!a.birthDate) return 1;
      if (!b.birthDate) return -1;
      return a.birthDate.localeCompare(b.birthDate) || byName(a, b);
    };
    // 직책 우선순위 → 같은 직책 안에서는 가나다순. (본인은 아래쪽 self-pin 으로 맨 위 고정)
    const byPriority = (a: RosterMember, b: RosterMember) => {
      const ra = TITLE_PRIORITY[a.title] ?? 99;
      const rb = TITLE_PRIORITY[b.title] ?? 99;
      if (ra !== rb) return ra - rb;
      return byName(a, b);
    };
    const baseComp =
      sort === "age" ? byAge : sort === "priority" ? byPriority : byName;
    // sort 별 "기본 방향" 과 현재 방향이 같으면 그대로, 다르면 반전
    const baseIsAsc = DEFAULT_DIR[sort] === "asc";
    const reverse = sortDir === (baseIsAsc ? "desc" : "asc");
    const comparator = reverse
      ? (a: RosterMember, b: RosterMember) => -baseComp(a, b)
      : baseComp;

    const sorted = [...base].sort(comparator);

    // 로그인 본인은 항상 맨 위로 (하이라이트 유지)
    if (myId) {
      const idx = sorted.findIndex((m) => m.id === myId);
      if (idx > 0) sorted.unshift(sorted.splice(idx, 1)[0]);
    }
    return sorted;
  }, [members, filter, sort, sortDir, myId]);

  return (
    <div className="flex flex-col gap-4">
      {/* 포지션 필터 칩 (한 줄) — 좌측 정렬 */}
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

      {/* 정렬 칩 */}
      <div className="flex items-center gap-1.5 desktop:gap-2">
        {SORT_OPTIONS.map((opt) => (
          <SortChip
            key={opt.key}
            label={opt.label}
            active={sort === opt.key}
            dir={sort === opt.key ? sortDir : null}
            onClick={() => onSelectSort(opt.key)}
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
              <MemberCard member={m} isMe={m.id === myId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SortChip({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc" | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 desktop:gap-1.5 px-2 desktop:px-3 py-0.5 desktop:py-1 rounded-full text-xs desktop:text-sm font-medium transition shrink-0 ${
        active
          ? "bg-suaza-ink text-white border border-suaza-ink"
          : "bg-white text-suaza-ink border border-suaza-border hover:bg-gray-100"
      }`}
    >
      {label}
      {active && dir && (
        <span className="text-[10px]">{dir === "desc" ? "↓" : "↑"}</span>
      )}
    </button>
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
          className="hidden desktop:block w-1.5 h-1.5 rounded-full"
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

function MemberCard({
  member: m,
  isMe = false,
}: {
  member: RosterMember;
  isMe?: boolean;
}) {
  const primary = m.positions[0] ?? null;
  const ringColor = primary ? POSITION_COLOR[primary] : "var(--suaza-border)";
  // 아바타 좌상단 수상 뱃지(득점왕·어시왕 등)는 3번째 줄 순위 배지로 대체 — 제거.
  const { titleBadges } = getMemberBadges({
    title: m.title,
    role: m.role,
  });
  const age = calcAge(m.birthDate);
  const [lightbox, setLightbox] = useState(false);

  return (
    <Link
      href={`/members/${m.id}`}
      prefetch={false}
      className={`block p-4 desktop:p-5 rounded-xl transition ${
        isMe
          ? "border-2 border-suaza-accent bg-red-50/60 hover:bg-red-50"
          : "border border-suaza-border bg-white hover:bg-gray-50"
      }`}
    >
      <div className="flex items-center gap-3 desktop:gap-4">
        <div className="shrink-0 flex flex-col items-center gap-1">
          <div className="relative">
            <div
              role={m.avatarUrl ? "button" : undefined}
              aria-label={m.avatarUrl ? `${m.name} 사진 보기` : undefined}
              onClick={
                m.avatarUrl
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setLightbox(true);
                    }
                  : undefined
              }
              className={`relative w-12 h-12 desktop:w-14 desktop:h-14 rounded-full bg-gray-100 flex items-center justify-center border-2 overflow-hidden ${
                m.avatarUrl ? "cursor-zoom-in" : ""
              }`}
              style={{ borderColor: ringColor }}
            >
              {m.avatarUrl ? (
                <Image
                  src={m.avatarUrl}
                  alt={m.name}
                  fill
                  sizes="(min-width: 768px) 56px, 48px"
                  className="object-cover"
                />
              ) : (
                <span className="text-base desktop:text-lg font-bold text-suaza-ink">
                  {m.initial}
                </span>
              )}
            </div>
            <AvatarBadges
              titleBadges={titleBadges}
              size="xs"
              titlePlacement="bottom-center"
            />
            {/* 월별 MVP — 아바타 우상단엔 가장 최근 달 메달만. 이전 달은 이름줄 나이 옆으로. */}
            {m.mvpMonths && m.mvpMonths.length > 0 && (
              <span className="absolute -top-2.5 -right-1 z-20">
                <MvpMedal month={Math.max(...m.mvpMonths)} />
              </span>
            )}
          </div>
          {m.jerseyNumber != null && (
            <span className="mt-1 text-suaza-accent font-bold text-sm leading-none">
              #{m.jerseyNumber}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="font-bold text-suaza-ink shrink-0 whitespace-nowrap">
                {m.displayName}
              </span>
              {m.nickname && (
                <span
                  className="text-sm font-medium truncate min-w-0"
                  style={{ color: "#338CF2" }}
                >
                  @{m.nickname}
                </span>
              )}
              {age != null && (
                <span
                  className="text-xs shrink-0"
                  style={{ color: "#BDC4CF" }}
                >
                  {age}세
                </span>
              )}
              {m.isInjured && (
                <span
                  className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-[4px] bg-suaza-accent text-white font-bold leading-none"
                  role="img"
                  aria-label="부상"
                  title="부상"
                >
                  <svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="currentColor" aria-hidden>
                    <path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" />
                  </svg>
                </span>
              )}
              {m.onLeave && (
                <span
                  className="shrink-0 inline-flex items-center justify-center w-4 h-4 text-[13px] leading-none"
                  role="img"
                  aria-label="장기불참"
                  title="장기불참"
                >
                  🚫
                </span>
              )}
            </div>
          </div>

          {/* 포지션 + 주발 (주발을 부포지션 오른쪽에 배치) */}
          {(m.positions.length > 0 || m.preferredFoot) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {m.positions.map((p) => (
                <PositionChip key={p} position={p} />
              ))}
              {m.preferredFoot && <FootChip foot={m.preferredFoot} />}
            </div>
          )}

          {/* 3번째 줄 — 카테고리 순위(1~3위) + 월별 MVP.
              표기할 게 없으면 줄을 그리지 않아, 2줄 카드는 가운데 정렬로 둔다. */}
          {(RANK_CATS.some(({ key }) => m.ranks?.[key]) ||
            (m.momCount ?? 0) > 0 ||
            (m.mvpMonths?.length ?? 0) > 0) && (
            <div className="flex items-center gap-1 flex-wrap">
              {RANK_CATS.map(({ key, label }) => {
                const rank = m.ranks?.[key];
                return rank ? (
                  <RankChip key={key} label={label} rank={rank} />
                ) : null;
              })}
              {(m.momCount ?? 0) > 0 && <MomChip count={m.momCount!} />}
              {[...(m.mvpMonths ?? [])]
                .sort((a, b) => a - b)
                .map((mo) => (
                  <MvpMedal key={`mvp-${mo}`} month={mo} size="sm" />
                ))}
            </div>
          )}
        </div>
      </div>

      {lightbox &&
        m.avatarUrl &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-label={`${m.name} 사진`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLightbox(false);
            }}
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6"
          >
            <div className="relative w-full h-full max-w-[90vw] max-h-[85vh]">
              <Image
                src={m.avatarUrl}
                alt={m.name}
                fill
                sizes="90vw"
                className="object-contain"
              />
            </div>
          </div>,
          document.body,
        )}
    </Link>
  );
}


// MOM 횟수 배지 — 예: "MOM3회". 순위가 아니라 받은 사람 전부 표기.
function MomChip({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center h-[18px] px-1.5 rounded-[4px] text-[11px] font-bold leading-none bg-violet-100 text-violet-700">
      MOM{count}회
    </span>
  );
}

// 시즌 카테고리 순위 배지 — 예: "골1위". 1위 금, 2위 은, 3위 동 색상.
function RankChip({ label, rank }: { label: string; rank: number }) {
  const cls =
    rank === 1
      ? "bg-amber-100 text-amber-800"
      : rank === 2
        ? "bg-gray-200 text-gray-700"
        : "bg-orange-100 text-orange-800";
  return (
    <span
      className={`inline-flex items-center h-[18px] px-1.5 rounded-[4px] text-[11px] font-bold leading-none ${cls}`}
    >
      {label}
      {rank}위
    </span>
  );
}

// 월별 MVP 금메달 — 선버스트 메달 안에 월(예: "5월") 표기, 상단에 별.
function MvpMedal({ month, size = "md" }: { month: number; size?: "md" | "sm" }) {
  const label = `${month}월 MVP`;
  const sizeCls =
    size === "sm" ? "w-5 h-5" : "w-7 h-7 desktop:w-8 desktop:h-8";
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-block ${sizeCls} drop-shadow-sm`}
    >
      <svg viewBox="0 0 32 32" className="w-full h-full" aria-hidden>
        {/* 햇살(선버스트) 메달 외곽 */}
        <polygon
          points="16,0.5 18.72,5.86 23.75,2.58 23.42,8.58 29.42,8.25 26.14,13.28 31.5,16 26.14,18.72 29.42,23.75 23.42,23.42 23.75,29.42 18.72,26.14 16,31.5 13.28,26.14 8.25,29.42 8.58,23.42 2.58,23.75 5.86,18.72 0.5,16 5.86,13.28 2.58,8.25 8.58,8.58 8.25,2.58 13.28,5.86"
          fill="#F59E0B"
          stroke="#FFFFFF"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {/* 안쪽 원판 */}
        <circle cx="16" cy="16" r="9.5" fill="#FBBF24" stroke="#FFFFFF" strokeWidth="1" />
        {/* 월 표기 (예: 5월) */}
        <text
          x="16"
          y="20"
          textAnchor="middle"
          fontSize={month >= 10 ? 7 : 8.5}
          fontWeight="800"
          fill="#7C2D12"
        >
          {month}월
        </text>
      </svg>
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

function FootChip({ foot }: { foot: PreferredFoot }) {
  return (
    <span className="inline-flex items-center text-[11px] desktop:text-xs px-2 py-0.5 rounded-full font-medium bg-suaza-bg text-suaza-ink-muted">
      {FOOT_LABEL[foot]}
    </span>
  );
}
