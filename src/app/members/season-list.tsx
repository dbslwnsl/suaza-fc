"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  aggregateSeason,
  buildRichSeasonStats,
  type MatchResult,
  type MatchSummary,
  type ParticipationRow,
  type PlayerSeasonStat,
  type RichPlayerSeasonStat,
  type StatDef,
} from "@/lib/stats/helpers";
import { displayMemberName } from "@/lib/members/name";

export type RosterBase = {
  player_id: string;
  name: string;
  jersey_number: number | null;
};

type SortKey =
  | "points"
  | "appearances"
  | "wins"
  | "goals"
  | "assists"
  | "attackPoints"
  | "cleanSheets"
  | "mom"
  | "refereeCount"
  | "attendanceRate"
  | "recent5Wins"
  | "name";

// "선수"(이름) 컬럼은 클릭 시 asc(가나다 정순) 가 자연스러움
const DEFAULT_DIR: Partial<Record<SortKey, "desc" | "asc">> = {
  name: "asc",
};

export default function SeasonList({
  myId,
  year,
  years,
  roster,
  matches,
  parts,
  defs,
  totalMembers,
}: {
  myId: string | null;
  year: number;
  years: number[];
  roster: RosterBase[];
  matches: MatchSummary[];
  parts: ParticipationRow[];
  defs: StatDef[];
  totalMembers: number;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const onSelectSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key] ?? "desc");
    }
  };
  // 0 = 시즌 전체, 1~12 = 해당 월
  const [month, setMonth] = useState(0);

  // 선택된 기간에 해당하는 match / participation 만 추림
  const period = useMemo(() => {
    if (month < 1 || month > 12) {
      return { ms: matches, ps: parts };
    }
    const ms = matches.filter((m) => {
      const d = new Date(m.match_date);
      return d.getMonth() + 1 === month;
    });
    const allowedIds = new Set(ms.map((m) => m.id));
    const ps = parts.filter((p) => allowedIds.has(p.match_id));
    return { ms, ps };
  }, [matches, parts, month]);

  // 기간 필터된 데이터로 stats 집계
  const stats: RichPlayerSeasonStat[] = useMemo(() => {
    const aggregated = aggregateSeason(period.ps, defs);
    const statsMap = new Map<string, PlayerSeasonStat>(
      aggregated.map((s) => [s.player_id, s]),
    );
    const base: PlayerSeasonStat[] = roster.map(
      (m) =>
        statsMap.get(m.player_id) ?? {
          player_id: m.player_id,
          name: m.name,
          jersey_number: m.jersey_number,
          appearances: 0,
          goals: 0,
          assists: 0,
          custom: {},
        },
    );
    return buildRichSeasonStats(base, period.ps, period.ms);
  }, [period, roster, defs]);

  const activeCount = stats.filter((s) => s.appearances > 0).length;

  const sortedAll = useMemo(() => {
    const sign = sortDir === "desc" ? 1 : -1;
    const getVal = (
      row: RichPlayerSeasonStat,
    ): number | string => {
      if (sortKey === "name") return row.name;
      if (sortKey === "recent5Wins")
        return row.recent5.filter((r) => r === "W").length;
      return row[sortKey];
    };
    return [...stats].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (typeof av === "string" || typeof bv === "string") {
        const cmp = String(av).localeCompare(String(bv), "ko");
        if (cmp !== 0) return cmp * sign;
        return 0;
      }
      if (av !== bv) return (bv - av) * sign;
      return a.name.localeCompare(b.name, "ko");
    });
  }, [stats, sortKey, sortDir]);

  // 순위는 정렬 결과의 인덱스 + 1 (기록 없어도 모든 회원이 포함됨)
  const ranked = useMemo(
    () => sortedAll.map((s, i) => ({ ...s, rank: i + 1 })),
    [sortedAll],
  );
  const rankedAll = ranked;

  const filtered = ranked;

  const me = myId ? rankedAll.find((s) => s.player_id === myId) ?? null : null;

  return (
    <section className="flex flex-col gap-5">
      {/* 시즌 칩 + 인원 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SeasonSelector year={year} years={years} />
          <MonthDropdown month={month} onChange={setMonth} year={year} />
        </div>
        <span className="shrink-0 text-xs text-suaza-ink-muted bg-gray-100 px-3 py-1 rounded-full">
          총 {totalMembers}명
          <span className="hidden desktop:inline"> · 활동 {activeCount}명</span>
        </span>
      </div>

      {/* 나의 기록 카드 */}
      {me && <MyCard me={me} />}

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-suaza-ink-muted py-10">
          이번 시즌 출전 기록이 없습니다
        </p>
      ) : (
        <>
          {/* 데스크톱 테이블 */}
          <div className="hidden desktop:block">
            <DesktopTable
              rows={filtered}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSelectSort}
              myId={myId}
            />
          </div>
          {/* 모바일 테이블 (가로 스크롤 + 좌우 sticky) */}
          <div className="desktop:hidden">
            <MobileTable
              rows={filtered}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSelectSort}
              myId={myId}
            />
          </div>
        </>
      )}

    </section>
  );
}

// ───────────────────────────────────────────────────────────
// 시즌 선택 + 정렬 칩
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
        const href = `/members?tab=season&year=${y}`;
        return (
          <Link
            key={y}
            href={href}
            className={`shrink-0 inline-flex items-center px-2 desktop:px-3 py-0.5 desktop:py-1 rounded-lg text-xs desktop:text-sm font-bold transition ${
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

function MonthDropdown({
  month,
  onChange,
}: {
  month: number;
  onChange: (m: number) => void;
  year: number;
}) {
  const [open, setOpen] = useState(false);
  const active = month >= 1 && month <= 12;
  const label = active ? `${month}월` : "전체";
  const options = [0, ...Array.from({ length: 12 }, (_, i) => i + 1)];

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-2 desktop:px-3 py-0.5 desktop:py-1 rounded-lg text-xs desktop:text-sm font-bold border transition ${
          active
            ? "bg-suaza-ink text-white border-suaza-ink"
            : "bg-white text-suaza-ink border-suaza-border hover:bg-gray-50"
        }`}
      >
        <span>{label}</span>
        <span
          aria-hidden
          className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>
      {open && (
        <>
          {/* 외부 클릭 닫기 오버레이 */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            onTouchStart={() => setOpen(false)}
          />
          {/* 드롭다운 메뉴 */}
          <div className="absolute top-full left-0 mt-1 z-40 bg-white border border-suaza-border rounded-lg shadow-lg overflow-hidden min-w-[100px] max-h-60 overflow-y-auto">
            {options.map((m) => {
              const isActive = m === month;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onChange(m);
                    setOpen(false);
                  }}
                  className={`block w-full text-left px-3 py-2 text-sm transition ${
                    isActive
                      ? "bg-red-50 text-suaza-accent font-bold"
                      : "text-suaza-ink hover:bg-gray-50"
                  }`}
                >
                  {m === 0 ? "전체" : `${m}월`}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 나의 기록 카드
// ───────────────────────────────────────────────────────────

type RowWithRank = RichPlayerSeasonStat & { rank: number };

function MyCard({ me }: { me: RowWithRank }) {
  return (
    <div className="rounded-2xl border-2 border-suaza-accent bg-red-50/60 p-4 desktop:px-5 desktop:py-4 flex flex-col gap-3 desktop:gap-4">
      {/* 모바일 레이아웃: 한 줄 (★나의기록 · 이름 · 전체순위 · 포인트) */}
      <div className="desktop:hidden flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-sm font-bold text-suaza-accent shrink-0">
          <span>★</span> 나의 기록
        </span>
        <span className="text-base font-bold text-suaza-ink shrink-0">
          {displayMemberName(me.name)}
        </span>
        <span className="text-[11px] text-suaza-ink-muted font-medium shrink-0">
          전체 {me.rank}위
        </span>
        <div className="ml-auto flex items-baseline gap-0.5 shrink-0">
          <span className="text-xl font-bold text-suaza-accent tabular-nums leading-none">
            {me.points}
          </span>
          <span className="text-[10px] font-bold text-suaza-accent">P</span>
        </div>
      </div>
      <div className="desktop:hidden text-sm text-suaza-ink-muted flex flex-wrap gap-x-2 gap-y-1">
        <StatInline label="출" value={me.appearances} />
        <StatInline label="승" value={me.wins} />
        <StatInline label="골" value={me.goals} />
        <StatInline label="어시" value={me.assists} />
        <StatInline label="CS" value={me.cleanSheets} />
        <StatInline label="MOM" value={me.mom} />
        <StatInline label="심" value={me.refereeCount} />
      </div>

      {/* 데스크톱 레이아웃: 2줄 */}
      <div className="hidden desktop:flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="inline-flex items-center gap-1 text-sm font-bold text-suaza-accent">
            <span>★</span> 나의 기록
          </span>
          <span className="text-xs text-suaza-ink-muted font-medium shrink-0 inline-block min-w-[56px] tabular-nums">
            전체 {me.rank}위
          </span>
          <span className="text-2xl font-bold text-suaza-ink ml-2">
            {displayMemberName(me.name)}
          </span>
        </div>
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="text-4xl font-bold text-suaza-accent tabular-nums leading-none">
            {me.points}
          </span>
          <span className="text-xs font-bold text-suaza-accent">POINT</span>
        </div>
      </div>
      <div className="hidden desktop:flex items-baseline gap-5 flex-wrap">
        <StatBlock label="출전" value={me.appearances} />
        <StatBlock label="승리" value={me.wins} />
        <StatBlock label="골" value={me.goals} />
        <StatBlock label="어시" value={me.assists} />
        <StatBlock label="공격P" value={me.attackPoints} />
        <StatBlock label="CS" value={me.cleanSheets} />
        <StatBlock label="MOM" value={me.mom} />
        <StatBlock label="심판" value={me.refereeCount} />
        <StatBlock
          label="출전율"
          value={`${Math.round(me.attendanceRate * 100)}%`}
        />
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-[10px] text-suaza-ink-muted">최근 5경기</span>
          <Recent5 results={me.recent5} compact />
        </div>
      </div>
    </div>
  );
}

function StatInline({ label, value }: { label: string; value: number }) {
  return (
    <span>
      {label} <b className="text-suaza-ink">{value}</b>
    </span>
  );
}

function StatBlock({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 tabular-nums">
      <span className="text-[10px] text-suaza-ink-muted whitespace-nowrap">
        {label}
      </span>
      <span className="text-base font-bold text-suaza-ink">{value}</span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 모바일 행
// ───────────────────────────────────────────────────────────

const MOBILE_COL_WIDTHS = [
  "5.385%",  // #
  "10%",     // 선수
  "5.577%",  // 출전
  "5.577%",  // 승리
  "5.577%",  // 골
  "5.577%",  // 어시
  "5.577%",  // 공P
  "5.577%",  // CS
  "5.577%",  // 🏆
  "5.577%",  // 심판
  "12.308%", // 출전율
  "19.231%", // 최근 5경기
  "8.462%",  // 포인트
];

function MobileColGroup() {
  return (
    <colgroup>
      {MOBILE_COL_WIDTHS.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  );
}

function MobileTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  myId,
}: {
  rows: RowWithRank[];
  sortDir: "desc" | "asc";
  sortKey: SortKey;
  onSort: (k: SortKey) => void;
  myId: string | null;
}) {
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const handleHeaderScroll = () => {
    if (syncingRef.current) return;
    if (!headerScrollRef.current || !bodyScrollRef.current) return;
    syncingRef.current = true;
    bodyScrollRef.current.scrollLeft = headerScrollRef.current.scrollLeft;
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  const handleBodyScroll = () => {
    if (syncingRef.current) return;
    if (!headerScrollRef.current || !bodyScrollRef.current) return;
    syncingRef.current = true;
    headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  return (
    <div className="rounded-xl border border-suaza-border overflow-clip">
      <div
        ref={headerScrollRef}
        onScroll={handleHeaderScroll}
        className="sticky top-0 z-30 bg-gray-50 overflow-x-auto no-scrollbar"
      >
        <table className="text-xs border-separate border-spacing-0 min-w-[520px] w-full table-fixed">
          <MobileColGroup />
          <thead className="text-suaza-ink-muted">
            <tr>
              <MTh className="text-center sticky left-0 bg-gray-50 z-20 pl-1 pr-0.5">
                #
              </MTh>
              <MSortTh
                label="선수"
                k="name"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                align="left"
                className="sticky left-7 bg-gray-50 z-20 !pl-0 pr-0"
              />
              <MSortTh label="출전" k="appearances" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="!pl-0" />
              <MSortTh label="승리" k="wins" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <MSortTh label="골" k="goals" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <MSortTh label="어시" k="assists" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <MSortTh label="공P" k="attackPoints" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <MSortTh label="CS" k="cleanSheets" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <MSortTh label="🏆" k="mom" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <MSortTh label="심판" k="refereeCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <MSortTh label="출전율" k="attendanceRate" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <MSortTh
                label="최근 5경기"
                k="recent5Wins"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="!pr-0"
              />
              <MSortTh
                label="포인트"
                k="points"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="text-right pr-2 !pl-0 sticky right-0 bg-gray-50 z-20"
              />
            </tr>
          </thead>
        </table>
      </div>
      <div
        ref={bodyScrollRef}
        onScroll={handleBodyScroll}
        className="overflow-x-auto no-scrollbar"
      >
        <table className="text-xs border-separate border-spacing-0 min-w-[520px] w-full table-fixed">
          <MobileColGroup />
          <tbody>
            {rows.map((row) => {
              const isMe = row.player_id === myId;
              const rowBg = isMe ? "bg-red-50" : "bg-white";
              const hl = (k: SortKey) =>
                sortKey === k ? "!font-bold !text-[#338CF2]" : "";
              return (
                <tr key={row.player_id} className={rowBg}>
                  <MTd
                    className={`text-center font-bold sticky left-0 z-10 pl-1 pr-0.5 ${rowBg} ${
                      isMe ? "text-suaza-accent" : "text-suaza-ink"
                    }`}
                  >
                    {row.rank}
                  </MTd>
                  <MTd
                    className={`font-bold sticky left-7 z-10 !pl-0 pr-0 ${rowBg} ${
                      isMe ? "text-suaza-accent" : "text-suaza-ink"
                    } ${hl("name")}`}
                  >
                    {displayMemberName(row.name)}
                  </MTd>
                  <MTd className={`text-center tabular-nums !pl-0 ${hl("appearances")}`}>{row.appearances}</MTd>
                  <MTd className={`text-center tabular-nums ${hl("wins")}`}>{row.wins}</MTd>
                  <MTd className={`text-center tabular-nums ${hl("goals")}`}>{row.goals}</MTd>
                  <MTd className={`text-center tabular-nums ${hl("assists")}`}>{row.assists}</MTd>
                  <MTd className={`text-center tabular-nums ${hl("attackPoints")}`}>{row.attackPoints}</MTd>
                  <MTd className={`text-center tabular-nums text-suaza-ink-muted ${hl("cleanSheets")}`}>{row.cleanSheets}</MTd>
                  <MTd className={`text-center tabular-nums ${hl("mom")}`}>{row.mom}</MTd>
                  <MTd className={`text-center tabular-nums text-suaza-ink-muted ${hl("refereeCount")}`}>{row.refereeCount}</MTd>
                  <MTd>
                    <RateCell
                      rate={row.attendanceRate}
                      accent={isMe}
                      highlight={sortKey === "attendanceRate"}
                    />
                  </MTd>
                  <MTd className="text-center !pr-0">
                    <Recent5 results={row.recent5} compact />
                  </MTd>
                  <MTd
                    className={`text-right pr-2 !pl-0 tabular-nums text-base sticky right-0 z-10 ${rowBg} ${
                      isMe ? "text-suaza-accent" : "text-suaza-ink"
                    } ${hl("points")}`}
                  >
                    {row.points}
                    <span className="text-[9px] text-suaza-ink-muted font-normal ml-0.5">
                      P
                    </span>
                  </MTd>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 모바일 전용 셀 컴포넌트 (콤팩트 패딩 + 작은 폰트, -2pt) ─────────
function MTh({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`py-2 px-1 text-[10px] font-medium border-b border-suaza-border ${className}`}
    >
      {children}
    </th>
  );
}

function MTd({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`py-1.5 px-1 text-suaza-ink border-b border-suaza-border/60 ${className}`}>
      {children}
    </td>
  );
}

function MSortTh({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  className = "",
  align = "center",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "desc" | "asc";
  onSort: (k: SortKey) => void;
  className?: string;
  align?: "left" | "center" | "right";
}) {
  const active = sortKey === k;
  const alignTh =
    align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  return (
    <th
      className={`py-2 px-1 text-[10px] font-medium border-b border-suaza-border align-top ${alignTh} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex flex-col items-center gap-0.5 hover:text-suaza-ink transition ${
          active ? "text-suaza-ink font-bold" : "text-suaza-ink-muted"
        }`}
      >
        <span className="whitespace-nowrap">{label}</span>
        <svg
          viewBox="0 0 12 8"
          className={`w-2 h-1.5 shrink-0 transition-transform ${
            active && sortDir === "asc" ? "rotate-180" : ""
          } ${active ? "" : "text-suaza-ink-faint"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 2L6 6L10 2" />
        </svg>
      </button>
    </th>
  );
}

// ───────────────────────────────────────────────────────────
// 데스크톱 테이블
// ───────────────────────────────────────────────────────────

function DesktopTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  myId,
}: {
  rows: RowWithRank[];
  sortDir: "desc" | "asc";
  sortKey: SortKey;
  onSort: (k: SortKey) => void;
  myId: string | null;
}) {
  return (
    <div className="rounded-xl border border-suaza-border overflow-clip">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead className="bg-gray-50 text-suaza-ink-muted">
          <tr>
            <Th className="w-12 text-center">#</Th>
            <SortTh
              label="선수"
              k="name"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              align="left"
            />
            <SortTh label="출전" k="appearances" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh label="승리" k="wins" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh label="골" k="goals" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh label="어시" k="assists" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh
              label="공격P"
              k="attackPoints"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortTh label="CS" k="cleanSheets" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh label="🏆" k="mom" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh
              label="심판"
              k="refereeCount"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortTh
              label="출전율"
              k="attendanceRate"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              className="min-w-[96px]"
            />
            <SortTh
              label="최근 5경기"
              k="recent5Wins"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              className="w-[110px]"
            />
            <SortTh
              label="포인트"
              k="points"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              className="text-right pr-4"
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isMe = row.player_id === myId;
            const hl = (k: SortKey) =>
              sortKey === k ? "!font-bold !text-[#338CF2]" : "";
            return (
              <tr
                key={row.player_id}
                className={isMe ? "bg-red-50/60" : "bg-white"}
              >
                <Td
                  className={`text-center font-bold ${
                    isMe ? "text-suaza-accent" : "text-suaza-ink"
                  }`}
                >
                  {row.rank}
                </Td>
                <Td
                  className={`font-bold ${
                    isMe ? "text-suaza-accent" : "text-suaza-ink"
                  } ${hl("name")}`}
                >
                  {displayMemberName(row.name)}
                </Td>
                <Td className={`text-center tabular-nums ${hl("appearances")}`}>{row.appearances}</Td>
                <Td className={`text-center tabular-nums ${hl("wins")}`}>{row.wins}</Td>
                <Td className={`text-center tabular-nums ${hl("goals")}`}>{row.goals}</Td>
                <Td className={`text-center tabular-nums ${hl("assists")}`}>{row.assists}</Td>
                <Td className={`text-center tabular-nums ${hl("attackPoints")}`}>
                  {row.attackPoints}
                </Td>
                <Td className={`text-center tabular-nums text-suaza-ink-muted ${hl("cleanSheets")}`}>
                  {row.cleanSheets}
                </Td>
                <Td className={`text-center tabular-nums ${hl("mom")}`}>{row.mom}</Td>
                <Td className={`text-center tabular-nums text-suaza-ink-muted ${hl("refereeCount")}`}>
                  {row.refereeCount}
                </Td>
                <Td>
                  <RateCell
                    rate={row.attendanceRate}
                    accent={isMe}
                    highlight={sortKey === "attendanceRate"}
                  />
                </Td>
                <Td className="text-center">
                  <Recent5 results={row.recent5} />
                </Td>
                <Td
                  className={`text-right pr-4 tabular-nums text-lg ${
                    isMe ? "text-suaza-accent" : "text-suaza-ink"
                  } ${hl("points")}`}
                >
                  {row.points}
                  <span className="text-[10px] text-suaza-ink-muted font-normal ml-0.5">
                    P
                  </span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`py-2.5 px-2 text-xs font-medium border-b border-suaza-border sticky top-0 z-20 bg-gray-50 ${className}`}
    >
      {children}
    </th>
  );
}

function SortTh({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  className = "",
  align = "center",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "desc" | "asc";
  onSort: (k: SortKey) => void;
  className?: string;
  align?: "left" | "center" | "right";
}) {
  const active = sortKey === k;
  const alignTh =
    align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  return (
    <th
      className={`py-3 px-2 text-xs font-medium border-b border-suaza-border align-top sticky top-0 z-20 bg-gray-50 ${alignTh} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex flex-col items-center gap-1 hover:text-suaza-ink transition ${
          active ? "text-suaza-ink font-bold" : "text-suaza-ink-muted"
        }`}
      >
        <span>{label}</span>
        <span className="h-3 flex items-center justify-center">
          <svg
            viewBox="0 0 12 8"
            className={`w-2.5 h-2 transition-transform ${
              active && sortDir === "asc" ? "rotate-180" : ""
            } ${active ? "" : "text-suaza-ink-faint"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 2L6 6L10 2" />
          </svg>
        </span>
      </button>
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`py-2.5 px-2 text-suaza-ink border-b border-suaza-border/60 ${className}`}
    >
      {children}
    </td>
  );
}

function RateCell({
  rate,
  accent,
  highlight,
}: {
  rate: number;
  accent?: boolean;
  highlight?: boolean;
}) {
  const pct = Math.round(rate * 100);
  // 20% 단위 신호등 색 (낮음→높음)
  const barColor =
    pct < 20 ? "#EF4444"
    : pct < 40 ? "#F97316"
    : pct < 60 ? "#EAB308"
    : pct < 80 ? "#84CC16"
    : "#16A34A";
  const pctTextCls = highlight
    ? "font-bold text-[#338CF2]"
    : accent
      ? "text-suaza-accent"
      : "text-suaza-ink";
  return (
    <div className="flex flex-col gap-1 px-1 tabular-nums">
      <span className={`text-xs text-right ${pctTextCls}`}>
        {pct}%
      </span>
      <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: barColor,
          }}
        />
      </div>
    </div>
  );
}

function Recent5({
  results,
  compact = false,
}: {
  results: MatchResult[];
  compact?: boolean;
}) {
  const padded: (MatchResult | null)[] = [
    ...results.slice(0, 5),
    ...Array(Math.max(0, 5 - results.length)).fill(null),
  ];
  const size = compact ? "w-4 h-4 text-[8px]" : "w-4 h-4 text-[9px]";
  return (
    <div className="inline-flex items-center gap-0.5">
      {padded.map((r, i) => (
        <span
          key={i}
          className={`${size} rounded-full flex items-center justify-center font-bold ${
            r === "W"
              ? "bg-emerald-500 text-white"
              : r === "D"
                ? "bg-amber-400 text-white"
                : r === "L"
                  ? "bg-red-500 text-white"
                  : "bg-gray-200 text-gray-400"
          }`}
        >
          {r ?? ""}
        </span>
      ))}
    </div>
  );
}
