"use client";

import {
  useMemo,
  useOptimistic,
  useTransition,
  type ReactNode,
} from "react";
import { voteAttendance } from "@/lib/matches/actions";

export type VotePlayer = {
  id: string;
  name: string;
  jersey_number?: number | null;
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

/**
 * 본인 출석 상태를 낙관적으로 관리하고, 그 상태에 맞춰
 * 그룹/미투표 명단과 카운트를 즉시 재배치해 돌려준다.
 */
function useOptimisticAttendance(
  matchId: string,
  myStatus: string | null,
  me: VotePlayer | null,
  byStatus: Groups,
  nonVoters: VotePlayer[],
) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(myStatus);
  const [, startTransition] = useTransition();

  const vote = (value: Status) => {
    // 토글: 이미 선택된 항목을 다시 누르면 미투표(null)
    const next = optimisticStatus === value ? null : value;
    startTransition(async () => {
      setOptimisticStatus(next);
      await voteAttendance(matchId, value);
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
      if (optimisticStatus === "attending") {
        groups.attending = [...groups.attending, me].sort(byName);
      } else if (optimisticStatus === "absent") {
        groups.absent = [...groups.absent, me].sort(byName);
      } else if (optimisticStatus === "undecided") {
        groups.undecided = [...groups.undecided, me].sort(byName);
      } else {
        nv = [me, ...nv];
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
  }, [me, byStatus, nonVoters, optimisticStatus]);

  return { optimisticStatus, vote, ...computed };
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
                : "bg-white border-suaza-border text-suaza-ink hover:bg-gray-50"
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
// 경기 상세 카드용 패널 (버튼 + 카운트 + 명단)
// ───────────────────────────────────────────────────────────

export function AttendanceCardVote({
  matchId,
  me,
  myName,
  myStatus,
  byStatus,
  nonVoters,
  isManager,
  locked,
  children,
}: {
  matchId: string;
  me: VotePlayer | null;
  myName: string | null;
  myStatus: string | null;
  byStatus: Groups;
  nonVoters: VotePlayer[];
  isManager: boolean;
  locked: boolean;
  /** 매니저용 멤버 보드 (서버에서 전달) */
  children?: ReactNode;
}) {
  const { optimisticStatus, vote, groups, nonVoters: nv, counts } =
    useOptimisticAttendance(matchId, myStatus, me, byStatus, nonVoters);

  const showBoard = isManager && !locked;

  return (
    <>
      {/* My response */}
      {locked ? (
        <div className="bg-gray-50 rounded-xl p-3 text-center text-xs text-suaza-ink-muted">
          🔒 경기 시작 후에는 출석 투표를 변경할 수 없습니다
        </div>
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
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 py-2">
        <StatCount label="참석" value={counts.attending} color="#22C55E" />
        <StatCount label="불참" value={counts.absent} color="#EF3E3E" />
        <StatCount label="미정" value={counts.undecided} color="#9CA3AF" />
        <StatCount label="미투표" value={counts.nonVoters} color="#D1D5DB" />
      </div>

      {/* Member pills */}
      <h3 className="text-sm font-bold text-suaza-ink">멤버별 응답</h3>
      {showBoard ? (
        children
      ) : (
        <div className="flex flex-col gap-3">
          <MemberGroup
            label="참석"
            count={counts.attending}
            color="#22C55E"
            members={groups.attending}
          />
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
  byStatus,
  nonVoters,
  isManager,
  children,
}: {
  matchId: string;
  me: VotePlayer | null;
  myStatus: string | null;
  byStatus: Groups;
  nonVoters: VotePlayer[];
  isManager: boolean;
  children?: ReactNode;
}) {
  const { optimisticStatus, vote, groups, nonVoters: nv } =
    useOptimisticAttendance(matchId, myStatus, me, byStatus, nonVoters);

  return (
    <>
      <VoteButtons status={optimisticStatus} onVote={vote} />

      {isManager ? (
        children
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
