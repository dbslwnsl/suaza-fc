"use client";

import { useMemo, useOptimistic, useTransition } from "react";
import {
  setMyQuartersAttending,
  voteAttendance,
} from "@/lib/matches/actions";
import AttendanceManagerBoard from "@/components/attendance-manager-board";

export type VotePlayer = {
  id: string;
  name: string;
  jersey_number?: number | null;
  // 참석자만 의미. NULL = 전체 쿼터 응답, 정수 N = N쿼터까지
  quarters_attending?: number | null;
  // 응답 시각 — 멤버별 참여 쿼터 목록의 "오래 참여한 순서" 정렬 기준
  voted_at?: string | null;
};

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
  quartersAttending: number | null;
};

/**
 * 본인 출석 상태 + 참석 쿼터를 낙관적으로 관리한다.
 * status 가 attending 이 아니면 quartersAttending 은 항상 null.
 */
function useOptimisticVote(
  matchId: string,
  myStatus: string | null,
  myQuartersAttending: number | null,
  me: VotePlayer | null,
  byStatus: Groups,
  nonVoters: VotePlayer[],
) {
  const [optimistic, setOptimistic] = useOptimistic<OptimisticState>({
    status: myStatus,
    quartersAttending: myStatus === "attending" ? myQuartersAttending : null,
  });
  const [, startTransition] = useTransition();

  const vote = (value: Status) => {
    // 토글: 이미 선택된 항목을 다시 누르면 미투표(null)
    const next: Status | null = optimistic.status === value ? null : value;
    startTransition(async () => {
      setOptimistic({
        status: next,
        quartersAttending: next === "attending" ? null : null,
      });
      await voteAttendance(matchId, value);
    });
  };

  const setQuarters = (quarters: number | null) => {
    if (optimistic.status !== "attending") return;
    startTransition(async () => {
      setOptimistic({ status: "attending", quartersAttending: quarters });
      await setMyQuartersAttending(matchId, quarters);
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
        quarters_attending: optimistic.quartersAttending,
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
    optimisticQuarters: optimistic.quartersAttending,
    vote,
    setQuarters,
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
            className={`h-11 rounded-lg border text-sm font-medium transition flex items-center justify-center gap-1 ${
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
  selected, // null = 전체, 또는 1..N
  myName,
  onChange,
}: {
  totalQuarters: number;
  selected: number | null;
  myName: string | null;
  onChange: (quarters: number | null) => void;
}) {
  // 누적 선택: selected 가 null 이면 전체, n 이면 1..n 까지 체크 표시
  const effective = selected ?? totalQuarters;
  const isFull = selected === null;
  return (
    <div className="bg-white rounded-lg border border-suaza-border p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-suaza-ink">
          <span>⚽</span>
          <span>어느 쿼터까지 참석하세요?</span>
          <span className="text-xs text-suaza-ink-faint">· 누적 선택</span>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium border transition ${
            isFull
              ? "bg-green-600 text-white border-green-600"
              : "bg-white text-suaza-ink-muted border-suaza-border hover:bg-gray-50"
          }`}
        >
          {isFull ? "✓ " : ""}전체
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
          const active = q <= effective;
          // 누적 선택: 단계별로 진한 녹색. 가장 진한 = 마지막 선택값
          const intensity = active ? Math.min(1, q / effective) : 0;
          const bg = active
            ? `rgba(34, 197, 94, ${0.25 + intensity * 0.65})`
            : "#F9FAFB";
          const textCls = active ? "text-white" : "text-suaza-ink-muted";
          return (
            <button
              key={q}
              type="button"
              onClick={() => onChange(q === totalQuarters ? null : q)}
              className={`aspect-[5/3] rounded-lg border flex flex-col items-center justify-center gap-0.5 transition ${textCls} ${
                active
                  ? "border-transparent"
                  : "border-suaza-border hover:bg-gray-100"
              }`}
              style={{ backgroundColor: bg }}
            >
              <span className="text-sm font-bold">{q}Q</span>
              {active && <span className="text-[10px] leading-none">✓</span>}
            </button>
          );
        })}
      </div>
      <p className="bg-green-50 text-green-700 rounded text-xs px-2 py-1.5 flex items-center gap-1">
        <span>✓</span>
        <span>
          {myName ? `${myName} 님은 ` : ""}
          {isFull
            ? `전체 쿼터(1~${totalQuarters}Q) 참여로 응답했어요`
            : `${selected}쿼터까지 참여로 응답했어요`}
        </span>
      </p>
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
  myQuartersAttending,
  byStatus,
  nonVoters,
  isManager,
  totalQuarters,
  locked,
  lockedMessage = "🔒 경기 시작 후에는 출석 투표를 변경할 수 없습니다",
}: {
  matchId: string;
  me: VotePlayer | null;
  myName: string | null;
  myStatus: string | null;
  myQuartersAttending: number | null;
  byStatus: Groups;
  nonVoters: VotePlayer[];
  isManager: boolean;
  totalQuarters: number;
  locked: boolean;
  lockedMessage?: string;
}) {
  const {
    optimisticStatus,
    optimisticQuarters,
    vote,
    setQuarters,
    groups,
    nonVoters: nv,
    counts,
  } = useOptimisticVote(
    matchId,
    myStatus,
    myQuartersAttending,
    me,
    byStatus,
    nonVoters,
  );

  const showBoard = isManager;

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
            <span className="text-sm font-medium text-suaza-ink">
              <span className="desktop:hidden">내 응답을 알려주세요</span>
              <span className="hidden desktop:inline">
                {myName
                  ? `${myName} 님의 응답을 알려주세요`
                  : "응답을 알려주세요"}
              </span>
            </span>
          </div>
          <VoteButtons status={optimisticStatus} onVote={vote} />
          {optimisticStatus === "attending" && (
            <QuarterPicker
              totalQuarters={totalQuarters}
              selected={optimisticQuarters}
              myName={myName}
              onChange={setQuarters}
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

      {/* 멤버별 참여 쿼터 — 참석자만 quarter desc 그룹화 */}
      <AttendingByQuarterSection
        attending={groups.attending}
        totalQuarters={totalQuarters}
      />

      {/* 매니저는 드래그앤드롭 보드 / 그 외는 단순 명단 */}
      {showBoard ? (
        <>
          <h3 className="text-sm font-bold text-suaza-ink pt-1">멤버별 응답</h3>
          <AttendanceManagerBoard
            matchId={matchId}
            byStatus={groups}
            nonVoters={nv}
          />
        </>
      ) : (
        <div className="flex flex-col gap-3 pt-1">
          <MemberGroup
            label="불참"
            count={counts.absent}
            color="#EF3E3E"
            members={groups.absent}
          />
          <MemberGroup
            label="미정"
            count={counts.undecided}
            color="#9CA3AF"
            members={groups.undecided}
          />
          <MemberGroup
            label="미투표"
            count={counts.nonVoters}
            color="#D1D5DB"
            members={nv}
            muted
          />
        </div>
      )}
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
  myQuartersAttending = null,
  byStatus,
  nonVoters,
  isManager,
  totalQuarters = 4,
  locked = false,
  lockedMessage = "🔒 투표가 마감되었습니다",
}: {
  matchId: string;
  me: VotePlayer | null;
  myStatus: string | null;
  myQuartersAttending?: number | null;
  byStatus: Groups;
  nonVoters: VotePlayer[];
  isManager: boolean;
  totalQuarters?: number;
  locked?: boolean;
  lockedMessage?: string;
}) {
  const {
    optimisticStatus,
    optimisticQuarters,
    vote,
    setQuarters,
    groups,
    nonVoters: nv,
  } = useOptimisticVote(
    matchId,
    myStatus,
    myQuartersAttending,
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
              myName={null}
              onChange={setQuarters}
            />
          )}
        </>
      )}

      {isManager ? (
        <AttendanceManagerBoard
          matchId={matchId}
          byStatus={groups}
          nonVoters={nv}
        />
      ) : (
        <div className="flex flex-col gap-2 pt-1">
          <AttendanceRow
            label="참석"
            count={groups.attending.length}
            badgeClass="bg-green-100 text-green-700"
            members={groups.attending}
          />
          <AttendanceRow
            label="불참"
            count={groups.absent.length}
            badgeClass="bg-red-100 text-red-700"
            members={groups.absent}
          />
          <AttendanceRow
            label="미정"
            count={groups.undecided.length}
            badgeClass="bg-gray-200 text-gray-700"
            members={groups.undecided}
          />
          <div className="h-px bg-suaza-border my-1" />
          <NonVoterRow members={nv} />
        </div>
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────
// 멤버별 참여 쿼터 (참석자만 그룹화)
// ───────────────────────────────────────────────────────────

function AttendingByQuarterSection({
  attending,
  totalQuarters,
}: {
  attending: VotePlayer[];
  totalQuarters: number;
}) {
  // 그룹별 키: null(전체) → totalQuarters, 그 외 1..N
  // 정렬: 쿼터 수 내림차순 (전체 → N-1쿼터까지 → ... → 1쿼터까지)
  const groups = useMemo(() => {
    const map = new Map<number, VotePlayer[]>();
    for (const p of attending) {
      const k = p.quarters_attending ?? totalQuarters;
      const arr = map.get(k) ?? [];
      arr.push(p);
      map.set(k, arr);
    }
    // 각 그룹 내부 정렬: voted_at asc (오래 참여한 순서)
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ta = a.voted_at ? new Date(a.voted_at).getTime() : Infinity;
        const tb = b.voted_at ? new Date(b.voted_at).getTime() : Infinity;
        return ta - tb;
      });
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [attending, totalQuarters]);

  return (
    <div className="bg-suaza-bg/30 rounded-xl p-3 desktop:p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-suaza-ink flex items-center gap-1.5">
          <span>👥</span>
          멤버별 참여 쿼터
        </h3>
        <span className="text-[11px] text-suaza-ink-faint">
          오래 참여한 순서
        </span>
      </div>
      {attending.length === 0 ? (
        <p className="text-xs text-suaza-ink-faint py-2 text-center">
          아직 참석 응답한 멤버가 없어요
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {groups.map(([quarters, members]) => (
            <li key={quarters} className="flex items-start gap-3">
              <div className="shrink-0 w-20 desktop:w-24 flex flex-col gap-1">
                <span className="text-xs font-bold text-suaza-ink">
                  {quarters === totalQuarters
                    ? `전체 (${totalQuarters}Q)`
                    : `${quarters}쿼터까지`}
                </span>
                <QuarterBar value={quarters} total={totalQuarters} />
                <span className="text-[11px] text-suaza-ink-muted">
                  {members.length}명
                </span>
              </div>
              <div className="flex flex-wrap gap-1 flex-1 min-w-0 pt-0.5">
                {members.map((m) => (
                  <span
                    key={m.id}
                    className="text-xs px-2.5 py-0.5 rounded-full border bg-white text-suaza-ink"
                    style={{ borderColor: "#22C55E" }}
                  >
                    {m.name}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuarterBar({ value, total }: { value: number; total: number }) {
  return (
    <div
      className="grid gap-0.5"
      style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-sm ${
            i < value ? "bg-green-500" : "bg-gray-200"
          }`}
        />
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
              className={`text-xs px-2.5 py-0.5 rounded-full border transition ${
                muted ? "text-suaza-ink-muted bg-gray-50" : "text-suaza-ink bg-white"
              }`}
              style={{ borderColor: muted ? "#E5E7EB" : color }}
            >
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
  const names = members.map((m) => m.name);
  return (
    <div className="flex items-start gap-2">
      <span
        className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${badgeClass}`}
      >
        {label} {count}
      </span>
      <span className="text-sm text-suaza-ink-muted leading-relaxed break-keep">
        {names.length > 0 ? names.join(", ") : "—"}
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
