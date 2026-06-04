"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import {
  setMyAttendingQuarters,
  setMyCondition,
  voteAttendance,
} from "@/lib/matches/actions";
import { quarterShortLabel } from "@/lib/matches/helpers";
import AttendanceManagerBoard from "@/components/attendance-manager-board";

// 컨디션 1~5단계. 1=최상(빨강·12시) → 5=최하(파랑·6시).
const CONDITION_COLOR = [
  "#EF4444", // 1 빨강
  "#EAB308", // 2 노랑
  "#22C55E", // 3 초록 (기본)
  "#06B6D4", // 4 청록
  "#3B82F6", // 5 파랑
];
const CONDITION_DEG = [-90, -45, 0, 45, 90];
const CONDITION_LABEL = ["최상", "좋음", "보통", "나쁨", "최하"];

function ConditionChip({
  level,
  onCycle,
}: {
  /** 1~5 단계, 또는 null = 미설정 ("?" 표시) */
  level: number | null;
  onCycle: () => void;
}) {
  // 미설정 상태 — 회색 톤 "?" 아이콘
  if (level == null) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCycle();
        }}
        title="컨디션 미설정 (눌러서 설정)"
        aria-label="컨디션 미설정 (눌러서 설정)"
        className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-white border-gray-300 text-gray-500 hover:scale-[1.02] active:scale-95 transition"
      >
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-[10px] font-bold leading-none text-gray-600">
          ?
        </span>
        <span>컨디션</span>
      </button>
    );
  }
  const idx = Math.min(5, Math.max(1, level)) - 1;
  const color = CONDITION_COLOR[idx];
  const deg = CONDITION_DEG[idx];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onCycle();
      }}
      title={`컨디션 ${CONDITION_LABEL[idx]} (눌러서 변경)`}
      aria-label={`내 컨디션 ${level}단계 (눌러서 변경)`}
      className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-white hover:scale-[1.02] active:scale-95 transition"
      style={{ borderColor: color, color }}
    >
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full"
        style={{ backgroundColor: `${color}26` }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          style={{ transform: `rotate(${deg}deg)` }}
        >
          <path
            d="M4 12 H17 M12 7 L18 12 L12 17"
            fill="none"
            stroke={color}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>컨디션</span>
    </button>
  );
}

export type VotePlayer = {
  id: string;
  name: string;
  jersey_number?: number | null;
  // 참석자만 의미. NULL = 전체 쿼터 참여, 배열 = 참여하는 쿼터 번호 집합(1-indexed)
  attending_quarters?: number[] | null;
  // 응답 시각 — 정렬 기준
  voted_at?: string | null;
  // 부상 여부 — 이름 옆 + 배지 표기 (불참 그룹으로 자동 이동됨)
  is_injured?: boolean | null;
  // 장기불참 여부 — 이름 옆 ― 배지 표기 (불참 그룹으로 자동 이동됨)
  on_leave?: boolean | null;
  // 시즌 카테고리 1위 — 이름 옆에 골드 딱지 표기
  isGoalKing?: boolean;
  isAssistKing?: boolean;
  isCleanSheetKing?: boolean;
  isRefereeKing?: boolean;
};

// 부심 깃발 SVG — 노/빨 격자
function LinesmanFlag() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="2" width="1.6" height="20" rx="0.5" fill="#1F2937" />
      <rect x="4.6" y="3" width="7" height="6" fill="#FACC15" />
      <rect x="11.6" y="3" width="7" height="6" fill="#EF4444" />
      <rect x="4.6" y="9" width="7" height="6" fill="#EF4444" />
      <rect x="11.6" y="9" width="7" height="6" fill="#FACC15" />
      <rect
        x="4.6"
        y="3"
        width="14"
        height="12"
        fill="none"
        stroke="rgba(0,0,0,0.25)"
        strokeWidth="0.4"
      />
    </svg>
  );
}

// 시즌 카테고리 1위 딱지 — 기록 버튼과 동일한 이모지/아이콘.
// 공동 1위면 여러 개. 라벨 없이 아이콘만 (부상 + 배지와 동일한 톤).
function KingBadges({ p }: { p: VotePlayer }) {
  const items: { key: string; icon: React.ReactNode; title: string }[] = [];
  if (p.isGoalKing)
    items.push({ key: "goal", icon: "⚽", title: "시즌 득점왕" });
  if (p.isAssistKing)
    items.push({ key: "assist", icon: "🅰", title: "시즌 어시왕" });
  if (p.isCleanSheetKing)
    items.push({ key: "cs", icon: "🛡️", title: "시즌 CS왕" });
  if (p.isRefereeKing)
    items.push({ key: "ref", icon: <LinesmanFlag />, title: "시즌 심판왕" });
  if (items.length === 0) return null;
  return (
    <>
      {items.map((it) => (
        <span
          key={it.key}
          className="shrink-0 inline-flex items-center justify-center w-4 h-4 text-[14px] leading-none align-middle"
          role="img"
          aria-label={it.title}
          title={it.title}
        >
          {it.icon}
        </span>
      ))}
    </>
  );
}

// 부상 표기용 빨강 + 배지 (명단 카드와 동일 디자인)
export function InjuryBadge() {
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center w-3.5 h-3.5 rounded-[3px] bg-suaza-accent text-white align-middle"
      role="img"
      aria-label="부상"
      title="부상"
    >
      <svg viewBox="0 0 24 24" className="w-2 h-2" fill="currentColor" aria-hidden>
        <path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" />
      </svg>
    </span>
  );
}

// 장기불참 표기용 회색 ― 배지
export function OnLeaveBadge() {
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center w-3.5 h-3.5 rounded-[3px] bg-suaza-ink-muted text-white align-middle"
      role="img"
      aria-label="장기불참"
      title="장기불참"
    >
      <svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="currentColor" aria-hidden>
        <rect x="3" y="10" width="18" height="4" rx="1" />
      </svg>
    </span>
  );
}

type Groups = {
  attending: VotePlayer[];
  absent: VotePlayer[];
  undecided: VotePlayer[];
};

type Status = "attending" | "absent" | "undecided";

const OPTS: {
  value: Status;
  label: string;
  icon?: string;
  activeClass: string;
}[] = [
  {
    value: "attending",
    label: "참석",
    icon: "✓",
    activeClass: "bg-green-600 text-white border-green-600",
  },
  {
    value: "absent",
    label: "불참",
    activeClass: "bg-red-600 text-white border-red-600",
  },
  {
    value: "undecided",
    label: "미정",
    activeClass: "bg-gray-700 text-white border-gray-700",
  },
];

type OptimisticState = {
  status: string | null;
  attendingQuarters: number[] | null;
};

/**
 * 본인 출석 상태 + 참여 쿼터 집합을 낙관적으로 관리한다.
 * status 가 attending 이 아니면 attendingQuarters 는 항상 null(전체).
 */
function useOptimisticVote(
  matchId: string,
  myStatus: string | null,
  myAttendingQuarters: number[] | null,
  me: VotePlayer | null,
  byStatus: Groups,
  nonVoters: VotePlayer[],
) {
  const [optimistic, setOptimistic] = useOptimistic<OptimisticState>({
    status: myStatus,
    attendingQuarters: myStatus === "attending" ? myAttendingQuarters : null,
  });
  const [, startTransition] = useTransition();

  const vote = (value: Status) => {
    // 토글: 이미 선택된 항목을 다시 누르면 미투표(null)
    const next: Status | null = optimistic.status === value ? null : value;
    startTransition(async () => {
      setOptimistic({ status: next, attendingQuarters: null });
      await voteAttendance(matchId, value);
    });
  };

  const setAttendingQuarters = (quarters: number[] | null) => {
    if (optimistic.status !== "attending") return;
    // 모든 쿼터 해제(빈 배열) → 출석 취소(미투표)
    const emptied = Array.isArray(quarters) && quarters.length === 0;
    startTransition(async () => {
      setOptimistic(
        emptied
          ? { status: null, attendingQuarters: null }
          : { status: "attending", attendingQuarters: quarters },
      );
      await setMyAttendingQuarters(matchId, quarters);
    });
  };

  const computed = useMemo(() => {
    const byName = (a: VotePlayer, b: VotePlayer) =>
      a.name.localeCompare(b.name, "ko");
    const strip = (arr: VotePlayer[]) =>
      me ? arr.filter((p) => p.id !== me.id) : arr;

    const groups: Groups = {
      attending: strip(byStatus.attending),
      absent: strip(byStatus.absent),
      undecided: strip(byStatus.undecided),
    };
    let nv = strip(nonVoters);

    if (me) {
      const meWith: VotePlayer = {
        ...me,
        attending_quarters: optimistic.attendingQuarters,
        voted_at: new Date().toISOString(),
      };
      if (optimistic.status === "attending") {
        groups.attending = [...groups.attending, meWith].sort(byName);
      } else if (optimistic.status === "absent") {
        groups.absent = [...groups.absent, meWith].sort(byName);
      } else if (optimistic.status === "undecided") {
        groups.undecided = [...groups.undecided, meWith].sort(byName);
      } else {
        nv = [meWith, ...nv];
      }
    }

    return {
      groups,
      nonVoters: nv,
      counts: {
        attending: groups.attending.length,
        absent: groups.absent.length,
        undecided: groups.undecided.length,
        nonVoters: nv.length,
      },
    };
  }, [me, byStatus, nonVoters, optimistic]);

  return {
    optimisticStatus: optimistic.status,
    optimisticQuarters: optimistic.attendingQuarters,
    vote,
    setAttendingQuarters,
    ...computed,
  };
}

function VoteButtons({
  status,
  onVote,
}: {
  status: string | null;
  onVote: (value: Status) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTS.map((o) => {
        const active = status === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onVote(o.value)}
            className={`h-7 desktop:h-9 w-full rounded-lg border text-xs desktop:text-sm font-medium transition flex items-center justify-center gap-1 ${
              active
                ? o.activeClass
                : "bg-white border-suaza-border text-suaza-ink hover:bg-gray-100"
            }`}
          >
            {o.icon && active && <span>{o.icon}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 쿼터 선택기 (참석 응답 시에만 노출)
// ───────────────────────────────────────────────────────────

function QuarterPicker({
  totalQuarters,
  selected, // null = 전체, 또는 참여 쿼터 번호 배열
  quarterActions,
  onChange,
}: {
  totalQuarters: number;
  selected: number[] | null;
  quarterActions?: (string | null)[] | null;
  onChange: (quarters: number[] | null) => void;
}) {
  // null = 전체 참여. 특정 쿼터를 누르면 그 쿼터만 토글(비활성화).
  const isAttending = (q: number) => selected === null || selected.includes(q);

  // 라벨: 준비운동 → "준비", 훈련 → "훈련", 그 외엔 게임 쿼터 번호(NQ).
  const label = (q: number) => {
    const a = quarterActions?.[q - 1] ?? null;
    if (a === "warmup") return "준비";
    if (a === "training") return "훈련";
    let nonGameBefore = 0;
    for (let i = 0; i < q - 1; i++) {
      const ai = quarterActions?.[i] ?? null;
      if (ai === "warmup" || ai === "training") nonGameBefore += 1;
    }
    return `${q - nonGameBefore}Q`;
  };

  const toggle = (q: number) => {
    const cur =
      selected === null
        ? Array.from({ length: totalQuarters }, (_, i) => i + 1)
        : [...selected];
    const next = cur.includes(q)
      ? cur.filter((x) => x !== q)
      : [...cur, q].sort((a, b) => a - b);
    onChange(next.length === totalQuarters ? null : next);
  };

  return (
    <div className="bg-white rounded-lg border border-suaza-border p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-suaza-ink">
          <span>⚽</span>
          <span>참석쿼터</span>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`shrink-0 inline-flex items-center justify-center h-5 px-2 rounded-full text-xs leading-none font-medium border transition ${
            selected === null
              ? "bg-green-600 text-white border-green-600"
              : "bg-white text-suaza-ink-muted border-suaza-border hover:bg-gray-50"
          }`}
        >
          전체
        </button>
      </div>
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${totalQuarters}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: totalQuarters }, (_, i) => {
          const q = i + 1;
          const active = isAttending(q);
          return (
            <button
              key={q}
              type="button"
              onClick={() => toggle(q)}
              className={`h-7 desktop:h-9 w-full rounded-lg border flex items-center justify-center transition ${
                active
                  ? "border-transparent bg-green-500 text-white"
                  : "border-suaza-border bg-gray-50 text-suaza-ink-muted hover:bg-gray-100"
              }`}
            >
              <span className="text-[11px] desktop:text-sm font-bold">
                {label(q)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 경기 상세 카드용 패널 (버튼 + 카운트 + 명단)
// ───────────────────────────────────────────────────────────

export function AttendanceCardVote({
  matchId,
  me,
  myName,
  myStatus,
  myAttendingQuarters,
  myCondition,
  byStatus,
  nonVoters,
  isManager,
  totalQuarters,
  quarterActions,
  locked,
  lockedMessage = "🔒 경기 시작 후에는 출석 투표를 변경할 수 없습니다",
}: {
  matchId: string;
  me: VotePlayer | null;
  myName: string | null;
  myStatus: string | null;
  myAttendingQuarters: number[] | null;
  /** 1~5 단계 또는 null = 미설정("?"). null 일 때 첫 클릭이 3 으로 초기화. */
  myCondition?: number | null;
  byStatus: Groups;
  nonVoters: VotePlayer[];
  isManager: boolean;
  totalQuarters: number;
  quarterActions?: (string | null)[] | null;
  locked: boolean;
  lockedMessage?: string;
}) {
  const {
    optimisticStatus,
    optimisticQuarters,
    vote,
    setAttendingQuarters,
    groups,
    nonVoters: nv,
    counts,
  } = useOptimisticVote(
    matchId,
    myStatus,
    myAttendingQuarters,
    me,
    byStatus,
    nonVoters,
  );

  // 본인 컨디션 — null(미설정/"?") 상태에서 첫 클릭 시 3(보통)으로 초기화,
  // 이후 1→2→…→5→1 순환. 낙관적 반영 + 서버 저장.
  const [condition, setCondition] = useState<number | null>(
    myCondition ?? null,
  );
  const [, startConditionTransition] = useTransition();
  const cycleCondition = () => {
    const next: number = condition == null ? 3 : condition >= 5 ? 1 : condition + 1;
    setCondition(next);
    startConditionTransition(() => {
      setMyCondition(matchId, next);
    });
  };

  return (
    <>
      {/* My response */}
      {locked ? (
        isManager ? null : (
          <div className="bg-gray-50 rounded-xl p-3 text-center text-xs text-suaza-ink-muted">
            {lockedMessage}
          </div>
        )
      ) : (
        <div className="bg-red-50/50 rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-suaza-accent text-white text-xs font-bold flex items-center justify-center shrink-0">
              {myName?.charAt(0) ?? "?"}
            </span>
            <span className="text-sm font-medium text-suaza-ink min-w-0 truncate">
              <span className="desktop:hidden">내 응답</span>
              <span className="hidden desktop:inline">
                {myName
                  ? `${myName} 님의 응답을 알려주세요`
                  : "응답을 알려주세요"}
              </span>
            </span>
            <div className="ml-auto">
              <ConditionChip level={condition} onCycle={cycleCondition} />
            </div>
          </div>
          <VoteButtons status={optimisticStatus} onVote={vote} />
          {optimisticStatus === "attending" && (
            <QuarterPicker
              totalQuarters={totalQuarters}
              selected={optimisticQuarters}
              quarterActions={quarterActions}
              onChange={setAttendingQuarters}
            />
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 py-2">
        <StatCount label="참석" value={counts.attending} color="#22C55E" />
        <StatCount label="불참" value={counts.absent} color="#EF3E3E" />
        <StatCount label="미정" value={counts.undecided} color="#9CA3AF" />
        <StatCount label="미투표" value={counts.nonVoters} color="#D1D5DB" />
      </div>

      {/* 모든 회원이 동일한 보드 뷰를 본다. 매니저·감독만 드래그앤드롭으로 변경 가능하고,
          일반 회원은 같은 레이아웃을 보기 전용(readonly)으로 본다. */}
      <AttendanceManagerBoard
        matchId={matchId}
        byStatus={groups}
        nonVoters={nv}
        totalQuarters={totalQuarters}
        quarterActions={quarterActions}
        readonly={!isManager}
      />
    </>
  );
}

// ───────────────────────────────────────────────────────────
// 홈 화면 컴팩트 패널 (버튼 + 간단 명단)
// ───────────────────────────────────────────────────────────

export function AttendanceCompactVote({
  matchId,
  me,
  myStatus,
  myAttendingQuarters = null,
  byStatus,
  nonVoters,
  isManager,
  totalQuarters = 4,
  quarterActions,
  locked = false,
  lockedMessage = "🔒 투표가 마감되었습니다",
}: {
  matchId: string;
  me: VotePlayer | null;
  myStatus: string | null;
  myAttendingQuarters?: number[] | null;
  byStatus: Groups;
  nonVoters: VotePlayer[];
  isManager: boolean;
  totalQuarters?: number;
  quarterActions?: (string | null)[] | null;
  locked?: boolean;
  lockedMessage?: string;
}) {
  const {
    optimisticStatus,
    optimisticQuarters,
    vote,
    setAttendingQuarters,
    groups,
    nonVoters: nv,
    counts,
  } = useOptimisticVote(
    matchId,
    myStatus,
    myAttendingQuarters,
    me,
    byStatus,
    nonVoters,
  );

  return (
    <>
      {locked ? (
        <div className="bg-gray-50 rounded-lg p-3 text-center text-xs text-suaza-ink-muted">
          {lockedMessage}
        </div>
      ) : (
        <>
          <VoteButtons status={optimisticStatus} onVote={vote} />
          {optimisticStatus === "attending" && (
            <QuarterPicker
              totalQuarters={totalQuarters}
              selected={optimisticQuarters}
              quarterActions={quarterActions}
              onChange={setAttendingQuarters}
            />
          )}
        </>
      )}

      {/* 통계 줄 */}
      <div className="grid grid-cols-4 gap-2 py-1">
        <StatCount label="참석" value={counts.attending} color="#22C55E" />
        <StatCount label="불참" value={counts.absent} color="#EF3E3E" />
        <StatCount label="미정" value={counts.undecided} color="#9CA3AF" />
        <StatCount label="미투표" value={counts.nonVoters} color="#D1D5DB" />
      </div>

      {/* 경기 상세와 동일하게 모든 회원이 같은 보드 뷰를 본다.
          매니저·감독만 드래그앤드롭 변경 가능, 일반 회원은 보기 전용(readonly). */}
      <AttendanceManagerBoard
        matchId={matchId}
        byStatus={groups}
        nonVoters={nv}
        totalQuarters={totalQuarters}
        quarterActions={quarterActions}
        readonly={!isManager}
      />
    </>
  );
}

// ───────────────────────────────────────────────────────────
// 멤버별 참여 쿼터 (참석자만 그룹화)
// ───────────────────────────────────────────────────────────

function AttendingByQuarterSection({
  attending,
  totalQuarters,
  quarterActions,
}: {
  attending: VotePlayer[];
  totalQuarters: number;
  quarterActions?: (string | null)[] | null;
}) {
  // 전체 참여(A) / 일부 참여 분리
  const { full, partial } = useMemo(() => {
    const isFull = (p: VotePlayer) =>
      p.attending_quarters == null ||
      p.attending_quarters.length >= totalQuarters;
    const byName = (a: VotePlayer, b: VotePlayer) =>
      a.name.localeCompare(b.name, "ko");
    const full = attending.filter(isFull).sort(byName);
    // 일부: 참여 쿼터 많은 순 → 이름순
    const partial = attending
      .filter((p) => !isFull(p))
      .sort((a, b) => {
        const d =
          (b.attending_quarters?.length ?? 0) -
          (a.attending_quarters?.length ?? 0);
        return d !== 0 ? d : byName(a, b);
      });
    return { full, partial };
  }, [attending, totalQuarters]);

  return (
    <div className="bg-suaza-bg/30 rounded-xl p-3 desktop:p-4 flex flex-col gap-3">
      <h3 className="text-sm font-bold text-suaza-ink flex items-center gap-1.5">
        <span>👥</span>
        멤버별 참여 쿼터
      </h3>
      {attending.length === 0 ? (
        <p className="text-xs text-suaza-ink-faint py-2 text-center">
          아직 참석 응답한 멤버가 없어요
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* 전체 참여 — 이름 묶음 */}
          {full.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "#22C55E" }}
                />
                <span className="text-xs font-bold text-suaza-ink">
                  전체 참여
                </span>
                <span className="text-[11px] text-suaza-ink-muted">
                  {full.length}명
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {full.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full border bg-white text-suaza-ink"
                    style={{ borderColor: "#22C55E" }}
                  >
                    {m.is_injured && <InjuryBadge />}
                    {m.on_leave && <OnLeaveBadge />}
                    <KingBadges p={m} />
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 일부 참여 — 이름 + 쿼터 번호 */}
          {partial.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "#22C55E" }}
                />
                <span className="text-xs font-bold text-suaza-ink">
                  일부 참여
                </span>
                <span className="text-[11px] text-suaza-ink-muted">
                  {partial.length}명
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {partial.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-suaza-ink min-w-0">
                      {m.is_injured && <InjuryBadge />}
                      {m.on_leave && <OnLeaveBadge />}
                      <KingBadges p={m} />
                      <span className="truncate">{m.name}</span>
                    </span>
                    <div className="shrink-0">
                      <QuarterDots
                        quarters={m.attending_quarters ?? null}
                        quarterActions={quarterActions}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 전체 참여는 "A" 한 개, 일부 참여는 참여하는 쿼터 번호만 초록 동그라미로.
const DOT_CLS =
  "w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center text-[9px] font-bold leading-none";

function QuarterDots({
  quarters,
  quarterActions,
}: {
  quarters: number[] | null;
  quarterActions?: (string | null)[] | null;
}) {
  if (quarters == null) {
    return (
      <span className={DOT_CLS} title="전체 참여">
        A
      </span>
    );
  }
  return (
    <div className="flex items-center gap-0.5">
      {quarters.map((q) => (
        <span key={q} className={DOT_CLS} title={`${q}Q`}>
          {quarterShortLabel(q - 1, quarterActions)}
        </span>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 표시용 서브 컴포넌트
// ───────────────────────────────────────────────────────────

function StatCount({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 border-r border-suaza-border last:border-r-0">
      <div className="flex items-center gap-1">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-xl font-bold text-suaza-ink">{value}</span>
      </div>
      <span className="text-[11px] text-suaza-ink-muted">{label}</span>
    </div>
  );
}

function MemberGroup({
  label,
  count,
  color,
  members,
  muted = false,
}: {
  label: string;
  count: number;
  color: string;
  members: VotePlayer[];
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span
          className={`text-xs font-bold ${muted ? "text-suaza-ink-muted" : "text-suaza-ink"}`}
        >
          {label} {count}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {members.length === 0 ? (
          <span className="text-xs text-suaza-ink-faint">—</span>
        ) : (
          members.map((m) => (
            <span
              key={m.id}
              className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full border transition ${
                muted ? "text-suaza-ink-muted bg-gray-50" : "text-suaza-ink bg-white"
              }`}
              style={{ borderColor: muted ? "#E5E7EB" : color }}
            >
              {m.is_injured && <InjuryBadge />}
              {m.on_leave && <OnLeaveBadge />}
              <KingBadges p={m} />
              {m.name}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function AttendanceRow({
  label,
  count,
  badgeClass,
  members,
}: {
  label: string;
  count: number;
  badgeClass: string;
  members: VotePlayer[];
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${badgeClass}`}
      >
        {label} {count}
      </span>
      <span className="text-sm text-suaza-ink-muted leading-relaxed break-keep">
        {members.length > 0
          ? members.map((m, i) => (
              <span key={m.id} className="inline-flex items-center gap-0.5">
                {m.is_injured && <InjuryBadge />}
                {m.on_leave && <OnLeaveBadge />}
                <KingBadges p={m} />
                {m.name}
                {i < members.length - 1 ? <span>,&nbsp;</span> : null}
              </span>
            ))
          : "—"}
      </span>
    </div>
  );
}

function NonVoterRow({ members }: { members: VotePlayer[] }) {
  if (members.length === 0) {
    return (
      <p className="text-[11px] text-suaza-ink-faint">
        모두 투표를 완료했어요 ✓
      </p>
    );
  }
  const names = members.map((m) => m.name).join(", ");
  return (
    <div className="flex flex-col gap-0.5 text-[11px] text-suaza-ink-faint">
      <span className="font-medium">미투표 ({members.length})</span>
      <span className="break-keep">{names}</span>
    </div>
  );
}
