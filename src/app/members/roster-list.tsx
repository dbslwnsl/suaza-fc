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
};

type Filter = "ALL" | Position;
type SortKey = "name" | "age";

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

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "가나다순" },
  { key: "age", label: "나이순" },
];

// 처음 클릭 시 기본 방향: 이름은 가나다 정순(asc), 나이는 많은순(desc)
const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
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
  const [sort, setSort] = useState<SortKey>("name");
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
    for (const m of members) {
      for (const p of m.positions) c[p] += 1;
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
    const baseComp = sort === "age" ? byAge : byName;
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

function MemberCard({
  member: m,
  isMe = false,
}: {
  member: RosterMember;
  isMe?: boolean;
}) {
  const primary = m.positions[0] ?? null;
  const ringColor = primary ? POSITION_COLOR[primary] : "var(--suaza-border)";
  const { titleBadges, awardBadges } = getMemberBadges({
    title: m.title,
    role: m.role,
  });
  const age = calcAge(m.birthDate);
  const [lightbox, setLightbox] = useState(false);

  return (
    <Link
      href={`/members/${m.id}`}
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
              awardBadges={awardBadges}
              size="xs"
            />
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
              <span className="font-bold text-suaza-ink truncate">
                {m.displayName}
              </span>
              {m.nickname && (
                <span
                  className="text-sm font-medium truncate"
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
                  className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-[4px] bg-suaza-ink-muted text-white font-bold leading-none"
                  role="img"
                  aria-label="장기불참"
                  title="장기불참"
                >
                  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor" aria-hidden>
                    <rect x="3" y="10" width="18" height="4" rx="1" />
                  </svg>
                </span>
              )}
            </div>
          </div>

          {m.positions.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {m.positions.map((p) => (
                <PositionChip key={p} position={p} />
              ))}
            </div>
          )}

          {m.preferredFoot && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <FootChip foot={m.preferredFoot} />
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
