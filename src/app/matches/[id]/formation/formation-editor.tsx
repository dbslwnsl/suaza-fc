"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { saveFormation } from "@/lib/formations/actions";
import {
  incrementStatForPlayer,
  setIntraWinner,
  setMomForPlayer,
  setMyCondition,
} from "@/lib/matches/actions";
import {
  createCoachComment,
  deleteCoachComment,
  updateCoachComment,
} from "@/app/members/[id]/actions";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import {
  FORMATIONS,
  buildSlots,
  buildSlotsForTeam,
  type SaveFormationPayload,
  type SavedQuarter,
  type SlotDef,
  type SlotRole,
  type Team,
} from "@/lib/formations/helpers";
import {
  POSITIONS,
  POSITION_COLOR,
  type Position,
  type MemberTitle,
  type PreferredFoot,
} from "@/lib/members/positions";
import type { EditorMember, GameQuarter, PlayerStat } from "./embed";

// 선수가 특정 전체-쿼터(globalIndex, 1-based)에 참여하는지.
// attending_quarters 가 null 이면 전체 참여로 간주.
function isAvailableForQuarter(
  attendingQuarters: number[] | null | undefined,
  globalIndex: number,
): boolean {
  if (attendingQuarters == null) return true;
  return attendingQuarters.includes(globalIndex);
}

type Filter = "ALL" | Position;

type TeamFormation = {
  shape: string;
  assignments: (string | null)[];
};

type QuarterState = {
  id: string;
  shape: string;
  assignments: (string | null)[];
  teamB?: TeamFormation;
};

const DEFAULT_INTRA_SHAPE = "4-2-3-1";

const TITLE_SHORT: Record<MemberTitle, string> = {
  president: "회장",
  vice_president: "부회장",
  treasurer: "총무",
  auditor: "감사",
  head_coach: "감독",
  coach: "코치",
  player: "",
};

// 컨디션 1~5단계. 1=최상(빨강·12시) → 5=최하(파랑·6시).
// 색: 빨강 → 파랑 균등, 화살표 회전: 3시(0°) 기준.
const CONDITION_COLOR = [
  "#EF4444", // 1 빨강
  "#EAB308", // 2 노랑
  "#22C55E", // 3 초록 (기본)
  "#06B6D4", // 4 청록
  "#3B82F6", // 5 파랑
];
const CONDITION_DEG = [-90, -45, 0, 45, 90]; // 12시, 1:30, 3시, 4:30, 6시

function ConditionArrow({
  level,
  interactive = false,
  onCycle,
}: {
  level: number;
  interactive?: boolean;
  onCycle?: () => void;
}) {
  const idx = Math.min(5, Math.max(1, level)) - 1;
  const color = CONDITION_COLOR[idx];
  const deg = CONDITION_DEG[idx];
  const inner = (
    <span
      className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full"
      style={{ backgroundColor: `${color}26` }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        style={{ transform: `rotate(${deg}deg)` }}
      >
        {/* 기본: 오른쪽(3시) 화살표 */}
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
  );
  if (interactive && onCycle) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCycle();
        }}
        aria-label={`내 컨디션 ${level}단계 (눌러서 변경)`}
        title="내 컨디션 변경"
        className="shrink-0 hover:scale-110 active:scale-95 transition"
      >
        {inner}
      </button>
    );
  }
  return (
    <span className="shrink-0" aria-label={`컨디션 ${level}단계`}>
      {inner}
    </span>
  );
}

const FOOT_SHORT: Record<PreferredFoot, string> = {
  left: "L",
  right: "R",
  both: "LR",
};
const FOOT_LABEL_KO: Record<PreferredFoot, string> = {
  left: "왼발",
  right: "오른발",
  both: "양발",
};

function FootBadge({ foot }: { foot: PreferredFoot | null }) {
  if (!foot) return null;
  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center h-[18px] min-w-[18px] rounded-full bg-suaza-bg text-suaza-ink-muted text-[9px] font-bold leading-none ${
        foot === "both" ? "px-0" : "px-1"
      }`}
      aria-label={`주발 ${FOOT_LABEL_KO[foot]}`}
    >
      {FOOT_SHORT[foot]}
    </span>
  );
}

/**
 * 이름이 가용 폭을 넘으면 맨 앞 "성"을 떼고 표기.
 * 숨김 측정용 span(전체 이름)의 자연 너비를 컨테이너 가용 폭과 비교해 판단.
 */
function PlayerName({
  name,
  className,
  // false 면 칸이 좁아도 성을 떼지 않고 항상 풀네임 표시 (데스크탑 명단용)
  allowDropSurname = true,
}: {
  name: string;
  className?: string;
  allowDropSurname?: boolean;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const fullRef = useRef<HTMLSpanElement>(null);
  const [dropSurname, setDropSurname] = useState(false);

  useEffect(() => {
    if (!allowDropSurname) {
      setDropSurname(false);
      return;
    }
    const wrap = wrapRef.current;
    const full = fullRef.current;
    if (!wrap || !full) return;
    const measure = () => {
      setDropSurname(
        name.length > 1 && full.scrollWidth > wrap.clientWidth + 1,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [name, allowDropSurname]);

  return (
    <span
      ref={wrapRef}
      className={`relative block min-w-0 truncate ${className ?? ""}`}
    >
      <span
        ref={fullRef}
        aria-hidden
        className="absolute left-0 top-0 whitespace-nowrap invisible pointer-events-none"
      >
        {name}
      </span>
      {dropSurname ? name.slice(1) : name}
    </span>
  );
}

export default function FormationEditor({
  matchId,
  myUserId,
  members,
  attendingIds,
  teamByPlayer = {},
  attendingQuartersByPlayer = {},
  gameQuarters,
  initialQuarters,
  isIntra,
  teamAName = "A팀",
  teamBName = "B팀",
  editableTeam,
  captainIds = [],
  matchLocked = false,
  statByPlayer = {},
  canEditStats = false,
  winningTeam = null,
  canEditWinner = false,
  canWriteCoachComment = false,
  matchDate = null,
  commentCountByPlayer = {},
}: {
  matchId: string;
  myUserId: string;
  members: EditorMember[];
  attendingIds: string[];
  teamByPlayer?: Record<string, "A" | "B" | null>;
  attendingQuartersByPlayer?: Record<string, number[] | null>;
  gameQuarters: GameQuarter[];
  initialQuarters: SavedQuarter[];
  isIntra: boolean;
  // 자체전 팀 표시명 (경기 설정에서 입력한 이름 — 미입력 시 "A팀"/"B팀")
  teamAName?: string;
  teamBName?: string;
  // 편집 권한: "both"=감독/회장(양 팀), "A"/"B"=해당 팀 주장만, null=보기 전용
  editableTeam: "A" | "B" | "both" | null;
  // 팀 주장 player id 목록 — 경기장 배치 시 이름 앞에 "C" 표시
  captainIds?: string[];
  // 경기가 종료/취소된 상태 — 실수 방지 위해 초기화·자동 버튼 비활성화
  matchLocked?: boolean;
  // 종료 경기 임베드 전용 — 선수별 통계(이번 경기 골/어시/CS/심판/MOM/포인트)
  statByPlayer?: Record<string, PlayerStat>;
  // 매니저·감독·회장만 기록 입력 UI 활성화
  canEditStats?: boolean;
  // 승리팀 (자체전 종료 시 "A" | "B", 상대전·미확정은 null)
  winningTeam?: "A" | "B" | null;
  // 운동장 위 승/무/패 토글 권한 (회장·감독 + 자체전 종료 경기에서만 true)
  canEditWinner?: boolean;
  // 감독·코치 코멘트 작성 가능 여부 — 종료 경기 임베드에서 선수 카드의 코멘트 아이콘 표시 토글
  canWriteCoachComment?: boolean;
  // 코멘트 모달 헤더에 표시할 경기 일자(ISO). null 이면 표시 생략.
  matchDate?: string | null;
  // 회원별 코멘트 개수 — 아이콘 배경(코멘트 있음 표시) 토글 + 일반 회원에게 본인 카드 아이콘 표시 분기
  commentCountByPlayer?: Record<string, number>;
}) {
  // 전혀 편집할 수 없으면 readonly. 감독/회장은 양 팀, 주장은 자기 팀만 편집 가능.
  const readonly = editableTeam == null;
  const fullAccess = editableTeam === "both";
  const canEditTeam = (team: "A" | "B") =>
    editableTeam === "both" || editableTeam === team;
  // 출석 쿼터 변경으로 자동 제거된 배치 경고 (쿼터 라벨 목록)
  const [autoRemoved, setAutoRemoved] = useState<string[]>([]);

  const [quarters, setQuarters] = useState<QuarterState[]>(() => {
    // 방어: 슬롯에 남아있는 비활성/미출석 회원 ID 를 비운다.
    // 유효 = 활성 회원(members) ∩ 출석 회원(attendingIds)
    // 추가로, 각 쿼터에서 그 쿼터에 참여하지 않는 선수도 제거(자동 제거 + 경고).
    const memberSet = new Set(members.map((m) => m.id));
    const attendSet = new Set(attendingIds);
    const removedLabels = new Set<string>();
    const keepFor =
      (globalIndex: number, label: string) =>
      (id: string | null | undefined): string | null => {
        if (!id) return null;
        if (!memberSet.has(id) || !attendSet.has(id)) return null;
        if (!isAvailableForQuarter(attendingQuartersByPlayer[id], globalIndex)) {
          removedLabels.add(label);
          return null;
        }
        return id;
      };
    const next = initialQuarters.map((q, idx) => {
      const gi = gameQuarters[idx]?.globalIndex ?? idx + 1;
      const label = gameQuarters[idx]?.label ?? q.id;
      const keep = keepFor(gi, label);
      const aSlots = buildSlots(q.shape);
      const state: QuarterState = {
        id: q.id,
        shape: q.shape,
        assignments: aSlots.map((_, i) => keep(q.player_ids[i])),
      };
      if (isIntra) {
        const bShape = q.teamB?.shape ?? DEFAULT_INTRA_SHAPE;
        const bSlots = buildSlots(bShape);
        state.teamB = {
          shape: bShape,
          assignments: bSlots.map((_, i) => keep(q.teamB?.player_ids?.[i])),
        };
      }
      return state;
    });
    if (removedLabels.size > 0) {
      // 초기 렌더 직후 경고 노출 (state 초기화 중엔 set 불가하므로 microtask 로)
      queueMicrotask(() =>
        setAutoRemoved(
          [...removedLabels].sort((a, b) => a.localeCompare(b, "ko")),
        ),
      );
    }
    return next;
  });
  const [activeIdx, setActiveIdx] = useState(0);
  // 종료 경기 임베드 — 리본 맨 앞 "ALL" 탭 활성 여부.
  //   ALL 활성 시 운동장은 마지막 쿼터(또는 0번 쿼터)를 그대로 표시하지만,
  //   기록은 이미 전체 합계라 추가 처리 불필요. 사용자가 1Q/2Q 누르면 자동 해제.
  const [showAll, setShowAll] = useState(matchLocked);
  // 자체전 승리팀(낙관적). 부모에서 들어온 winningTeam 을 초기값으로,
  // 토글 클릭 시 즉시 반영해 두 버튼(A/B)이 동기화되도록 한다.
  const [optWinningTeam, setOptWinningTeam] = useState<"A" | "B" | null>(
    winningTeam,
  );
  const [, startWinnerTransition] = useTransition();
  const onWinnerChange = (next: "A" | "B" | null) => {
    setOptWinningTeam(next);
    if (matchId) {
      startWinnerTransition(() => {
        setIntraWinner(matchId, next);
      });
    }
  };
  // 자체전 + 회장·감독(fullAccess) 운동장 보기 모드.
  //   "all": 양 팀 동시 표시(기존 동작), "A"/"B": 해당 팀만 단독 표시(상대전처럼).
  //  - 데스크탑: 운동장 표기에만 적용, 양옆 명단은 그대로.
  //  - 모바일: 운동장 + 선수 명단 필터 모두에 적용.
  const [pitchView, setPitchView] = useState<"all" | "A" | "B">("all");
  const [openSlot, setOpenSlot] = useState<{
    team: "A" | "B";
    idx: number;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [, startTransition] = useTransition();
  // 본인 컨디션 (낙관적). 클릭하면 1→2→…→5→1 순환.
  const [myCondition, setMyConditionLocal] = useState<number>(
    () => members.find((m) => m.id === myUserId)?.condition ?? 3,
  );
  const cycleMyCondition = () => {
    const next = myCondition >= 5 ? 1 : myCondition + 1;
    setMyConditionLocal(next);
    startTransition(() => setMyCondition(matchId, next));
  };
  const initialMount = useRef(true);
  const saveDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // unmount 시 강제 저장을 위해 최신 pending payload 보관
  const pendingPayloadRef = useRef<SaveFormationPayload | null>(null);

  useEffect(() => {
    if (readonly) return;
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    const payload: SaveFormationPayload = {
      quarters: quarters.map((q) => ({
        id: q.id,
        shape: q.shape,
        player_ids: q.assignments,
        teamB: q.teamB
          ? {
              shape: q.teamB.shape,
              player_ids: q.teamB.assignments,
            }
          : undefined,
      })),
    };
    pendingPayloadRef.current = payload;
    if (saveDebounce.current) clearTimeout(saveDebounce.current);
    saveDebounce.current = setTimeout(() => {
      setSaveStatus("saving");
      startTransition(async () => {
        try {
          const result = await saveFormation(matchId, payload);
          if (result?.error) setSaveStatus("error");
          else setSaveStatus("saved");
        } catch {
          setSaveStatus("error");
        }
        // 이 payload 가 끝까지 fire 됐으니 pending 해제
        if (pendingPayloadRef.current === payload) {
          pendingPayloadRef.current = null;
        }
        setTimeout(() => setSaveStatus("idle"), 1500);
      });
    }, 300);
    return () => {
      if (saveDebounce.current) clearTimeout(saveDebounce.current);
    };
  }, [quarters, matchId, readonly]);

  // Unmount: pending 이 남아있으면 fire-and-forget 으로 마지막 저장 강제 실행
  useEffect(() => {
    return () => {
      const pending = pendingPayloadRef.current;
      if (pending) {
        saveFormation(matchId, pending).catch(() => {});
        pendingPayloadRef.current = null;
      }
    };
  }, [matchId]);

  const current = quarters[activeIdx] ?? quarters[0];
  // 상대전(single)·자체전 모두 buildSlotsForTeam 을 거쳐 라벨 좌/우가 보정되도록.
  const slotsA = useMemo(
    () =>
      buildSlotsForTeam(current.shape, current.teamB ? "A" : "single"),
    [current.shape, current.teamB],
  );
  const slotsB = useMemo(
    () => (current.teamB ? buildSlotsForTeam(current.teamB.shape, "B") : []),
    [current.teamB],
  );
  const byId = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );
  const captainSet = useMemo(() => new Set(captainIds), [captainIds]);
  // 유효 = 활성 회원 ∩ 출석 회원 (배치/카운트/강조 공통 기준)
  const validIds = useMemo(() => {
    const attendSet = new Set(attendingIds);
    return new Set([...byId.keys()].filter((id) => attendSet.has(id)));
  }, [byId, attendingIds]);
  // 현재 쿼터의 전체-쿼터 인덱스(1-based) — 출석 attending_quarters 와 매핑
  const currentGlobalIndex = gameQuarters[activeIdx]?.globalIndex ?? activeIdx + 1;
  // 현재 쿼터에 참여 가능한 선수 집합 (유효 회원 중 그 쿼터 참여자)
  const availableSet = useMemo(() => {
    const s = new Set<string>();
    for (const id of validIds) {
      if (
        isAvailableForQuarter(
          attendingQuartersByPlayer[id],
          currentGlobalIndex,
        )
      ) {
        s.add(id);
      }
    }
    return s;
  }, [validIds, attendingQuartersByPlayer, currentGlobalIndex]);
  const isAvailable = (id: string) => availableSet.has(id);
  // placedSet: 현재 쿼터의 양 팀 모두를 포함 (유효 회원만)
  const placedSet = useMemo(() => {
    const s = new Set<string>();
    for (const p of current.assignments) if (p && validIds.has(p)) s.add(p);
    if (current.teamB) {
      for (const p of current.teamB.assignments)
        if (p && validIds.has(p)) s.add(p);
    }
    return s;
  }, [current, validIds]);
  const teamOfPlayer = useMemo(() => {
    const map = new Map<string, "A" | "B">();
    for (const p of current.assignments) if (p) map.set(p, "A");
    if (current.teamB) {
      for (const p of current.teamB.assignments) if (p) map.set(p, "B");
    }
    return map;
  }, [current]);
  const attendingMembers = useMemo(() => {
    const set = new Set(attendingIds);
    return members
      .filter((m) => set.has(m.id))
      .sort((a, b) => {
        const an = a.jersey_number ?? 9999;
        const bn = b.jersey_number ?? 9999;
        return an - bn;
      });
  }, [members, attendingIds]);
  // 자체전: 편성팀(team-builder) 기준으로 명단 분리
  const teamAMembers = useMemo(
    () => attendingMembers.filter((m) => teamByPlayer[m.id] === "A"),
    [attendingMembers, teamByPlayer],
  );
  const teamBMembers = useMemo(
    () => attendingMembers.filter((m) => teamByPlayer[m.id] === "B"),
    [attendingMembers, teamByPlayer],
  );

  // 본인의 자체전 팀 ("A" | "B" | null)
  const myTeam: "A" | "B" | null = teamByPlayer[myUserId] ?? null;
  // 자체전에서 양 팀을 모두 보는 건 감독/회장(fullAccess)뿐. 주장·일반 회원은 본인 팀만.
  // 자체전이면서 회장·감독이 아닌 회원은 본인 팀만 보이는 제한 뷰.
  // 단, 종료된 경기(matchLocked)에서는 모든 회원이 양 팀 명단/운동장을 볼 수 있도록 제한 해제.
  const restrictedView = isIntra && !fullAccess && !matchLocked;
  const showTeamA = !restrictedView || myTeam === "A";
  const showTeamB = !restrictedView || myTeam === "B";
  // 자체전 일반 회원이지만 아직 팀 미배정 → 명단은 숨기고 안내만, 운동장은 양 팀 그대로
  const noTeamView = restrictedView && myTeam == null;

  function patchQuarter(i: number, fn: (q: QuarterState) => QuarterState) {
    setQuarters((prev) => prev.map((q, idx) => (idx === i ? fn(q) : q)));
  }

  function changeShape(team: "A" | "B", next: string) {
    if (!canEditTeam(team)) return;
    patchQuarter(activeIdx, (q) => {
      const nextSlots = buildSlots(next);
      const tf =
        team === "A"
          ? { shape: q.shape, assignments: q.assignments }
          : q.teamB ?? { shape: DEFAULT_INTRA_SHAPE, assignments: [] };
      const seen = new Set<string>();
      const newAssignments: (string | null)[] = nextSlots.map((_, j) => {
        const pid = tf.assignments[j] ?? null;
        if (pid && !seen.has(pid)) {
          seen.add(pid);
          return pid;
        }
        return null;
      });
      if (team === "A") {
        return { ...q, shape: next, assignments: newAssignments };
      }
      return {
        ...q,
        teamB: { shape: next, assignments: newAssignments },
      };
    });
    setOpenSlot(null);
  }

  function assignSlot(
    team: "A" | "B",
    slotIndex: number,
    playerId: string | null,
  ) {
    if (matchLocked) return;
    if (!canEditTeam(team)) return;
    // 현재 쿼터에 참여하지 않는 선수는 배치 불가
    if (playerId && !isAvailable(playerId)) {
      setOpenSlot(null);
      return;
    }
    // 자체전: 본인 편성팀과 다른 팀 슬롯에는 배치 불가
    if (playerId && isIntra) {
      const playerTeam = teamByPlayer[playerId] ?? null;
      if (playerTeam && playerTeam !== team) {
        setOpenSlot(null);
        return;
      }
    }
    patchQuarter(activeIdx, (q) => {
      const aAssigns = [...q.assignments];
      const bAssigns = q.teamB ? [...q.teamB.assignments] : null;
      if (playerId) {
        // 양 팀 전체에서 중복 제거 (현재 슬롯 제외)
        for (let j = 0; j < aAssigns.length; j++) {
          if (aAssigns[j] === playerId) {
            if (!(team === "A" && j === slotIndex)) aAssigns[j] = null;
          }
        }
        if (bAssigns) {
          for (let j = 0; j < bAssigns.length; j++) {
            if (bAssigns[j] === playerId) {
              if (!(team === "B" && j === slotIndex)) bAssigns[j] = null;
            }
          }
        }
      }
      if (team === "A") {
        aAssigns[slotIndex] = playerId;
      } else if (bAssigns) {
        bAssigns[slotIndex] = playerId;
      }
      return {
        ...q,
        assignments: aAssigns,
        teamB:
          q.teamB && bAssigns
            ? { ...q.teamB, assignments: bAssigns }
            : q.teamB,
      };
    });
    setOpenSlot(null);
  }

  function swapSlots(
    sourceTeam: "A" | "B",
    sourceIdx: number,
    targetTeam: "A" | "B",
    targetIdx: number,
  ) {
    if (matchLocked) return;
    if (!canEditTeam(sourceTeam) || !canEditTeam(targetTeam)) return;
    if (sourceTeam === targetTeam && sourceIdx === targetIdx) return;
    // 자체전: 다른 팀 슬롯 간 스왑은 본인 편성팀과 어긋날 수 있으므로 차단
    if (isIntra && sourceTeam !== targetTeam) {
      setOpenSlot(null);
      return;
    }
    patchQuarter(activeIdx, (q) => {
      const aAssigns = [...q.assignments];
      const bAssigns = q.teamB ? [...q.teamB.assignments] : null;
      const get = (t: "A" | "B", i: number): string | null =>
        t === "A" ? aAssigns[i] ?? null : bAssigns ? bAssigns[i] ?? null : null;
      const set = (t: "A" | "B", i: number, v: string | null) => {
        if (t === "A") aAssigns[i] = v;
        else if (bAssigns) bAssigns[i] = v;
      };
      const src = get(sourceTeam, sourceIdx);
      const tgt = get(targetTeam, targetIdx);
      set(targetTeam, targetIdx, src);
      set(sourceTeam, sourceIdx, tgt);
      return {
        ...q,
        assignments: aAssigns,
        teamB:
          q.teamB && bAssigns
            ? { ...q.teamB, assignments: bAssigns }
            : q.teamB,
      };
    });
    setOpenSlot(null);
  }

  function handleSlotDrop(
    targetTeam: "A" | "B",
    targetIdx: number,
    playerId: string,
    sourceTeam?: "A" | "B",
    sourceIdx?: number,
  ) {
    if (sourceTeam != null && sourceIdx != null) {
      swapSlots(sourceTeam, sourceIdx, targetTeam, targetIdx);
    } else {
      assignSlot(targetTeam, targetIdx, playerId);
    }
  }

  function unassignPlayer(playerId: string) {
    if (matchLocked) return;
    // 편집 가능한 팀에서만 제거 (주장은 자기 팀 슬롯만)
    patchQuarter(activeIdx, (q) => ({
      ...q,
      assignments: canEditTeam("A")
        ? q.assignments.map((p) => (p === playerId ? null : p))
        : q.assignments,
      teamB: q.teamB
        ? {
            ...q.teamB,
            assignments: canEditTeam("B")
              ? q.teamB.assignments.map((p) => (p === playerId ? null : p))
              : q.teamB.assignments,
          }
        : q.teamB,
    }));
  }

  function findSlotForPlayer(
    playerId: string,
    team: "A" | "B",
  ): number | null {
    const m = byId.get(playerId);
    const positions: Position[] = m?.positions ?? [];
    const slots = team === "A" ? slotsA : slotsB;
    const assigns =
      team === "A" ? current.assignments : current.teamB?.assignments ?? [];
    for (const pos of positions) {
      for (let i = 0; i < slots.length; i++) {
        if (!assigns[i] && slots[i].role === pos) return i;
      }
    }
    for (let i = 0; i < slots.length; i++) {
      if (!assigns[i]) return i;
    }
    return null;
  }

  function placeByClick(playerId: string) {
    // 현재 쿼터에 참여하지 않는 선수는 배치 불가
    if (!isAvailable(playerId)) return;
    // 자체전이면 편성팀(teamByPlayer)으로 고정, 상대전이면 A팀
    const t: "A" | "B" = isIntra
      ? teamByPlayer[playerId] ?? teamOfPlayer.get(playerId) ?? "A"
      : "A";
    if (!canEditTeam(t)) return;
    const slot = findSlotForPlayer(playerId, t);
    if (slot != null) assignSlot(t, slot, playerId);
  }

  // 한 팀만 자동 배치. 자체전이면 team 인자에 해당하는 팀만, 상대전이면 항상 "A".
  function autoPlaceTeam(team: "A" | "B") {
    if (matchLocked) return;
    if (!canEditTeam(team)) return;
    setQuarters((prev) => {
      const q = prev[activeIdx];
      if (!q) return prev;
      const intra = !!q.teamB;
      if (team === "B" && !q.teamB) return prev;

      // 다른 쿼터들에서의 배치 횟수 (현재 쿼터 제외) — 적은 선수 우선
      const playCount = new Map<string, number>();
      prev.forEach((qq, idx) => {
        if (idx === activeIdx) return;
        for (const p of qq.assignments)
          if (p) playCount.set(p, (playCount.get(p) ?? 0) + 1);
        if (qq.teamB) {
          for (const p of qq.teamB.assignments)
            if (p) playCount.set(p, (playCount.get(p) ?? 0) + 1);
        }
      });

      const slots =
        team === "A" ? buildSlots(q.shape) : buildSlots(q.teamB!.shape);
      const assigns =
        team === "A"
          ? [...q.assignments]
          : [...q.teamB!.assignments];

      // 자체전: 이 팀 슬롯에 편성팀이 다른 선수는 먼저 제거
      if (intra) {
        for (let i = 0; i < assigns.length; i++) {
          const pid = assigns[i];
          if (pid && teamByPlayer[pid] !== team) assigns[i] = null;
        }
      }

      // 이미 배치된 선수(양 팀 전체) — 중복 배치 방지
      const placed = new Set<string>();
      for (const p of assigns) if (p) placed.add(p);
      const otherAssigns =
        team === "A" ? q.teamB?.assignments ?? [] : q.assignments;
      for (const p of otherAssigns) if (p) placed.add(p);

      // 후보 명단 (배치 횟수 오름차순, 동률은 랜덤) — 현재 쿼터 참여자만
      const base = (
        intra
          ? attendingMembers.filter((m) => teamByPlayer[m.id] === team)
          : attendingMembers
      ).filter((m) => availableSet.has(m.id));
      const candidates = base
        .map((m) => ({ m, c: playCount.get(m.id) ?? 0, r: Math.random() }))
        .sort((a, b) => (a.c !== b.c ? a.c - b.c : a.r - b.r))
        .map((x) => x.m);

      // GK 우선 → 포지션 매칭 → 아무 빈 슬롯
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].role !== "GK" || assigns[i]) continue;
        const gk = candidates.find(
          (m) => !placed.has(m.id) && (m.positions ?? []).includes("GK"),
        );
        if (gk) {
          assigns[i] = gk.id;
          placed.add(gk.id);
        }
      }
      for (const m of candidates) {
        if (placed.has(m.id)) continue;
        const positions = m.positions ?? [];
        let done = false;
        for (const pos of positions) {
          const idx = slots.findIndex((s, i) => !assigns[i] && s.role === pos);
          if (idx >= 0) {
            assigns[idx] = m.id;
            done = true;
            break;
          }
        }
        if (!done) {
          const idx = slots.findIndex((_, i) => !assigns[i]);
          if (idx >= 0) {
            assigns[idx] = m.id;
            done = true;
          }
        }
        if (done) placed.add(m.id);
      }

      const newQ: QuarterState =
        team === "A"
          ? { ...q, assignments: assigns }
          : { ...q, teamB: { ...q.teamB!, assignments: assigns } };
      return prev.map((x, i) => (i === activeIdx ? newQ : x));
    });
  }

  function resetTeam(team: "A" | "B") {
    if (matchLocked) return;
    if (!canEditTeam(team)) return;
    const teamName = isIntra
      ? team === "A"
        ? `${teamAName} `
        : `${teamBName} `
      : "";
    const qLabel = gameQuarters[activeIdx]?.label ?? current.id;
    if (!confirm(`${qLabel} ${teamName}배치를 비우시겠습니까?`)) return;
    patchQuarter(activeIdx, (q) => {
      if (team === "A") {
        return { ...q, assignments: buildSlots(q.shape).map(() => null) };
      }
      if (!q.teamB) return q;
      return {
        ...q,
        teamB: {
          ...q.teamB,
          assignments: buildSlots(q.teamB.shape).map(() => null),
        },
      };
    });
  }

  return (
    <div className="flex flex-col gap-3 desktop:flex-1 desktop:min-h-0">
      {/* 자동 제거 경고 — 출석 쿼터 변경으로 일부 배치가 제거된 경우 */}
      {autoRemoved.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="shrink-0">⚠️</span>
          <span className="flex-1 leading-relaxed">
            {autoRemoved.join(", ")} 쿼터에서 해당 쿼터에 참석하지 않는 선수의
            배치를 자동으로 제거했어요. 다시 배치해 주세요.
          </span>
          <button
            type="button"
            onClick={() => setAutoRemoved([])}
            aria-label="경고 닫기"
            className="shrink-0 text-amber-700 hover:text-amber-900"
          >
            ×
          </button>
        </div>
      )}

      {/* 쿼터 탭은 명단 카드 위 리본으로만 표시 (PlayerRoster* 내부). 운동장 위 탭 없음. */}

      {/* 포메이션 칩 — 진행 중/예정 경기에서 상단 노출(개편 전 UI).
          종료 경기는 명단 카드 헤더로 이동되어 여기선 숨김. */}
      {/* 포메이션 드롭다운은 모바일/데스크탑 모두 명단 카드 내부로 이동됨. */}

      {/* 저장 상태 — 떠 있는 토스트 (레이아웃 공간 차지 안 함) */}
      {saveStatus !== "idle" && (
        <div className="fixed top-4 right-4 z-50 shadow-md rounded-full">
          <SaveStatusBadge status={saveStatus} />
        </div>
      )}

      {/* 메인 영역 — 데스크탑: 자체전 3열(A명단|경기장|B명단), 상대전 2열(경기장|명단).
          종료 경기 임베드는 양옆 명단을 넓게 쓰기 위해 gap-6, 진행 중은 기존 gap-3. */}
      <div
        className={`desktop-lg:flex ${
          matchLocked ? "desktop-lg:gap-6" : "desktop-lg:gap-3"
        } desktop-lg:flex-1 desktop-lg:min-h-0 ${
          matchLocked ? "" : "desktop-lg:min-w-max"
        }`}
      >
        {/* 자체전 A팀 명단 (데스크탑 좌측) — 양 팀을 모두 보는 매니저 전용.
            일반회원(restrictedView)은 본인 팀이 A든 B든 우측 명단으로 통일. */}
        {isIntra && showTeamA && !restrictedView && (
          <DesktopRosterPane
            showRibbon
            wideMode
            ribbonTabs={quarters.map((q, i) => ({
              id: q.id,
              label: gameQuarters[i]?.label ?? q.id,
            }))}
            activeRibbonIdx={activeIdx}
            onRibbonChange={(i) => {
              setActiveIdx(i);
              setShowAll(false);
            }}
            includeAllTab={matchLocked}
            isAllActive={matchLocked && showAll}
            onAllClick={() => setShowAll(true)}
          >
            <PlayerRosterDesktop
              members={teamAMembers}
              teamLabel={teamAName}
              teamColor="#3B82F6"
              currentShape={current.shape}
              onShapeChange={(s) => changeShape("A", s)}
              myUserId={myUserId}
              myCondition={myCondition}
              onCycleCondition={cycleMyCondition}
              quarters={quarters}
              validIds={validIds}
              availableIds={availableSet}
              placedSet={placedSet}
              teamOfPlayer={teamOfPlayer}
              isIntra={isIntra}
              readonly={readonly}
              onTap={(id, placed) => {
                if (readonly) return;
                if (placed) unassignPlayer(id);
                else placeByClick(id);
              }}
              onDragStart={(id) => setDraggingId(id)}
              onDragEnd={() => setDraggingId(null)}
              onReset={() => resetTeam("A")}
              onAutoPlace={() => autoPlaceTeam("A")}
              matchLocked={matchLocked}
              statByPlayer={statByPlayer}
              canEditStats={canEditStats && showAll}
              matchId={matchId}
              winningTeam={optWinningTeam}
              rosterTeam="A"
              canWriteCoachComment={canWriteCoachComment}
              matchDate={matchDate}
              commentCountByPlayer={commentCountByPlayer}
            />
          </DesktopRosterPane>
        )}

        {/* 경기장 */}
        <div className="relative min-w-0 desktop-lg:shrink-0 desktop-lg:flex desktop-lg:flex-col desktop-lg:items-center desktop-lg:justify-center">
          {/* 자체전 + 회장·감독: 운동장 위 보기 모드 리본 (A팀 / 전체 / B팀).
              종료 경기에서는 좌·우 양 끝에 승/무/패 토글이 함께 노출됨. */}
          {fullAccess && isIntra && current.teamB && (
            <div className="flex items-center justify-center gap-2 pb-2 desktop:pb-3">
              {matchLocked && (
                <WinnerToggle
                  team="A"
                  winningTeam={optWinningTeam}
                  onChange={onWinnerChange}
                  canEdit={canEditWinner}
                />
              )}
              <PitchViewToggle
                value={pitchView}
                onChange={setPitchView}
                teamAName={teamAName}
                teamBName={teamBName}
              />
              {matchLocked && (
                <WinnerToggle
                  team="B"
                  winningTeam={optWinningTeam}
                  onChange={onWinnerChange}
                  canEdit={canEditWinner}
                />
              )}
            </div>
          )}
          {(() => {
            // 자체전 + 일반 회원: 본인 팀 슬롯만 표시 (운동장 전체 사용)
            // 미배정 시(noTeamView)에는 양 팀 모두 표시 (운동장은 보이게)
            const restrictPitchToMyTeam =
              restrictedView && myTeam != null && !!current.teamB;
            // 회장·감독이 단일 팀만 선택한 경우 — 상대전처럼 단독 표기
            const fullAccessSingle =
              fullAccess && isIntra && current.teamB && pitchView !== "all";
            const teams = restrictPitchToMyTeam
              ? [
                  myTeam === "A"
                    ? {
                        team: "A" as const,
                        slots: buildSlotsForTeam(current.shape, "single"),
                        assignments: current.assignments,
                      }
                    : {
                        team: "B" as const,
                        slots: buildSlotsForTeam(
                          current.teamB!.shape,
                          "single",
                        ),
                        assignments: current.teamB!.assignments,
                      },
                ]
              : fullAccessSingle
                ? [
                    pitchView === "A"
                      ? {
                          team: "A" as const,
                          slots: buildSlotsForTeam(current.shape, "single"),
                          assignments: current.assignments,
                        }
                      : {
                          team: "B" as const,
                          slots: buildSlotsForTeam(
                            current.teamB!.shape,
                            "single",
                          ),
                          assignments: current.teamB!.assignments,
                        },
                  ]
                : current.teamB
                  ? [
                      {
                        team: "A" as const,
                        slots: buildSlotsForTeam(current.shape, "A"),
                        assignments: current.assignments,
                      },
                      {
                        team: "B" as const,
                        slots: buildSlotsForTeam(current.teamB.shape, "B"),
                        assignments: current.teamB.assignments,
                      },
                    ]
                  : [
                      {
                        team: "A" as const,
                        slots: slotsA,
                        assignments: current.assignments,
                      },
                    ];
            const pitchIntra = teams.length === 2;
            return (
              <Pitch
                teams={teams}
                isIntra={pitchIntra}
                tallContainer={isIntra}
                byId={byId}
                captainSet={captainSet}
                myUserId={myUserId}
                myCondition={myCondition}
                readonly={readonly || matchLocked}
                teamAName={teamAName}
                teamBName={teamBName}
                shapeA={
                  // ALL 활성 시 항상 1쿼터(0번) shape 표시,
                  // 그 외엔 현재 활성 쿼터(=current.shape)
                  matchLocked && showAll
                    ? quarters[0]?.shape ?? current.shape
                    : current.shape
                }
                shapeB={
                  matchLocked && showAll
                    ? quarters[0]?.teamB?.shape ?? current.teamB?.shape
                    : current.teamB?.shape
                }
                compactWidth
                teamByPlayer={teamByPlayer}
                isIntraMatch={isIntra}
                draggingId={draggingId}
                onSlotClick={(team, i) => {
                  if (matchLocked) return;
                  if (canEditTeam(team)) setOpenSlot({ team, idx: i });
                }}
                onSlotDrop={handleSlotDrop}
                onDragStart={(id) => setDraggingId(id)}
                onDragEnd={() => setDraggingId(null)}
                onSwapSlots={swapSlots}
                onUnassignSlot={(team, i) => assignSlot(team, i, null)}
              />
            );
          })()}
        </div>

        {/* 우측 명단 — 상대전: 전체 / 자체전 매니저: B팀 /
            자체전 일반회원: 본인 팀(A 또는 B) */}
        {(!isIntra || showTeamA || showTeamB) &&
          (() => {
            const restrictedAOnRight = restrictedView && myTeam === "A";
            const rightTeam: "A" | "B" = restrictedAOnRight ? "A" : "B";
            const rightMembers = !isIntra
              ? attendingMembers
              : restrictedAOnRight
                ? teamAMembers
                : teamBMembers;
            const rightLabel = !isIntra
              ? undefined
              : restrictedAOnRight
                ? teamAName
                : teamBName;
            const rightColor = !isIntra
              ? undefined
              : restrictedAOnRight
                ? "#3B82F6"
                : "#EF4444";
            const rightShape = !isIntra
              ? current.shape
              : restrictedAOnRight
                ? current.shape
                : current.teamB?.shape ?? DEFAULT_INTRA_SHAPE;
            const rightChangeTeam: "A" | "B" =
              !isIntra ? "A" : restrictedAOnRight ? "A" : "B";
            return (
              <DesktopRosterPane
                showRibbon
            wideMode
                ribbonTabs={quarters.map((q, i) => ({
                  id: q.id,
                  label: gameQuarters[i]?.label ?? q.id,
                }))}
                activeRibbonIdx={activeIdx}
                onRibbonChange={(i) => {
                  setActiveIdx(i);
                  setShowAll(false);
                }}
                includeAllTab={matchLocked}
                isAllActive={matchLocked && showAll}
                onAllClick={() => setShowAll(true)}
              >
                <PlayerRosterDesktop
                  members={rightMembers}
                  teamLabel={rightLabel}
                  teamColor={rightColor}
                  currentShape={rightShape}
                  onShapeChange={(s) => changeShape(rightChangeTeam, s)}
                  myUserId={myUserId}
                  myCondition={myCondition}
                  onCycleCondition={cycleMyCondition}
                  quarters={quarters}
                  validIds={validIds}
                  availableIds={availableSet}
                  placedSet={placedSet}
                  teamOfPlayer={teamOfPlayer}
                  isIntra={isIntra}
                  readonly={readonly}
                  onTap={(id, placed) => {
                    if (readonly) return;
                    if (placed) unassignPlayer(id);
                    else placeByClick(id);
                  }}
                  onDragStart={(id) => setDraggingId(id)}
                  onDragEnd={() => setDraggingId(null)}
                  onReset={() => resetTeam(isIntra ? rightTeam : "A")}
                  onAutoPlace={() =>
                    autoPlaceTeam(isIntra ? rightTeam : "A")
                  }
                  matchLocked={matchLocked}
                  statByPlayer={statByPlayer}
                  canEditStats={canEditStats && showAll}
                  matchId={matchId}
                  winningTeam={optWinningTeam}
                  rosterTeam={isIntra ? rightTeam : null}
                  canWriteCoachComment={canWriteCoachComment}
                  matchDate={matchDate}
                  commentCountByPlayer={commentCountByPlayer}
                />
              </DesktopRosterPane>
            );
          })()}

        {/* 자체전 + 일반 회원 + 팀 미배정: 안내 (운동장은 위에 그대로 표시) */}
        {noTeamView && (
          <aside className="hidden desktop-lg:flex desktop:w-[280px] flex-col items-center justify-center text-center bg-white rounded-2xl border border-suaza-border p-6 gap-2">
            <span className="text-3xl">⏳</span>
            <h3 className="text-sm font-bold text-suaza-ink">
              팀 배정 대기 중
            </h3>
            <p className="text-xs text-suaza-ink-muted leading-relaxed">
              회장 또는 감독이 자체전 팀을 배정하면
              <br />
              여기에 우리 팀 명단이 표시됩니다.
            </p>
          </aside>
        )}
      </div>

      {/* 모바일 전용 선수 명단 (쿼터별 출전 현황) */}
      <PlayerRosterMobile
        members={attendingMembers}
        myUserId={myUserId}
        myCondition={myCondition}
        onCycleCondition={cycleMyCondition}
        quarters={quarters}
        validIds={validIds}
        availableIds={availableSet}
        placedSet={placedSet}
        teamOfPlayer={teamOfPlayer}
        teamByPlayer={teamByPlayer}
        isIntra={isIntra}
        readonly={readonly}
        showOnlyTeam={
          restrictedView && myTeam
            ? myTeam
            : fullAccess && isIntra && current.teamB && pitchView !== "all"
              ? pitchView
              : undefined
        }
        unassignedNotice={noTeamView}
        teamAName={teamAName}
        teamBName={teamBName}
        shapeA={current.shape}
        shapeB={current.teamB?.shape}
        onShapeChangeTeam={(team, s) => changeShape(team, s)}
        fullAccess={fullAccess}
        quarterTabs={quarters.map((q, i) => ({
          id: q.id,
          label: gameQuarters[i]?.label ?? q.id,
        }))}
        activeQuarterIdx={activeIdx}
        onQuarterChange={(i) => {
          setActiveIdx(i);
          setShowAll(false);
        }}
        includeAllTab={matchLocked}
        isAllActive={matchLocked && showAll}
        onAllClick={() => setShowAll(true)}
        matchLocked={matchLocked}
        statByPlayer={statByPlayer}
        canEditStats={canEditStats && showAll}
        matchId={matchId}
        winningTeam={optWinningTeam}
        canWriteCoachComment={canWriteCoachComment}
        matchDate={matchDate}
        commentCountByPlayer={commentCountByPlayer}
        onTap={(id: string, placed: boolean) => {
          if (readonly) return;
          if (placed) unassignPlayer(id);
          else placeByClick(id);
        }}
        onDragStart={(id: string) => setDraggingId(id)}
        onDragEnd={() => setDraggingId(null)}
        onResetTeam={(team) => resetTeam(team)}
        onAutoPlaceTeam={(team) => autoPlaceTeam(team)}
      />

      {/* 모바일 바텀시트 */}
      {openSlot != null && (
        <BottomSheet
          slot={
            openSlot.team === "A"
              ? slotsA[openSlot.idx]
              : slotsB[openSlot.idx]
          }
          members={
            isIntra
              ? attendingMembers.filter(
                  (m) => teamByPlayer[m.id] === openSlot.team,
                )
              : attendingMembers
          }
          placedSet={placedSet}
          availableIds={availableSet}
          currentPlayerId={
            openSlot.team === "A"
              ? current.assignments[openSlot.idx]
              : current.teamB?.assignments[openSlot.idx] ?? null
          }
          onClose={() => setOpenSlot(null)}
          onPick={(id) => assignSlot(openSlot.team, openSlot.idx, id)}
          onClear={() => assignSlot(openSlot.team, openSlot.idx, null)}
        />
      )}
    </div>
  );
}

type PitchTeam = {
  team: "A" | "B";
  slots: SlotDef[];
  assignments: (string | null)[];
};

function Pitch({
  teams,
  isIntra,
  tallContainer,
  byId,
  captainSet,
  myUserId,
  myCondition,
  readonly,
  teamAName = "A팀",
  teamBName = "B팀",
  compactWidth = false,
  draggingId,
  teamByPlayer = {},
  isIntraMatch = false,
  shapeA,
  shapeB,
  onSlotClick,
  onSlotDrop,
  onDragStart,
  onDragEnd,
  onSwapSlots,
  onUnassignSlot,
}: {
  teams: PitchTeam[];
  /** 현재 표시 모드 — 두 팀 동시 표시(true) / 단일 팀(false). 라벨/중앙선 등에 사용. */
  isIntra: boolean;
  /** 컨테이너 가로:세로 비율을 자체전 모드(3:5)로 강제. 단일 팀 표시 시에도
   *  운동장 크기를 일정하게 유지하기 위한 prop. 생략 시 isIntra 를 따른다. */
  tallContainer?: boolean;
  byId: Map<string, EditorMember>;
  captainSet: Set<string>;
  myUserId: string;
  myCondition: number;
  readonly: boolean;
  teamAName?: string;
  teamBName?: string;
  /** 데스크탑 임베드 — 양옆 명단이 넓어지도록 운동장 max-width 제한 */
  compactWidth?: boolean;
  /** 팀 라벨 옆에 함께 표기할 현재 쿼터 포메이션 shape (예: "4-2-3-1") */
  shapeA?: string;
  shapeB?: string;
  draggingId: string | null;
  /** 자체전 편성팀 매핑 — 다른 팀 슬롯 hover 시 ✕ 표시 판정 */
  teamByPlayer?: Record<string, "A" | "B" | null>;
  /** 매치 자체가 자체전인지(현재 표시 모드와 별개) */
  isIntraMatch?: boolean;
  onSlotClick: (team: "A" | "B", i: number) => void;
  onSlotDrop: (
    targetTeam: "A" | "B",
    targetIdx: number,
    playerId: string,
    sourceTeam?: "A" | "B",
    sourceIdx?: number,
  ) => void;
  onDragStart?: (playerId: string) => void;
  onDragEnd?: () => void;
  onSwapSlots: (
    sourceTeam: "A" | "B",
    sourceIdx: number,
    targetTeam: "A" | "B",
    targetIdx: number,
  ) => void;
  onUnassignSlot: (team: "A" | "B", i: number) => void;
}) {
  const pitchRef = useRef<HTMLDivElement | null>(null);
  const [hoverSlot, setHoverSlot] = useState<{
    team: "A" | "B";
    idx: number;
  } | null>(null);
  const [pitchDrag, setPitchDrag] = useState<{
    sourceTeam: "A" | "B";
    sourceIdx: number;
    playerId: string;
    role: SlotRole;
    x: number;
    y: number;
    targetTeam: "A" | "B" | null;
    targetIdx: number | null;
  } | null>(null);
  const isDropMode = !readonly && draggingId != null;
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    return () => {
      if (lpTimer.current) clearTimeout(lpTimer.current);
    };
  }, []);

  function findSlotFromPoint(
    x: number,
    y: number,
  ): { team: "A" | "B"; idx: number } | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    let cur: HTMLElement | null = el;
    while (cur) {
      const idxStr = cur.dataset?.slotIdx;
      const teamStr = cur.dataset?.slotTeam;
      if (idxStr != null && (teamStr === "A" || teamStr === "B")) {
        return { team: teamStr, idx: parseInt(idxStr, 10) };
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function startLongPress(
    team: "A" | "B",
    i: number,
    role: SlotRole,
    e: React.PointerEvent,
  ) {
    if (readonly) return;
    const t = teams.find((x) => x.team === team);
    const pid = t?.assignments[i];
    if (!pid) return;
    suppressClick.current = false;
    lpStart.current = { x: e.clientX, y: e.clientY };
    const target = e.currentTarget as HTMLElement;
    const ptrId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    if (lpTimer.current) clearTimeout(lpTimer.current);
    lpTimer.current = setTimeout(() => {
      setPitchDrag({
        sourceTeam: team,
        sourceIdx: i,
        playerId: pid,
        role,
        x: startX,
        y: startY,
        targetTeam: null,
        targetIdx: null,
      });
      try {
        target.setPointerCapture(ptrId);
      } catch {}
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(40);
        } catch {}
      }
    }, 450);
  }

  function cancelLongPress() {
    if (lpTimer.current) {
      clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  }

  function onSlotPointerMove(e: React.PointerEvent) {
    if (lpTimer.current && lpStart.current) {
      const dx = e.clientX - lpStart.current.x;
      const dy = e.clientY - lpStart.current.y;
      if (dx * dx + dy * dy > 100) cancelLongPress();
    }
    if (pitchDrag) {
      const t = findSlotFromPoint(e.clientX, e.clientY);
      const sameSlot =
        t != null &&
        t.team === pitchDrag.sourceTeam &&
        t.idx === pitchDrag.sourceIdx;
      setPitchDrag({
        ...pitchDrag,
        x: e.clientX,
        y: e.clientY,
        targetTeam: t && !sameSlot ? t.team : null,
        targetIdx: t && !sameSlot ? t.idx : null,
      });
    }
  }

  function onSlotPointerUp(e: React.PointerEvent) {
    if (pitchDrag) {
      if (pitchDrag.targetTeam != null && pitchDrag.targetIdx != null) {
        onSwapSlots(
          pitchDrag.sourceTeam,
          pitchDrag.sourceIdx,
          pitchDrag.targetTeam,
          pitchDrag.targetIdx,
        );
      } else {
        const rect = pitchRef.current?.getBoundingClientRect();
        const outside =
          !rect ||
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom;
        if (outside) onUnassignSlot(pitchDrag.sourceTeam, pitchDrag.sourceIdx);
      }
      setPitchDrag(null);
      suppressClick.current = true;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
    cancelLongPress();
  }

  function handleSlotClick(team: "A" | "B", i: number) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onSlotClick(team, i);
  }

  const compact = isIntra;

  return (
    <div
      ref={pitchRef}
      className={`relative w-full [container-type:size] ${
        (tallContainer ?? isIntra) ? "aspect-[3/5]" : "aspect-[3/4]"
      } desktop-lg:w-auto desktop-lg:h-full ${
        compactWidth
          ? (tallContainer ?? isIntra)
            ? "desktop-lg:max-w-[480px]"
            : "desktop-lg:max-w-[560px]"
          : ""
      } bg-gradient-to-b from-emerald-600 to-emerald-700 rounded-2xl overflow-hidden shadow-lg`}
    >
      {/* 잔디 줄무늬 */}
      <div className="absolute inset-0 opacity-20">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`absolute left-0 right-0 ${i % 2 === 0 ? "bg-white/30" : ""}`}
            style={{ top: `${(i * 100) / 8}%`, height: `${100 / 8}%` }}
          />
        ))}
      </div>

      {/* 필드 라인 */}
      <div className="absolute inset-3 border-2 border-white/60 rounded-md" />
      <div
        className={`absolute top-1/2 left-3 right-3 bg-white/60 ${
          isIntra ? "h-1" : "h-0.5"
        }`}
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-white/60" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/80" />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[55%] h-[10%] border-2 border-t-0 border-white/60 rounded-b-sm" />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[55%] h-[10%] border-2 border-b-0 border-white/60 rounded-t-sm" />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[28%] h-[4%] border-2 border-t-0 border-white/60" />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[28%] h-[4%] border-2 border-b-0 border-white/60" />

      {/* 팀 라벨 + 현재 쿼터 포메이션 정보 (자체전 양팀 / 자체전 단일팀 분기) */}
      {isIntra ? (
        <>
          <div className="absolute top-2 left-3 flex items-center gap-1">
            <div
              className="px-2 py-0.5 rounded-md text-[11px] font-bold text-white shadow-sm"
              style={{ backgroundColor: "#3B82F6" }}
            >
              {teamAName}
            </div>
            {shapeA && (
              <span className="px-1.5 py-0.5 rounded-md text-[11px] font-bold text-suaza-ink bg-white/95 shadow-sm">
                {shapeA}
              </span>
            )}
          </div>
          <div className="absolute bottom-2 left-3 flex items-center gap-1">
            <div
              className="px-2 py-0.5 rounded-md text-[11px] font-bold text-white shadow-sm"
              style={{ backgroundColor: "#EF4444" }}
            >
              {teamBName}
            </div>
            {shapeB && (
              <span className="px-1.5 py-0.5 rounded-md text-[11px] font-bold text-suaza-ink bg-white/95 shadow-sm">
                {shapeB}
              </span>
            )}
          </div>
        </>
      ) : (
        // 자체전 단일팀 선택(또는 상대전) — 좌상단에만 라벨 + 포메이션
        isIntraMatch &&
        teams[0] && (
          <div className="absolute top-2 left-3 flex items-center gap-1">
            <div
              className="px-2 py-0.5 rounded-md text-[11px] font-bold text-white shadow-sm"
              style={{
                backgroundColor: teams[0].team === "A" ? "#3B82F6" : "#EF4444",
              }}
            >
              {teams[0].team === "A" ? teamAName : teamBName}
            </div>
            {(teams[0].team === "A" ? shapeA : shapeB) && (
              <span className="px-1.5 py-0.5 rounded-md text-[11px] font-bold text-suaza-ink bg-white/95 shadow-sm">
                {teams[0].team === "A" ? shapeA : shapeB}
              </span>
            )}
          </div>
        )
      )}

      {/* 슬롯 — 모든 팀 */}
      {teams.flatMap((tf) =>
        tf.slots.map((s, i) => {
          const pid = tf.assignments[i];
          const player = pid ? byId.get(pid) : null;
          const isDragSource =
            pitchDrag?.sourceTeam === tf.team && pitchDrag?.sourceIdx === i;
          const isDragTarget =
            pitchDrag?.targetTeam === tf.team && pitchDrag?.targetIdx === i;
          const isHover =
            isDragTarget ||
            (hoverSlot?.team === tf.team && hoverSlot?.idx === i);
          const isEmpty = !player;
          // 자체전 — 드래그 중인 선수의 편성팀이 이 슬롯 팀과 다르면 배치 불가
          const draggedTeam =
            isIntraMatch && draggingId
              ? teamByPlayer[draggingId] ?? null
              : null;
          const pitchDraggedTeam =
            isIntraMatch && pitchDrag
              ? teamByPlayer[pitchDrag.playerId] ?? null
              : null;
          const invalidHover =
            isHover &&
            ((draggedTeam != null && draggedTeam !== tf.team) ||
              (pitchDraggedTeam != null && pitchDraggedTeam !== tf.team));
          const showDropHint = isDropMode && isEmpty && !invalidHover;
          const canDrag = !readonly && !!pid;
          return (
            <div
              key={`${tf.team}-${s.index}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 select-none ${
                isDragSource ? "opacity-30" : ""
              }`}
              style={{
                left: `${s.x * 100}%`,
                top: `${s.y * 100}%`,
                WebkitTouchCallout: "none",
                touchAction: pitchDrag ? "none" : "manipulation",
              }}
              draggable={canDrag}
              data-slot-idx={i}
              data-slot-team={tf.team}
              onPointerDown={(e) => startLongPress(tf.team, i, s.role, e)}
              onPointerMove={onSlotPointerMove}
              onPointerUp={onSlotPointerUp}
              onPointerCancel={onSlotPointerUp}
              onDragStart={(e) => {
                cancelLongPress();
                if (!canDrag || !pid) return;
                e.dataTransfer.setData("text/plain", pid);
                e.dataTransfer.setData(
                  "application/x-source-slot",
                  String(i),
                );
                e.dataTransfer.setData(
                  "application/x-source-team",
                  tf.team,
                );
                e.dataTransfer.effectAllowed = "move";
                onDragStart?.(pid);
              }}
              onDragEnd={() => {
                setHoverSlot(null);
                onDragEnd?.();
              }}
              onDragOver={(e) => {
                if (readonly || !draggingId) return;
                e.preventDefault();
                setHoverSlot({ team: tf.team, idx: i });
              }}
              onDragLeave={() => {
                if (hoverSlot?.team === tf.team && hoverSlot?.idx === i) {
                  setHoverSlot(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setHoverSlot(null);
                const id = e.dataTransfer.getData("text/plain") || draggingId;
                if (!id) return;
                // 자체전 — 다른 팀 슬롯엔 drop 불가 (시각 ✕ 표시와 함께 차단)
                if (isIntraMatch) {
                  const pt = teamByPlayer[id] ?? null;
                  if (pt && pt !== tf.team) return;
                }
                const sourceStr = e.dataTransfer.getData(
                  "application/x-source-slot",
                );
                const sourceTeamStr = e.dataTransfer.getData(
                  "application/x-source-team",
                );
                const sourceIdx = sourceStr
                  ? parseInt(sourceStr, 10)
                  : undefined;
                const sourceTeam =
                  sourceTeamStr === "A" || sourceTeamStr === "B"
                    ? sourceTeamStr
                    : undefined;
                onSlotDrop(tf.team, i, id, sourceTeam, sourceIdx);
              }}
            >
              <button
                type="button"
                disabled={readonly}
                onClick={() => handleSlotClick(tf.team, i)}
                className={`flex flex-col items-center gap-0.5 group ${
                  readonly ? "cursor-default" : "cursor-pointer"
                } ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                <span className="relative">
                  <PlayerCircle
                    player={player}
                    role={s.role}
                    label={s.label}
                    hovered={isHover && !invalidHover}
                    hint={showDropHint}
                    compact={compact}
                  />
                  {invalidHover && (
                    <span
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      aria-hidden
                    >
                      <span className="absolute inset-0 rounded-full bg-red-500/30 ring-2 ring-red-500" />
                      <svg
                        viewBox="0 0 24 24"
                        className="relative w-3/4 h-3/4 drop-shadow"
                        fill="none"
                        stroke="#EF4444"
                        strokeWidth="3"
                        strokeLinecap="round"
                      >
                        <path d="M6 6 L18 18 M18 6 L6 18" />
                      </svg>
                    </span>
                  )}
                </span>
                <span
                  className={`${
                    compact ? "text-[9px]" : "text-[11px] sm:text-xs"
                  } text-white font-medium drop-shadow whitespace-nowrap inline-flex items-center gap-0.5`}
                >
                  {player ? (
                    <>
                      {captainSet.has(player.id) && (
                        <span
                          className={`inline-flex items-center justify-center rounded-full bg-amber-400 text-amber-950 font-bold leading-none shrink-0 ${
                            compact
                              ? "w-3 h-3 text-[7px]"
                              : "w-3.5 h-3.5 text-[8px]"
                          }`}
                          aria-label="주장"
                          title="주장"
                        >
                          C
                        </span>
                      )}
                      <span className="max-w-[60px] truncate">
                        {player.name}
                      </span>
                      <ConditionArrow
                        level={
                          player.id === myUserId
                            ? myCondition
                            : player.condition ?? 3
                        }
                      />
                    </>
                  ) : (
                    <span className="text-white/70 max-w-[70px] truncate">
                      {s.label ?? s.role}
                    </span>
                  )}
                </span>
              </button>
            </div>
          );
        }),
      )}

      {/* 드래그 ghost — 손가락 따라옴 */}
      {pitchDrag && (
        <div
          className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-1/2 drop-shadow-xl"
          style={{ left: pitchDrag.x, top: pitchDrag.y }}
        >
          <PlayerCircle
            player={byId.get(pitchDrag.playerId)}
            role={pitchDrag.role}
            hovered
            hint={false}
            compact={compact}
          />
        </div>
      )}
    </div>
  );
}

function FormationChipRow({
  label,
  teamColor,
  currentShape,
  readonly,
  onChange,
}: {
  label: string | null;
  teamColor: string | null;
  currentShape: string;
  readonly: boolean;
  onChange: (shape: string) => void;
}) {
  // 감독/회장이 아닌 회원(readonly)에게는 현재 포메이션만 텍스트로 표기.
  if (readonly) {
    return (
      <div className="flex items-center gap-2 px-1">
        <span className="text-sm font-semibold text-suaza-ink">
          포메이션 <span className="text-suaza-button">{currentShape}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-1">
      {label && (
        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-suaza-ink">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: teamColor ?? undefined }}
          />
          {label}
        </span>
      )}
      <FormationDropdown
        currentShape={currentShape}
        onChange={onChange}
      />
    </div>
  );
}

function FormationDropdown({
  currentShape,
  onChange,
  fullWidth = false,
}: {
  currentShape: string;
  onChange: (shape: string) => void;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`relative ${fullWidth ? "flex w-full" : "inline-flex"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${
          fullWidth ? "flex w-full justify-between" : "inline-flex"
        } items-center gap-2 h-9 px-3 rounded-xl border text-xs font-semibold transition ${
          open
            ? "bg-suaza-button text-white border-suaza-button shadow-sm"
            : "bg-white text-suaza-ink border-suaza-border hover:border-suaza-ink-muted"
        }`}
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="font-bold tabular-nums">{currentShape}</span>
        </span>
        <span
          aria-hidden
          className={`text-[10px] leading-none transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>
      {open && (
        <>
          {/* 외부 클릭/터치로 닫기 */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            onTouchStart={() => setOpen(false)}
          />
          <div
            role="listbox"
            className={`absolute top-full left-0 mt-1 z-40 bg-white border border-suaza-border rounded-xl shadow-lg whitespace-nowrap max-h-[60vh] overflow-y-auto ${
              fullWidth
                ? "w-full"
                : "w-max min-w-[180px] max-w-[260px]"
            }`}
          >
            {FORMATIONS.map((f) => {
              const active = f.shape === currentShape;
              return (
                <button
                  key={f.shape}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(f.shape);
                    setOpen(false);
                  }}
                  className={`flex items-center justify-between gap-3 w-full px-3 py-2.5 text-left text-sm transition ${
                    active
                      ? "bg-red-50 text-suaza-accent font-bold"
                      : "text-suaza-ink hover:bg-gray-50"
                  }`}
                >
                  <span className="tabular-nums font-semibold">{f.shape}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SaveStatusBadge({
  status,
}: {
  status: "idle" | "saving" | "saved" | "error";
}) {
  if (status === "idle") return null;
  const map = {
    saving: { label: "저장 중...", cls: "bg-suaza-bg text-suaza-ink-muted" },
    saved: { label: "저장됨", cls: "bg-emerald-50 text-emerald-700" },
    error: { label: "저장 실패", cls: "bg-red-50 text-red-700" },
  } as const;
  const meta = map[status];
  return (
    <span
      className={`shrink-0 h-7 inline-flex items-center px-2.5 rounded-full text-[11px] font-medium ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

function PlayerCircle({
  player,
  role,
  label,
  hovered,
  hint,
  compact,
}: {
  player: EditorMember | null | undefined;
  role: SlotRole;
  label?: string;
  hovered: boolean;
  hint: boolean;
  compact?: boolean;
}) {
  const color = POSITION_COLOR[role];
  const text = label ?? role;
  const stateRing = hovered ? "ring-4 ring-white/60 scale-105" : "";
  // 경기장 크기에 비례(cqmin) + 상·하한(clamp). 자체전은 두 팀을 절반씩 욱여넣어
  // 세로 간격이 좁으므로 더 작은 비율 사용. (인라인 스타일로 확실히 적용)
  const dim = compact
    ? "clamp(24px, 5.5cqmin, 32px)"
    : "clamp(38px, 11cqmin, 50px)";
  const fontSize = compact
    ? "clamp(8px, 1.5cqmin, 10px)"
    : "clamp(9px, 2.6cqmin, 11px)";
  const sizeStyle = { width: dim, height: dim, fontSize };
  if (player) {
    return (
      <div
        className={`relative rounded-full bg-white border-[3px] flex items-center justify-center font-bold shadow-md transition ${stateRing}`}
        style={{ borderColor: color, ...sizeStyle }}
      >
        <span style={{ color }}>{text}</span>
      </div>
    );
  }
  return (
    <div
      className={`rounded-full border-2 border-dashed flex items-center justify-center transition group-hover:bg-white/10 ${stateRing} ${hint ? "animate-pulse" : ""}`}
      style={{ borderColor: color, backgroundColor: `${color}33`, ...sizeStyle }}
    >
      <span
        className="text-white/85 leading-none font-light"
        style={{
          fontSize: compact ? "clamp(13px, 3cqmin, 17px)" : "clamp(16px, 4cqmin, 22px)",
        }}
      >
        +
      </span>
    </div>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="이름/등번호 검색"
        className="w-full h-10 pl-9 pr-3 rounded-lg border border-suaza-border text-sm text-suaza-ink bg-white focus:outline-none focus:border-suaza-button"
      />
      <svg
        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-suaza-ink-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    </div>
  );
}

function FilterTabs({
  value,
  onChange,
}: {
  value: Filter;
  onChange: (v: Filter) => void;
}) {
  const items: { key: Filter; label: string }[] = [
    { key: "ALL", label: "전체" },
    ...POSITIONS.map((p) => ({ key: p as Filter, label: p })),
  ];
  return (
    <div className="flex gap-1">
      {items.map((it) => {
        const active = it.key === value;
        const color = it.key === "ALL" ? null : POSITION_COLOR[it.key];
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={`flex-1 h-8 rounded-md text-xs font-medium transition ${
              active
                ? "text-white shadow-sm"
                : "bg-suaza-bg text-suaza-ink-muted hover:text-suaza-ink"
            }`}
            style={active ? { backgroundColor: color ?? "#374151" } : undefined}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function PlayerList({
  members,
  placedSet,
  availableIds,
  filter,
  query,
  readonly,
  emptyText,
  onTap,
  onDragStart,
  onDragEnd,
}: {
  members: EditorMember[];
  placedSet: Set<string>;
  availableIds?: Set<string>;
  filter: Filter;
  query: string;
  readonly: boolean;
  emptyText?: string;
  onTap: (id: string, placed: boolean) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (filter !== "ALL") {
        if (!(m.positions ?? []).includes(filter)) return false;
      }
      if (!q) return true;
      const name = m.name.toLowerCase();
      const num = m.jersey_number != null ? String(m.jersey_number) : "";
      return name.includes(q) || num.includes(q);
    });
  }, [members, filter, query]);

  // 미배치 → 배치 순 정렬 (미배치 강조)
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ap = placedSet.has(a.id) ? 1 : 0;
      const bp = placedSet.has(b.id) ? 1 : 0;
      if (ap !== bp) return ap - bp;
      const an = a.jersey_number ?? 9999;
      const bn = b.jersey_number ?? 9999;
      return an - bn;
    });
  }, [filtered, placedSet]);

  return (
    <div className="flex flex-col gap-1">
      {sorted.length === 0 && (
        <p className="py-6 text-center text-sm text-suaza-ink-muted">
          {emptyText ?? "해당 조건의 선수가 없습니다"}
        </p>
      )}
      {sorted.map((m) => {
        const placed = placedSet.has(m.id);
        const disabled = availableIds ? !availableIds.has(m.id) && !placed : false;
        return (
          <div
            key={m.id}
            draggable={!readonly && !placed && !disabled}
            onDragStart={(e) => {
              if (disabled) {
                e.preventDefault();
                return;
              }
              e.dataTransfer.setData("text/plain", m.id);
              e.dataTransfer.effectAllowed = "move";
              onDragStart?.(m.id);
            }}
            onDragEnd={() => onDragEnd?.()}
            onClick={() => !disabled && onTap(m.id, placed)}
            className={`flex items-center gap-2 px-2 py-2 rounded-lg select-none transition ${
              readonly || disabled ? "cursor-default" : "cursor-pointer"
            } ${
              disabled
                ? "bg-white opacity-50"
                : placed
                  ? "bg-suaza-bg/70 opacity-60 hover:opacity-100"
                  : "bg-white hover:bg-suaza-bg"
            }`}
          >
            <div className="relative shrink-0">
              <PlayerAvatar member={m} dimmed={placed || disabled} />
              {placed && (
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-white">
                  ✓
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {m.jersey_number != null && (
                  <span className="text-[11px] font-mono text-suaza-ink-muted">
                    #{m.jersey_number}
                  </span>
                )}
                <span
                  className={`text-sm font-medium truncate ${
                    placed
                      ? "text-suaza-ink-muted line-through decoration-suaza-ink-muted/40"
                      : "text-suaza-ink"
                  }`}
                >
                  {m.name}
                </span>
                <FootBadge foot={m.preferred_foot} />
                <ConditionArrow level={m.condition ?? 3} />
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                {(m.positions ?? []).slice(0, 3).map((p) => (
                  <span
                    key={p}
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white"
                    style={{
                      backgroundColor: POSITION_COLOR[p],
                      opacity: placed ? 0.7 : 1,
                    }}
                  >
                    {p}
                  </span>
                ))}
                {m.title && m.title !== "player" && (
                  <span className="text-[10px] text-suaza-ink-muted">
                    {TITLE_SHORT[m.title]}
                  </span>
                )}
              </div>
            </div>
            {!disabled && placed && (
              <span className="shrink-0 text-[10px] text-emerald-700 font-semibold px-2 py-0.5 rounded-full bg-emerald-100">
                배치됨
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlayerAvatar({
  member,
  dimmed,
}: {
  member: EditorMember;
  dimmed?: boolean;
}) {
  const cls = `w-9 h-9 rounded-full object-cover bg-suaza-bg ${
    dimmed ? "grayscale" : ""
  }`;
  if (member.avatar_url) {
    return (
      <Image
        src={member.avatar_url}
        alt={member.name}
        width={36}
        height={36}
        className={cls}
      />
    );
  }
  return (
    <div
      className={`w-9 h-9 rounded-full bg-suaza-bg flex items-center justify-center text-xs font-semibold text-suaza-ink-muted ${
        dimmed ? "opacity-70" : ""
      }`}
    >
      {member.name.slice(0, 1)}
    </div>
  );
}

type PlayerParticipation = {
  member: EditorMember;
  byQuarter: (Position | null)[];
  totalPlayed: number;
  positionsPlayed: Position[];
  hasPositionChange: boolean;
};

type QuarterWithTeams = {
  id: string;
  shape: string;
  assignments: (string | null)[];
  teamB?: TeamFormation;
};

function computeParticipations(
  members: EditorMember[],
  quarters: QuarterWithTeams[],
): PlayerParticipation[] {
  return members.map((m) => {
    const byQuarter: (Position | null)[] = quarters.map((q) => {
      // A팀에서 찾기
      const aIdx = q.assignments.indexOf(m.id);
      if (aIdx >= 0) {
        const slots = buildSlots(q.shape);
        return (slots[aIdx]?.role as Position) ?? null;
      }
      // B팀에서 찾기 (자체전)
      if (q.teamB) {
        const bIdx = q.teamB.assignments.indexOf(m.id);
        if (bIdx >= 0) {
          const slots = buildSlots(q.teamB.shape);
          return (slots[bIdx]?.role as Position) ?? null;
        }
      }
      return null;
    });
    const seen = new Set<Position>();
    const positionsPlayed: Position[] = [];
    for (const p of byQuarter) {
      if (p && !seen.has(p)) {
        seen.add(p);
        positionsPlayed.push(p);
      }
    }
    return {
      member: m,
      byQuarter,
      totalPlayed: byQuarter.filter((p): p is Position => p != null).length,
      positionsPlayed,
      hasPositionChange: positionsPlayed.length > 1,
    };
  });
}

function FilterTabsWithCounts({
  value,
  onChange,
  counts,
  keys,
}: {
  value: Filter;
  onChange: (v: Filter) => void;
  counts: Record<Filter, number>;
  keys?: Filter[];
}) {
  const allItems: { key: Filter; label: string }[] = [
    { key: "ALL", label: "전체" },
    ...POSITIONS.map((p) => ({ key: p as Filter, label: p })),
  ];
  const items = keys
    ? allItems.filter((it) => keys.includes(it.key))
    : allItems;
  return (
    <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
      {items.map((it) => {
        const active = it.key === value;
        const color = it.key === "ALL" ? "#1F2937" : POSITION_COLOR[it.key];
        const cnt = counts[it.key] ?? 0;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={`shrink-0 inline-flex items-center gap-1 h-[22px] px-[6px] rounded-full text-[10px] font-semibold transition ${
              active
                ? "text-white shadow-sm"
                : "bg-white border border-suaza-border text-suaza-ink hover:bg-suaza-bg"
            }`}
            style={active ? { backgroundColor: color } : undefined}
          >
            {it.key !== "ALL" && (
              <span
                className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white/80" : ""}`}
                style={!active ? { backgroundColor: color } : undefined}
              />
            )}
            <span>{it.label}</span>
            <span className={active ? "text-white/80" : "text-suaza-ink-muted"}>
              {cnt}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TeamMiniActions({
  onReset,
  onAutoPlace,
  disabled = false,
  disabledTitle,
}: {
  onReset: () => void;
  onAutoPlace: () => void;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  return (
    <span className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onReset}
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
        className="h-6 px-2 rounded-md border border-suaza-border text-[10px] font-medium text-suaza-ink bg-white hover:bg-suaza-bg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
      >
        초기화
      </button>
      <button
        type="button"
        onClick={onAutoPlace}
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
        className="h-6 px-2 rounded-md bg-suaza-button text-white text-[10px] font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
      >
        자동
      </button>
    </span>
  );
}

// 운동장 위 팀 라벨 옆 — 승/무/패 토글. 회장·감독·매니저만 사용 가능.
// 비활성(canEdit=false) 시에도 현재 결과(승/무/패)는 작은 칩으로 표시.
function WinnerToggle({
  team,
  winningTeam,
  onChange,
  canEdit,
}: {
  team: "A" | "B";
  winningTeam: "A" | "B" | null;
  onChange: (next: "A" | "B" | null) => void;
  canEdit: boolean;
}) {
  // 이 팀 입장에서의 결과 — 승/무/패
  const myResult: "W" | "D" | "L" =
    winningTeam == null ? "D" : winningTeam === team ? "W" : "L";
  const order: ("W" | "D" | "L")[] = ["D", "W", "L"];
  const cycle = () => {
    if (!canEdit) return;
    const idx = order.indexOf(myResult);
    const nextResult = order[(idx + 1) % order.length];
    const nextWinner: "A" | "B" | null =
      nextResult === "W"
        ? team
        : nextResult === "L"
          ? team === "A"
            ? "B"
            : "A"
          : null;
    onChange(nextWinner);
  };
  const styleByResult: Record<
    "W" | "D" | "L",
    { bg: string; fg: string; label: string }
  > = {
    W: { bg: "#22C55E", fg: "#FFFFFF", label: "승" },
    D: { bg: "#9CA3AF", fg: "#FFFFFF", label: "무" },
    L: { bg: "#EF4444", fg: "#FFFFFF", label: "패" },
  };
  const s = styleByResult[myResult];
  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={cycle}
      className={`inline-flex items-center justify-center w-7 h-5 rounded-md text-[11px] font-bold leading-none shadow-sm transition ${
        canEdit ? "hover:opacity-90 cursor-pointer" : "cursor-default"
      }`}
      style={{ backgroundColor: s.bg, color: s.fg }}
      title={
        canEdit
          ? `${s.label} — 클릭으로 무 → 승 → 패 순환`
          : `결과: ${s.label}`
      }
      aria-label={`${team}팀 결과 ${s.label}`}
    >
      {s.label}
    </button>
  );
}

// 부심 깃발 — 깃대(검정) + 깃발(노랑 + 빨강 격자 4칸). 심판 항목/시즌왕 배지에 사용.
function LinesmanFlag({
  size = 12,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`inline-block align-middle ${className}`}
      aria-hidden
    >
      {/* 깃대 */}
      <rect x="3" y="2" width="1.6" height="20" rx="0.5" fill="#1F2937" />
      {/* 깃발 — 노/빨 2x2 격자 */}
      <rect x="4.6" y="3" width="7" height="6" fill="#FACC15" />
      <rect x="11.6" y="3" width="7" height="6" fill="#EF4444" />
      <rect x="4.6" y="9" width="7" height="6" fill="#EF4444" />
      <rect x="11.6" y="9" width="7" height="6" fill="#FACC15" />
      {/* 깃발 테두리 */}
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

// 회장·감독 자체전 전용 — 운동장 보기 모드 토글(A팀 / 전체 / B팀)
function PitchViewToggle({
  value,
  onChange,
  teamAName,
  teamBName,
}: {
  value: "all" | "A" | "B";
  onChange: (v: "all" | "A" | "B") => void;
  teamAName: string;
  teamBName: string;
}) {
  const opts: { key: "A" | "all" | "B"; label: string }[] = [
    { key: "A", label: teamAName },
    { key: "all", label: "전체" },
    { key: "B", label: teamBName },
  ];
  return (
    <div className="inline-flex items-center rounded-full border border-suaza-border bg-white p-0.5 shadow-sm">
      {opts.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`min-w-[56px] h-7 px-3 rounded-full text-xs font-semibold transition ${
              active
                ? "bg-suaza-button text-white shadow-sm"
                : "text-suaza-ink-muted hover:text-suaza-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// 데스크탑 명단 카드 wrapper — 상단에 쿼터 탭 리본을 붙일 수 있다.
//   includeAllTab=true 면 맨 앞에 "ALL" 탭이 추가됨 (종료 경기 임베드 전용).
//   isAllActive 가 true 면 ALL 강조, 그 외는 activeRibbonIdx 로 활성 쿼터 강조.
function DesktopRosterPane({
  showRibbon,
  ribbonTabs,
  activeRibbonIdx,
  onRibbonChange,
  includeAllTab = false,
  isAllActive = false,
  onAllClick,
  wideMode = false,
  children,
}: {
  showRibbon: boolean;
  ribbonTabs: { id: string; label: string }[];
  activeRibbonIdx: number;
  onRibbonChange: (idx: number) => void;
  includeAllTab?: boolean;
  isAllActive?: boolean;
  onAllClick?: () => void;
  /** 임베드 — 양옆 명단을 잔여 폭만큼 넓힘. 진행 중 경기는 기존 280px 고정 */
  wideMode?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`hidden desktop-lg:flex flex-col min-h-0 ${
        wideMode
          ? "desktop:flex-1 desktop:min-w-[280px]"
          : "desktop:w-[280px] desktop:shrink-0"
      }`}
    >
      {showRibbon && ribbonTabs.length > 0 && (
        <div className="overflow-x-auto -mb-px">
          <div className="flex gap-1 px-3 w-max">
            {includeAllTab && (
              <button
                key="ALL"
                type="button"
                onClick={() => onAllClick?.()}
                className={`shrink-0 min-w-[36px] h-8 px-2 rounded-t-lg text-xs font-bold transition border-x border-t ${
                  isAllActive
                    ? "bg-white border-suaza-border text-suaza-button"
                    : "bg-suaza-bg border-transparent text-suaza-ink-muted hover:text-suaza-ink"
                }`}
              >
                ALL
              </button>
            )}
            {ribbonTabs.map((q, i) => {
              const active = !isAllActive && i === activeRibbonIdx;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onRibbonChange(i)}
                  className={`shrink-0 min-w-[36px] h-8 px-2 rounded-t-lg text-xs font-bold transition border-x border-t ${
                    active
                      ? "bg-white border-suaza-border text-suaza-button"
                      : "bg-suaza-bg border-transparent text-suaza-ink-muted hover:text-suaza-ink"
                  }`}
                >
                  {q.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <aside className="flex-1 flex flex-col bg-white rounded-2xl border border-suaza-border p-4 gap-3 min-h-0">
        {children}
      </aside>
    </div>
  );
}

function PlayerRosterMobile({
  members,
  quarters,
  validIds,
  availableIds,
  placedSet,
  teamOfPlayer,
  isIntra,
  readonly,
  onTap,
  onDragStart,
  onDragEnd,
  teamByPlayer = {},
  onResetTeam,
  onAutoPlaceTeam,
  myUserId,
  myCondition,
  onCycleCondition,
  showOnlyTeam,
  unassignedNotice,
  teamAName = "A팀",
  teamBName = "B팀",
  shapeA,
  shapeB,
  onShapeChangeTeam,
  fullAccess = false,
  quarterTabs,
  activeQuarterIdx,
  onQuarterChange,
  includeAllTab = false,
  isAllActive = false,
  onAllClick,
  matchLocked = false,
  statByPlayer,
  canEditStats = false,
  matchId,
  winningTeam = null,
  canWriteCoachComment = false,
  matchDate = null,
  commentCountByPlayer = {},
}: {
  members: EditorMember[];
  quarters: QuarterWithTeams[];
  validIds: Set<string>;
  availableIds: Set<string>;
  placedSet: Set<string>;
  teamOfPlayer: Map<string, "A" | "B">;
  isIntra: boolean;
  readonly: boolean;
  onTap: (id: string, placed: boolean) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  teamByPlayer?: Record<string, "A" | "B" | null>;
  onResetTeam?: (team: "A" | "B") => void;
  onAutoPlaceTeam?: (team: "A" | "B") => void;
  myUserId: string;
  myCondition: number;
  onCycleCondition: () => void;
  /** 자체전 일반 회원이 본인 팀(A 또는 B)만 볼 때 지정 */
  showOnlyTeam?: "A" | "B";
  /** 자체전 일반 회원이 팀 미배정일 때 안내만 표시 */
  unassignedNotice?: boolean;
  /** 자체전 팀 표시명 */
  teamAName?: string;
  teamBName?: string;
  /** A팀 현재 포메이션 (자체전 양팀/팀별 보기 헤더에 드롭다운 노출) */
  shapeA?: string;
  /** B팀 현재 포메이션 (자체전 한정) */
  shapeB?: string;
  /** 팀별 포메이션 변경 콜백 */
  onShapeChangeTeam?: (team: "A" | "B", shape: string) => void;
  /** 회장·감독(양 팀 편집) 여부 — true 면 명단 카드 위 쿼터 탭 숨김 (운동장 위 탭 사용) */
  fullAccess?: boolean;
  /** 회장·감독 외(코치·주장·일반)용 — 선수명단 카드 상단에 쿼터 탭 노출 */
  quarterTabs?: { id: string; label: string }[];
  activeQuarterIdx?: number;
  onQuarterChange?: (idx: number) => void;
  /** 종료 경기 임베드 — 맨 앞 "ALL" 탭 추가 */
  includeAllTab?: boolean;
  isAllActive?: boolean;
  onAllClick?: () => void;
  /** 종료/취소된 경기 — 초기화·자동 비활성 */
  matchLocked?: boolean;
  /** 종료 경기 임베드 — 카드별 통계/포인트/기록 입력 */
  statByPlayer?: Record<string, PlayerStat>;
  canEditStats?: boolean;
  matchId?: string;
  winningTeam?: "A" | "B" | null;
  /** 감독·코치 코멘트 작성 권한 (title=head_coach/coach) */
  canWriteCoachComment?: boolean;
  matchDate?: string | null;
  commentCountByPlayer?: Record<string, number>;
}) {
  const participations = useMemo(
    () => computeParticipations(members, quarters),
    [members, quarters],
  );
  // 멤버 부분집합 기준 통계(총원/출전/평균쿼터). 자체전이면 각 팀별로 따로 계산.
  const calcStats = (parts: PlayerParticipation[]) => {
    const total = parts.length;
    const played = parts.filter((p) => p.totalPlayed > 0).length;
    const sumQ = parts.reduce((s, p) => s + p.totalPlayed, 0);
    const avg = played > 0 ? (sumQ / played).toFixed(1) : "0.0";
    return { total, played, avg };
  };
  const totalStats = calcStats(participations);

  const sorted = useMemo(() => {
    // 가나다순 정렬
    return [...participations].sort((a, b) =>
      a.member.name.localeCompare(b.member.name, "ko"),
    );
  }, [participations]);

  if (unassignedNotice) {
    return (
      <div className="desktop-lg:hidden flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-suaza-border p-6 gap-2">
        <span className="text-3xl">⏳</span>
        <h3 className="text-sm font-bold text-suaza-ink">팀 배정 대기 중</h3>
        <p className="text-xs text-suaza-ink-muted leading-relaxed">
          회장 또는 감독이 자체전 팀을 배정하면
          <br />
          여기에 우리 팀 명단이 표시됩니다.
        </p>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="desktop-lg:hidden rounded-2xl border border-dashed border-suaza-border p-5 text-center text-sm text-suaza-ink-muted">
        참석으로 표시된 선수가 없습니다
      </div>
    );
  }

  const renderCard = (p: PlayerParticipation) => (
    <DesktopPlayerCard
      key={p.member.id}
      participation={p}
      placed={placedSet.has(p.member.id)}
      available={availableIds.has(p.member.id)}
      team={
        isIntra
          ? teamByPlayer[p.member.id] ?? teamOfPlayer.get(p.member.id)
          : undefined
      }
      readonly={readonly}
      onTap={onTap}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      isMe={p.member.id === myUserId}
      conditionLevel={
        p.member.id === myUserId ? myCondition : p.member.condition ?? 3
      }
      onCycleCondition={onCycleCondition}
      stat={statByPlayer?.[p.member.id]}
      canEditStats={canEditStats}
      matchId={matchId}
      winningTeam={winningTeam}
      canWriteCoachComment={canWriteCoachComment}
      matchDate={matchDate}
      hasComment={(commentCountByPlayer[p.member.id] ?? 0) > 0}
      // 모바일에서 양 팀(A/B) 두 컬럼이 동시에 보일 때는 카드 폭이 좁아 부포지션이
      // 두번째 줄로 빠지며 카드 높이가 들쭉날쭉해진다. 그 경우엔 주포지션만 표시.
      showOnlyPrimaryPosition={isIntra && !showOnlyTeam}
    />
  );

  // 자체전: 편성팀 기준 A/B 좌우 컬럼으로 분리
  const teamACards = sorted.filter((p) => teamByPlayer[p.member.id] === "A");
  const teamBCards = sorted.filter((p) => teamByPlayer[p.member.id] === "B");
  const teamAStats = calcStats(teamACards);
  const teamBStats = calcStats(teamBCards);
  // 상단 요약 — 상대전 또는 본인 팀만 보기일 때만 표시.
  // 매니저 자체전(양팀)에서는 컬럼 헤더에 팀별 통계를 표시하므로 상단 요약 생략.
  const summaryStats = !isIntra
    ? totalStats
    : showOnlyTeam === "A"
      ? teamAStats
      : showOnlyTeam === "B"
        ? teamBStats
        : null;

  return (
    <div className="desktop-lg:hidden flex flex-col">
      {/* 쿼터 탭 리본 — 카드 상단에 폴더탭처럼 붙음 (모든 사용자).
          종료 경기는 맨 앞에 "ALL" 탭(전체 합계 기록 보기) 추가. */}
      {quarterTabs && quarterTabs.length > 0 && (
        <div className="overflow-x-auto -mb-px">
          <div className="flex gap-1 px-3 w-max">
            {includeAllTab && (
              <button
                key="ALL"
                type="button"
                onClick={() => onAllClick?.()}
                className={`shrink-0 min-w-[32px] h-7 px-2 rounded-t-lg text-xs font-bold transition border-x border-t ${
                  isAllActive
                    ? "bg-white border-suaza-border text-suaza-button"
                    : "bg-suaza-bg border-transparent text-suaza-ink-muted hover:text-suaza-ink"
                }`}
              >
                ALL
              </button>
            )}
            {quarterTabs.map((q, i) => {
              const active = !isAllActive && i === activeQuarterIdx;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onQuarterChange?.(i)}
                  className={`shrink-0 min-w-[32px] h-7 px-2 rounded-t-lg text-xs font-bold transition border-x border-t ${
                    active
                      ? "bg-white border-suaza-border text-suaza-button"
                      : "bg-suaza-bg border-transparent text-suaza-ink-muted hover:text-suaza-ink"
                  }`}
                >
                  {q.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3 rounded-2xl bg-white border border-suaza-border p-4">
        <div>
        <h3 className="text-base font-bold text-suaza-ink">
          {matchLocked ? "출전선수" : "선수명단"}
        </h3>
        {summaryStats && !matchLocked && (
          <p className="text-xs text-suaza-ink-muted mt-0.5">
            총 {summaryStats.total}명 · 출전 {summaryStats.played}명 · 평균{" "}
            {summaryStats.avg}쿼터
          </p>
        )}
      </div>
      {isIntra ? (
        showOnlyTeam ? (
          // 본인 팀만 표시 — 단일 컬럼, zip 불필요
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-suaza-ink">
                {showOnlyTeam === "A" ? teamAName : teamBName}{" "}
                <span className="text-xs text-suaza-ink-muted font-normal">
                  {(showOnlyTeam === "A" ? teamACards : teamBCards).length}
                </span>
              </span>
              {!readonly && !matchLocked && (
                <TeamMiniActions
                  onReset={() => onResetTeam?.(showOnlyTeam)}
                  onAutoPlace={() => onAutoPlaceTeam?.(showOnlyTeam)}
                />
              )}
            </div>
            {/* 포메이션 드롭다운 — 진행 중 경기에서만 표시. 종료 경기는 숨김. */}
            {(showOnlyTeam === "A" ? shapeA : shapeB) &&
              !matchLocked &&
              !readonly && (
                <FormationDropdown
                  currentShape={
                    (showOnlyTeam === "A" ? shapeA : shapeB) as string
                  }
                  onChange={(s) => onShapeChangeTeam?.(showOnlyTeam, s)}
                  fullWidth
                />
              )}
            {(showOnlyTeam === "A" ? teamACards : teamBCards).map(renderCard)}
          </div>
        ) : (
          // A/B 양 팀을 한 grid 에 zip 배치 — 두 카드가 한 row 를 공유해
          // 카드 높이 차이가 누적되지 않도록 행 정렬을 grid 에 맡긴다.
          <div className="grid grid-cols-2 gap-2 items-start">
            {/* 헤더: 같은 grid 의 첫 두 셀로 배치해야 카드와 컬럼 폭이 일치 */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-1">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-suaza-ink">
                  {teamAName}{" "}
                  <span className="text-xs text-suaza-ink-muted font-normal">
                    {teamACards.length}
                  </span>
                </span>
                {!readonly && !matchLocked && (
                  <TeamMiniActions
                    onReset={() => onResetTeam?.("A")}
                    onAutoPlace={() => onAutoPlaceTeam?.("A")}
                  />
                )}
              </div>
              {!matchLocked && (
                <p className="text-[11px] text-suaza-ink-muted">
                  출전 {teamAStats.played}명 · 평균 {teamAStats.avg}쿼터
                </p>
              )}
              {shapeA && !matchLocked && !readonly && (
                <FormationDropdown
                  currentShape={shapeA}
                  onChange={(s) => onShapeChangeTeam?.("A", s)}
                  fullWidth
                />
              )}
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-1">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-suaza-ink">
                  {teamBName}{" "}
                  <span className="text-xs text-suaza-ink-muted font-normal">
                    {teamBCards.length}
                  </span>
                </span>
                {!readonly && !matchLocked && (
                  <TeamMiniActions
                    onReset={() => onResetTeam?.("B")}
                    onAutoPlace={() => onAutoPlaceTeam?.("B")}
                  />
                )}
              </div>
              {!matchLocked && (
                <p className="text-[11px] text-suaza-ink-muted">
                  출전 {teamBStats.played}명 · 평균 {teamBStats.avg}쿼터
                </p>
              )}
              {shapeB && !matchLocked && !readonly && (
                <FormationDropdown
                  currentShape={shapeB}
                  onChange={(s) => onShapeChangeTeam?.("B", s)}
                  fullWidth
                />
              )}
            </div>
            {/* zip: 행 i 의 두 셀 = (A[i], B[i]). 한쪽이 짧으면 빈 칸으로 채움 */}
            {Array.from({
              length: Math.max(teamACards.length, teamBCards.length),
            }).flatMap((_, i) => [
              teamACards[i] ? (
                renderCard(teamACards[i])
              ) : (
                <div key={`A-empty-${i}`} aria-hidden />
              ),
              teamBCards[i] ? (
                renderCard(teamBCards[i])
              ) : (
                <div key={`B-empty-${i}`} aria-hidden />
              ),
            ])}
          </div>
        )
      ) : (
        <>
          {/* 상대전 — 헤더: 초기화/자동 + 포메이션 드롭다운 */}
          <div className="flex flex-col gap-2">
            {!readonly && !matchLocked && (
              <div className="flex items-center justify-end">
                <TeamMiniActions
                  onReset={() => onResetTeam?.("A")}
                  onAutoPlace={() => onAutoPlaceTeam?.("A")}
                />
              </div>
            )}
            {shapeA && !matchLocked && !readonly && (
              <FormationDropdown
                currentShape={shapeA}
                onChange={(s) => onShapeChangeTeam?.("A", s)}
                fullWidth
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">{sorted.map(renderCard)}</div>
        </>
      )}
      </div>
    </div>
  );
}

function PlayerRowMobile({
  participation,
  placed,
  available = true,
  team,
  readonly,
  onTap,
  onDragStart,
  onDragEnd,
  isMe,
  conditionLevel,
  onCycleCondition,
  stat,
  canEditStats = false,
  matchId,
  winningTeam = null,
  canWriteCoachComment = false,
  matchDate = null,
  hasComment = false,
}: {
  participation: PlayerParticipation;
  placed: boolean;
  available?: boolean;
  team?: "A" | "B";
  readonly: boolean;
  onTap: (id: string, placed: boolean) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  isMe: boolean;
  conditionLevel: number;
  onCycleCondition: () => void;
  /** 종료 경기 임베드 — 이번 경기 기록(있으면 포인트 + 입력 UI 노출) */
  stat?: PlayerStat;
  canEditStats?: boolean;
  matchId?: string;
  winningTeam?: "A" | "B" | null;
  /** 감독·코치 코멘트 작성 권한 (title=head_coach/coach) */
  canWriteCoachComment?: boolean;
  matchDate?: string | null;
  /** 이 선수에 대해 (이 경기) 코멘트가 한 건이라도 있는지 */
  hasComment?: boolean;
}) {
  const m = participation.member;
  const memberPositions = m.positions ?? [];
  const hasPlayed = participation.totalPlayed > 0;
  // 현재 쿼터에 참여하지 않는 선수 — 배치 불가, 비활성 표시 (단, 이미 배치돼 있으면 평소대로)
  const disabled = !available && !placed;

  // 현재 쿼터 배치(placed) 강조 — A팀 파랑 / B팀 빨강 / 상대전 초록
  const highlight = placed
    ? team === "A"
      ? { borderColor: "#3B82F6", backgroundColor: "rgba(59,130,246,0.06)" }
      : team === "B"
        ? { borderColor: "#EF4444", backgroundColor: "rgba(239,68,68,0.06)" }
        : { borderColor: "#22C55E", backgroundColor: "rgba(34,197,94,0.06)" }
    : undefined;

  // MOM 활성 여부 — 낙관적 (서버 응답 전 즉시 반영). stat 변경 시 동기화.
  const [momActive, setMomActive] = useState((stat?.mom ?? 0) > 0);
  const [, startMomTransition] = useTransition();
  useEffect(() => {
    setMomActive((stat?.mom ?? 0) > 0);
  }, [stat?.mom]);

  // 카드 본체(이름 줄) — 종료 경기 임베드에서는 클릭/드래그가 의미 없으므로 비활성.
  // stat 이 있으면 wrapper 가 테두리/배경을 담당하므로 본체는 border-0/투명.
  const lockedForRecord = !!stat;
  const cardBody = (
    <div
      style={{
        touchAction: "manipulation",
        ...(stat
          ? // 임베드 — 본체는 wrapper 안쪽이라 색만 살짝, 테두리 없음
            placed && highlight
            ? { backgroundColor: highlight.backgroundColor }
            : undefined
          : highlight),
      }}
      draggable={!readonly && !disabled && !lockedForRecord}
      onDragStart={(e) => {
        if (disabled || lockedForRecord) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/plain", m.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.(m.id);
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={() =>
        !readonly && !disabled && !lockedForRecord && onTap(m.id, placed)
      }
      className={`flex items-center gap-2.5 px-3 py-2.5 select-none transition ${
        stat
          ? "rounded-t-xl bg-white/0"
          : `rounded-xl bg-white border-2 ${placed ? "" : "border-suaza-border"}`
      } ${
        readonly || disabled || lockedForRecord
          ? "cursor-default"
          : "cursor-pointer"
      } ${disabled ? "opacity-50" : !hasPlayed && !placed ? "opacity-80" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 종료 경기 임베드(stat 있음)에서는 컨디션·주발 숨김 */}
          {!stat && (
            <ConditionArrow
              level={conditionLevel}
              interactive={isMe}
              onCycle={onCycleCondition}
            />
          )}
          <PlayerName
            name={m.name}
            className="text-sm font-semibold text-suaza-ink"
            allowDropSurname={false}
          />
          {!stat && <FootBadge foot={m.preferred_foot} />}
          {memberPositions.length === 0 ? (
            <span className="text-[10px] text-suaza-ink-faint">미설정</span>
          ) : (
            memberPositions.map((pos) => (
              <span
                key={pos}
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold"
                style={{ color: POSITION_COLOR[pos] }}
              >
                {pos}
              </span>
            ))
          )}
          {/* 종료 경기 임베드 — 포지션 옆 출석/승리/MOM 배지.
              · 출석: 명단에 표시되는 선수는 모두 출석 → 항상 활성(초록)
              · 승리: winningTeam 과 본인 team 이 같을 때만 활성(주황)
              · MOM:  stat.mom > 0 이면 활성(노랑). 회장·감독·매니저만 토글 가능 */}
          {stat && (
            <span className="inline-flex items-center gap-1 ml-auto">
              <StatusPill label="출" tone="success" active />
              {!!team &&
              winningTeam != null &&
              winningTeam !== team ? (
                <StatusPill label="패" tone="lose" active />
              ) : (
                <StatusPill
                  label="승"
                  tone="win"
                  active={!!team && winningTeam === team}
                />
              )}
              <StatusPill
                label="M"
                tone="mom"
                active={momActive}
                disabled={!canEditStats}
                onClick={
                  canEditStats && matchId
                    ? () => {
                        const next = !momActive;
                        setMomActive(next);
                        startMomTransition(() => {
                          setMomForPlayer(matchId, m.id, next);
                        });
                      }
                    : undefined
                }
              />
              {(canWriteCoachComment || isMe) && matchId && (
                <CoachCommentButton
                  memberId={m.id}
                  memberName={m.name}
                  matchId={matchId}
                  matchDate={matchDate}
                  hasComment={hasComment}
                  readonly={!canWriteCoachComment}
                />
              )}
            </span>
          )}
        </div>
      </div>

      {stat ? (
        <span
          className="shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white bg-suaza-accent"
          title="이번 경기 획득 포인트"
        >
          {stat.points}P
        </span>
      ) : (
        <QuarterBar byQuarter={participation.byQuarter} />
      )}
    </div>
  );

  if (!stat) return cardBody;

  // 종료 경기 임베드 — wrapper 가 전체 카드 테두리/색을 담당해 placed 강조선이
  // 카드 끝까지 끊김 없이 둘리도록 한다.
  const wrapperStyle = placed && highlight ? { borderColor: highlight.borderColor } : undefined;
  return (
    <div
      className={`flex flex-col rounded-xl bg-white overflow-hidden border-2 ${
        placed ? "" : "border-suaza-border"
      }`}
      style={wrapperStyle}
    >
      {cardBody}
      <PlayerStatRow
        matchId={matchId!}
        playerId={m.id}
        stat={stat}
        canEdit={canEditStats}
      />
    </div>
  );
}

// 출석/승리/MOM 미니 상태 배지 — 카드 이름 줄 우측에 표기.
// onClick 이 있으면 버튼으로 렌더, 없으면 span(읽기 전용).
function StatusPill({
  label,
  tone,
  active,
  disabled = false,
  onClick,
}: {
  label: string;
  tone: "success" | "win" | "lose" | "mom";
  active: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const palette: Record<
    "success" | "win" | "lose" | "mom",
    { bg: string; fg: string }
  > = {
    success: { bg: "#22C55E", fg: "#FFFFFF" },
    win: { bg: "#F97316", fg: "#FFFFFF" },
    lose: { bg: "#3B82F6", fg: "#FFFFFF" },
    mom: { bg: "#EAB308", fg: "#FFFFFF" },
  };
  const p = palette[tone];
  const muted = !active || disabled;
  const cls = `inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold leading-none ${
    muted ? "bg-gray-200 text-gray-400" : ""
  } ${onClick && !disabled ? "cursor-pointer hover:opacity-80" : ""}`;
  const styleProp = muted
    ? undefined
    : { backgroundColor: p.bg, color: p.fg };
  const titleText =
    tone === "success"
      ? "출석"
      : tone === "win"
        ? "승리"
        : tone === "lose"
          ? "패배"
          : "MOM";
  if (onClick) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={cls}
        style={styleProp}
        title={titleText}
        aria-pressed={active}
      >
        {label}
      </button>
    );
  }
  return (
    <span
      className={cls}
      style={styleProp}
      title={titleText}
      aria-disabled={disabled}
    >
      {label}
    </span>
  );
}

// 감독·코치 코멘트 — 종료 경기에서 선수 카드 옆에 작은 말풍선 아이콘으로 노출.
// 모달은 같은 (회원, 경기) 에 모든 코치가 남긴 코멘트를 댓글처럼 누적해 표기.
// 새 코멘트는 항상 INSERT — 본인이 또 달거나 다른 코치가 추가해도 누적된다.
// 경기일은 현재 match_id 로 자동 연결.
type CoachCommentRow = {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  author: { name: string | null; title: MemberTitle | null } | null;
};

async function fetchCoachComments(
  memberId: string,
  matchId: string,
): Promise<CoachCommentRow[]> {
  const supabase = createBrowserSupabase();
  const { data } = await supabase
    .from("coach_comments")
    .select(
      "id, content, created_at, author_id, author:profiles!coach_comments_author_id_fkey(name, title)",
    )
    .eq("match_id", matchId)
    .eq("member_id", memberId)
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as CoachCommentRow[];
}

function formatCommentTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function CoachCommentButton({
  memberId,
  memberName,
  matchId,
  matchDate,
  hasComment = false,
  readonly = false,
}: {
  memberId: string;
  memberName: string;
  matchId: string;
  matchDate: string | null;
  /** 이 선수에 (이 경기) 코멘트가 한 건이라도 있으면 아이콘에 배경색 표시 */
  hasComment?: boolean;
  /** 읽기 전용 모드 — 일반 회원이 본인 카드에서 자기 코멘트 열람할 때 사용 */
  readonly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const baseCls =
    "shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-md transition";
  const stateCls = hasComment
    ? "bg-suaza-accent text-white hover:opacity-90"
    : "text-suaza-ink-muted hover:text-suaza-ink hover:bg-gray-100";
  const titleText = readonly
    ? hasComment
      ? "감독·코치 코멘트 보기"
      : "감독·코치 코멘트 (아직 없음)"
    : "감독·코치 코멘트";
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={titleText}
        aria-label={`${memberName} ${titleText}`}
        className={`${baseCls} ${stateCls}`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      <CoachCommentModal
        open={open}
        onClose={() => setOpen(false)}
        memberId={memberId}
        memberName={memberName}
        matchId={matchId}
        matchDate={matchDate}
        readonly={readonly}
      />
    </>
  );
}

function CoachCommentModal({
  open,
  onClose,
  memberId,
  memberName,
  matchId,
  matchDate,
  readonly = false,
}: {
  open: boolean;
  onClose: () => void;
  memberId: string;
  memberName: string;
  matchId: string;
  matchDate: string | null;
  /** 읽기 전용 — 입력/수정/삭제 UI 비표시. 일반 회원이 본인 카드에서 자기 코멘트 열람할 때. */
  readonly?: boolean;
}) {
  const [content, setContent] = useState("");
  const [comments, setComments] = useState<CoachCommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const [myUserId, setMyUserId] = useState<string | null>(null);
  // 인라인 수정 상태 — 한번에 하나만 편집 가능
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [rowBusy, startRowTransition] = useTransition();
  // 같은 (회원, 경기) 에 모든 감독·코치가 남긴 코멘트 목록을 모달 열릴 때마다 다시 불러옴.
  // 새 코멘트는 항상 누적(INSERT). 저장 후엔 모달을 닫지 않고 목록을 갱신.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setContent("");
    setComments([]);
    setEditingId(null);
    setEditContent("");
    setLoading(true);
    (async () => {
      const supabase = createBrowserSupabase();
      const [{ data: userRes }, list] = await Promise.all([
        supabase.auth.getUser(),
        fetchCoachComments(memberId, matchId),
      ]);
      if (cancelled) return;
      setMyUserId(userRes.user?.id ?? null);
      setComments(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, memberId, matchId]);

  const refresh = async () => {
    const list = await fetchCoachComments(memberId, matchId);
    setComments(list);
  };
  const startEdit = (c: CoachCommentRow) => {
    setEditingId(c.id);
    setEditContent(c.content);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };
  const saveEdit = () => {
    const trimmedEdit = editContent.trim();
    if (!trimmedEdit || !editingId || rowBusy) return;
    startRowTransition(async () => {
      await updateCoachComment(editingId, memberId, trimmedEdit);
      setEditingId(null);
      setEditContent("");
      await refresh();
    });
  };
  const removeComment = (id: string) => {
    if (rowBusy) return;
    if (!confirm("이 코멘트를 삭제하시겠습니까?")) return;
    startRowTransition(async () => {
      await deleteCoachComment(id, memberId);
      if (editingId === id) cancelEdit();
      await refresh();
    });
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  const dateLabel = matchDate
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(matchDate))
    : null;
  const trimmed = content.trim();
  const submit = () => {
    if (!trimmed || submitting || loading) return;
    startSubmit(async () => {
      await createCoachComment(memberId, trimmed, matchId);
      setContent("");
      await refresh();
    });
  };
  // 비활성 카드(opacity-50) 안에서 호출되어도 모달이 반투명해지지 않도록
  // document.body 로 portal 렌더 → 부모의 opacity context 를 벗어난다.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md mb-2 sm:mb-0 rounded-2xl shadow-xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-suaza-border shrink-0">
          <h3 className="text-base font-bold text-suaza-ink">
            {memberName} — 감독·코치 코멘트
          </h3>
          <p className="text-xs text-suaza-ink-muted mt-0.5">
            {readonly
              ? dateLabel
                ? `${dateLabel} 경기 — 감독·코치가 남긴 코멘트입니다.`
                : "감독·코치가 남긴 코멘트입니다."
              : dateLabel
                ? `${dateLabel} 경기 — 회원 프로필의 감독·코치 코멘트 섹션에 누적됩니다.`
                : "회원 프로필의 감독·코치 코멘트에 누적됩니다."}
          </p>
        </div>

        {/* 기존 코멘트 목록 (다른 코치 + 본인 모두 시간순) */}
        <div className="px-5 py-3 flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-suaza-ink-muted text-center py-4">
              코멘트 불러오는 중...
            </p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-suaza-ink-faint text-center py-4">
              아직 등록된 코멘트가 없습니다. 첫 코멘트를 남겨주세요.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {comments.map((c) => {
                const isMine = !!myUserId && c.author_id === myUserId;
                const isEditing = editingId === c.id;
                const authorLabel =
                  (c.author?.title && c.author.title !== "player"
                    ? `${TITLE_SHORT[c.author.title]} `
                    : "") + (c.author?.name ?? "—");
                return (
                  <li
                    key={c.id}
                    className="rounded-xl bg-suaza-bg/60 px-3 py-2 flex flex-col gap-1"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-bold text-suaza-ink">
                        {authorLabel}
                      </span>
                      <span className="text-[10px] text-suaza-ink-faint shrink-0">
                        {formatCommentTime(c.created_at)}
                      </span>
                    </div>
                    {isEditing ? (
                      <>
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={3}
                          autoFocus
                          disabled={rowBusy}
                          className="w-full px-2 py-1.5 rounded-lg border border-suaza-border text-sm text-suaza-ink focus:outline-none focus:border-suaza-button resize-none disabled:bg-gray-50"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={rowBusy}
                            className="text-[11px] px-2 py-0.5 rounded-md border border-suaza-border text-suaza-ink-muted hover:bg-white disabled:opacity-50"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={!editContent.trim() || rowBusy}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-suaza-accent text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {rowBusy ? "저장 중..." : "저장"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-suaza-ink whitespace-pre-wrap break-words">
                          {c.content}
                        </p>
                        {isMine && (
                          <div className="flex justify-end gap-1.5 -mt-0.5">
                            <button
                              type="button"
                              onClick={() => startEdit(c)}
                              disabled={rowBusy}
                              className="text-[11px] px-2 py-0.5 rounded-md text-suaza-ink-muted hover:bg-white hover:text-suaza-ink disabled:opacity-50"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => removeComment(c.id)}
                              disabled={rowBusy}
                              className="text-[11px] px-2 py-0.5 rounded-md text-suaza-accent hover:bg-red-50 disabled:opacity-50"
                            >
                              삭제
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 새 코멘트 입력 — 감독·코치만 노출 (일반 회원 readonly 일 땐 숨김) */}
        {!readonly && (
          <div className="px-5 pt-3 pb-3 border-t border-suaza-border shrink-0">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="코멘트를 입력해 추가하세요"
              disabled={loading || submitting}
              className="w-full px-3 py-2 rounded-lg border border-suaza-border text-sm text-suaza-ink placeholder:text-suaza-placeholder focus:outline-none focus:border-suaza-button resize-none disabled:bg-gray-50"
            />
          </div>
        )}
        <div className="flex gap-2 px-5 pb-5 pt-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-3 rounded-lg border border-suaza-border text-suaza-ink-muted font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            닫기
          </button>
          {!readonly && (
            <button
              type="button"
              onClick={submit}
              disabled={!trimmed || submitting || loading}
              className="flex-1 py-3 rounded-lg bg-suaza-accent text-white font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "등록 중..." : "등록"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// 종료 경기 — 선수 카드 아래 붙는 기록 입력/표시 행.
//   상단: 5개 기록 항목(골/어시/CS/심판/MOM) — 클릭 시 선택(편집 대상으로 지정)
//   하단: 선택된 항목의 −값+ 컨트롤 (하나만 노출)
function PlayerStatRow({
  matchId,
  playerId,
  stat,
  canEdit,
}: {
  matchId: string;
  playerId: string;
  stat: PlayerStat;
  canEdit: boolean;
}) {
  const [, startTransition] = useTransition();
  // 낙관적 표시값
  const [optimistic, setOptimistic] = useState({
    goals: stat.goals,
    assists: stat.assists,
    cleanSheets: stat.cleanSheets,
    refereeCount: stat.refereeCount,
  });
  type ItemKey = "goals" | "assists" | "clean_sheets" | "referee_count";
  const items: {
    key: ItemKey;
    label: string;
    icon: React.ReactNode;
    color: string;
    bg: string;
    value: number;
    setValue: (n: number) => void;
  }[] = [
    {
      key: "goals",
      label: "골",
      icon: "⚽",
      color: "#22C55E",
      bg: "rgba(34,197,94,0.10)",
      value: optimistic.goals,
      setValue: (n) => setOptimistic((s) => ({ ...s, goals: n })),
    },
    {
      key: "assists",
      label: "어시",
      icon: "🅰",
      color: "#A855F7",
      bg: "rgba(168,85,247,0.10)",
      value: optimistic.assists,
      setValue: (n) => setOptimistic((s) => ({ ...s, assists: n })),
    },
    {
      key: "clean_sheets",
      label: "CS",
      icon: "🛡️",
      color: "#338CF2",
      bg: "rgba(51,140,242,0.10)",
      value: optimistic.cleanSheets,
      setValue: (n) => setOptimistic((s) => ({ ...s, cleanSheets: n })),
    },
    {
      key: "referee_count",
      label: "심판",
      icon: <LinesmanFlag size={10} />,
      color: "#F59E0B",
      bg: "rgba(245,158,11,0.10)",
      value: optimistic.refereeCount,
      setValue: (n) => setOptimistic((s) => ({ ...s, refereeCount: n })),
    },
  ];
  const change = (
    key: ItemKey,
    delta: number,
    cur: number,
    setVal: (n: number) => void,
  ) => {
    if (!canEdit) return;
    const next = Math.max(0, cur + delta);
    if (next === cur) return;
    setVal(next);
    startTransition(() => {
      incrementStatForPlayer(matchId, playerId, key, delta);
    });
  };

  // 모바일 long-press(>=500ms) 로 -1, 짧은 탭은 +1
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpFired = useRef(false);
  const startLp = (
    key: (typeof items)[number]["key"],
    cur: number,
    setVal: (n: number) => void,
  ) => {
    if (!canEdit) return;
    lpFired.current = false;
    if (lpTimer.current) clearTimeout(lpTimer.current);
    lpTimer.current = setTimeout(() => {
      lpFired.current = true;
      change(key, -1, cur, setVal);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(30);
        } catch {}
      }
    }, 500);
  };
  const cancelLp = () => {
    if (lpTimer.current) {
      clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  };
  return (
    <div className="grid grid-cols-4 gap-1 px-2 py-2 bg-suaza-bg/40">
      {/* 항목 4개 — 탭: +1 / 길게 누르기·우클릭: -1 */}
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          disabled={!canEdit}
          onClick={() => {
            if (lpFired.current) {
              lpFired.current = false;
              return;
            }
            change(it.key, 1, it.value, it.setValue);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            change(it.key, -1, it.value, it.setValue);
          }}
          onPointerDown={() => startLp(it.key, it.value, it.setValue)}
          onPointerUp={cancelLp}
          onPointerLeave={cancelLp}
          onPointerCancel={cancelLp}
          className={`flex items-center justify-center gap-1 py-1.5 rounded-md transition select-none ${
            canEdit ? "hover:bg-white active:bg-white" : "cursor-default opacity-60"
          }`}
          style={{ backgroundColor: it.bg }}
          title={
            canEdit
              ? `${it.label} — 탭: +1, 길게 누르기: -1`
              : it.label
          }
        >
          <span className="text-[10px] font-medium text-suaza-ink-muted leading-none">
            <span aria-hidden className="desktop:mr-0.5">
              {it.icon}
            </span>
            <span className="hidden desktop:inline">{it.label}</span>
          </span>
          <span
            className="text-sm font-bold tabular-nums leading-none"
            style={{ color: it.color }}
          >
            {it.value}
          </span>
        </button>
      ))}
    </div>
  );
}

function PlayerRosterDesktop({
  members,
  quarters,
  validIds,
  availableIds,
  placedSet,
  teamOfPlayer,
  isIntra,
  readonly,
  onTap,
  onDragStart,
  onDragEnd,
  teamLabel,
  teamColor,
  currentShape,
  onShapeChange,
  onReset,
  onAutoPlace,
  myUserId,
  myCondition,
  onCycleCondition,
  matchLocked = false,
  statByPlayer,
  canEditStats = false,
  matchId,
  winningTeam = null,
  rosterTeam = null,
  canWriteCoachComment = false,
  matchDate = null,
  commentCountByPlayer = {},
}: {
  members: EditorMember[];
  quarters: QuarterWithTeams[];
  validIds: Set<string>;
  availableIds: Set<string>;
  placedSet: Set<string>;
  teamOfPlayer: Map<string, "A" | "B">;
  isIntra: boolean;
  readonly: boolean;
  onTap: (id: string, placed: boolean) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  statByPlayer?: Record<string, PlayerStat>;
  canEditStats?: boolean;
  matchId?: string;
  winningTeam?: "A" | "B" | null;
  /** 이 명단 카드가 어느 팀(A/B) 인지. 자체전에서 카드별 승 배지 판정에 사용 */
  rosterTeam?: "A" | "B" | null;
  teamLabel?: string;
  teamColor?: string;
  currentShape?: string;
  onShapeChange?: (shape: string) => void;
  onReset?: () => void;
  onAutoPlace?: () => void;
  myUserId: string;
  myCondition: number;
  onCycleCondition: () => void;
  matchLocked?: boolean;
  canWriteCoachComment?: boolean;
  matchDate?: string | null;
  commentCountByPlayer?: Record<string, number>;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");

  const participations = useMemo(
    () => computeParticipations(members, quarters),
    [members, quarters],
  );
  // 자기 팀(또는 상대전 전체) 기준 출전/평균 쿼터
  const teamStats = useMemo(() => {
    const played = participations.filter((p) => p.totalPlayed > 0).length;
    const sumQ = participations.reduce((s, p) => s + p.totalPlayed, 0);
    const avg = played > 0 ? (sumQ / played).toFixed(1) : "0.0";
    return { played, avg };
  }, [participations]);
  const posCounts = useMemo(() => {
    const c: Record<Filter, number> = {
      ALL: members.length,
      GK: 0,
      DF: 0,
      MF: 0,
      FW: 0,
    };
    // 복수 포지션 선수는 보유한 모든 포지션에 각각 카운트
    for (const m of members) {
      for (const p of m.positions ?? []) {
        if (p in c) c[p as Filter]++;
      }
    }
    return c;
  }, [members]);

  const filtered = useMemo(() => {
    let out = participations;
    if (filter !== "ALL") {
      // 보유 포지션 중 하나라도 일치하면 포함
      out = out.filter((p) => (p.member.positions ?? []).includes(filter));
    }
    // 가나다순 정렬
    return [...out].sort((a, b) =>
      a.member.name.localeCompare(b.member.name, "ko"),
    );
  }, [participations, filter]);

  return (
    <>
      {/* 1줄: 팀이름 + 전체 선수 인원 + 초기화/자동 */}
      <div className="flex items-center gap-2">
        {teamLabel ? (
          <h2 className="shrink-0 text-base font-bold text-suaza-ink">
            {teamLabel}
          </h2>
        ) : (
          <h2 className="shrink-0 text-base font-bold text-suaza-ink">
            {matchLocked ? "출전선수" : "선수 명단"}
          </h2>
        )}
        <FilterTabsWithCounts
          value={filter}
          onChange={setFilter}
          counts={posCounts}
          keys={["ALL"]}
        />
        {!readonly && !matchLocked && (onReset || onAutoPlace) && (
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                className="h-7 px-2.5 rounded-md border border-suaza-border text-[11px] font-medium text-suaza-ink bg-white hover:bg-suaza-bg"
              >
                초기화
              </button>
            )}
            {onAutoPlace && (
              <button
                type="button"
                onClick={onAutoPlace}
                className="h-7 px-2.5 rounded-md bg-suaza-button text-white text-[11px] font-medium hover:opacity-90"
              >
                자동
              </button>
            )}
          </div>
        )}
      </div>
      {/* 2줄: 출전 / 평균 쿼터 — 진행 중 경기에서만 표시. 종료 경기는 숨김. */}
      {members.length > 0 && !matchLocked && (
        <p className="text-xs text-suaza-ink-muted">
          출전 {teamStats.played}명 · 평균 {teamStats.avg}쿼터
        </p>
      )}
      {/* 3줄: 포메이션 드롭다운 — 진행 중 경기에서만 표시. 종료 경기는 숨김. */}
      {currentShape && !matchLocked && onShapeChange && !readonly && (
        <div className="flex items-center">
          <FormationDropdown
            currentShape={currentShape}
            onChange={onShapeChange}
            fullWidth
          />
        </div>
      )}
      <FilterTabsWithCounts
        value={filter}
        onChange={setFilter}
        counts={posCounts}
        keys={["GK", "DF", "MF", "FW"]}
      />
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-suaza-ink-muted">
            {members.length === 0
              ? "참석으로 표시된 선수가 없습니다"
              : "해당 조건의 선수가 없습니다"}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((p) => (
              <PlayerRowMobile
                key={p.member.id}
                participation={p}
                placed={placedSet.has(p.member.id)}
                available={availableIds.has(p.member.id)}
                team={
                  isIntra
                    ? rosterTeam ?? teamOfPlayer.get(p.member.id)
                    : undefined
                }
                readonly={readonly}
                onTap={onTap}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                isMe={p.member.id === myUserId}
                conditionLevel={
                  p.member.id === myUserId
                    ? myCondition
                    : p.member.condition ?? 3
                }
                onCycleCondition={onCycleCondition}
                stat={statByPlayer?.[p.member.id]}
                canEditStats={canEditStats}
                matchId={matchId}
                winningTeam={winningTeam}
                canWriteCoachComment={canWriteCoachComment}
                matchDate={matchDate}
                hasComment={(commentCountByPlayer[p.member.id] ?? 0) > 0}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// 쿼터별 출전 포지션 bar — 그날 쿼터 수만큼 칸을 만들고, 출전한 쿼터는 그 포지션 색으로,
// 미출전 쿼터는 회색으로 채운다. (모바일 A/B 단일 팀 명단에서만 사용)
function QuarterBar({ byQuarter }: { byQuarter: (Position | null)[] }) {
  return (
    <div
      className="shrink-0 flex items-center gap-0.5"
      aria-label="쿼터별 출전 포지션"
    >
      {byQuarter.map((pos, i) => (
        <span
          key={i}
          className="w-1.5 h-4 rounded-sm"
          style={{ backgroundColor: pos ? POSITION_COLOR[pos] : "#E5E7EB" }}
          title={`${i + 1}쿼터 ${pos ?? "미출전"}`}
        />
      ))}
    </div>
  );
}

function DesktopPlayerCard({
  participation,
  placed,
  available = true,
  team,
  readonly,
  onTap,
  onDragStart,
  onDragEnd,
  isMe,
  conditionLevel,
  onCycleCondition,
  stat,
  canEditStats = false,
  matchId,
  winningTeam = null,
  canWriteCoachComment = false,
  matchDate = null,
  hasComment = false,
  showOnlyPrimaryPosition = false,
}: {
  participation: PlayerParticipation;
  placed: boolean;
  available?: boolean;
  team?: "A" | "B";
  readonly: boolean;
  onTap: (id: string, placed: boolean) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  isMe: boolean;
  conditionLevel: number;
  onCycleCondition: () => void;
  /** 종료 경기 임베드 — 이번 경기 기록(있으면 포인트 + 입력 UI 노출) */
  stat?: PlayerStat;
  canEditStats?: boolean;
  matchId?: string;
  winningTeam?: "A" | "B" | null;
  /** 감독·코치 코멘트 작성 권한 (title=head_coach/coach) */
  canWriteCoachComment?: boolean;
  matchDate?: string | null;
  /** 이 선수에 대해 (이 경기) 코멘트가 한 건이라도 있는지 */
  hasComment?: boolean;
  /** true 면 주포지션 1개만 표시 (모바일 양 팀 동시 노출 시 카드 폭 절약 / 줄바꿈 방지) */
  showOnlyPrimaryPosition?: boolean;
}) {
  const m = participation.member;
  const positionsToShow = showOnlyPrimaryPosition
    ? (m.positions ?? []).slice(0, 1)
    : (m.positions ?? []);
  // 현재 쿼터에 참여하지 않는 선수 — 배치 불가, 비활성 표시 (이미 배치돼 있으면 평소대로)
  const disabled = !available && !placed;
  // 현재 쿼터 배치(placed) 강조 — A팀 파랑 / B팀 빨강 / 상대전 초록
  const highlight = placed
    ? team === "A"
      ? { borderColor: "#3B82F6", backgroundColor: "rgba(59,130,246,0.06)" }
      : team === "B"
        ? { borderColor: "#EF4444", backgroundColor: "rgba(239,68,68,0.06)" }
        : { borderColor: "#22C55E", backgroundColor: "rgba(34,197,94,0.06)" }
    : undefined;

  // MOM 활성 (낙관적 — stat 변경 시 동기화)
  const [momActive, setMomActive] = useState((stat?.mom ?? 0) > 0);
  const [, startMomTransition] = useTransition();
  useEffect(() => {
    setMomActive((stat?.mom ?? 0) > 0);
  }, [stat?.mom]);

  // 종료 임베드(stat 있음) — 카드 본체에서 배치/드래그/클릭 비활성
  const lockedForRecord = !!stat;
  const momToggle = canEditStats && matchId
    ? () => {
        const next = !momActive;
        setMomActive(next);
        startMomTransition(() => {
          setMomForPlayer(matchId, m.id, next);
        });
      }
    : undefined;
  const cardBody = (
    <div
      draggable={!readonly && !disabled && !lockedForRecord}
      onDragStart={(e) => {
        if (disabled || lockedForRecord) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/plain", m.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.(m.id);
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={() =>
        !readonly && !disabled && !lockedForRecord && onTap(m.id, placed)
      }
      style={
        stat
          ? placed && highlight
            ? { backgroundColor: highlight.backgroundColor }
            : undefined
          : highlight
      }
      className={`relative ${stat ? "flex flex-col gap-1.5" : "flex items-center gap-2"} p-2.5 select-none transition ${
        stat
          ? "rounded-t-xl"
          : `rounded-xl bg-white border ${placed ? "border-2" : "border-suaza-border"}`
      } ${
        readonly || disabled || lockedForRecord
          ? "cursor-default"
          : "cursor-pointer hover:bg-suaza-bg"
      } ${disabled ? "opacity-50" : ""}`}
    >
      {stat ? (
        // 종료 임베드 모바일 — 3줄 구조: 이름+포지션 / 출·승·M·포인트 / (PlayerStatRow는 wrapper 에서)
        <>
          {/* 1줄: 이름 + 포지션 + (감독·코치 코멘트 아이콘은 ml-auto 로 우측 정렬) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <PlayerName
              name={m.name}
              className="text-sm font-semibold text-suaza-ink"
            />
            {positionsToShow.map((pos) => (
              <span
                key={pos}
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold"
                style={{ color: POSITION_COLOR[pos] }}
              >
                {pos}
              </span>
            ))}
            {(canWriteCoachComment || isMe) && matchId && (
              <span className="ml-auto">
                <CoachCommentButton
                  memberId={m.id}
                  memberName={m.name}
                  matchId={matchId}
                  matchDate={matchDate}
                  hasComment={hasComment}
                  readonly={!canWriteCoachComment}
                />
              </span>
            )}
          </div>
          {/* 2줄: 출 / 승|패 / M / 포인트 */}
          <div className="flex items-center gap-1.5">
            <StatusPill label="출" tone="success" active />
            {!!team && winningTeam != null && winningTeam !== team ? (
              <StatusPill label="패" tone="lose" active />
            ) : (
              <StatusPill
                label="승"
                tone="win"
                active={!!team && winningTeam === team}
              />
            )}
            <StatusPill
              label="M"
              tone="mom"
              active={momActive}
              disabled={!canEditStats}
              onClick={momToggle}
            />
            <span
              className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold text-white bg-suaza-accent"
              title="이번 경기 획득 포인트"
            >
              {stat.points}P
            </span>
          </div>
        </>
      ) : (
        // 진행 중 카드 — 한 줄 + (A/B 단일 팀 보기) 우측 쿼터 bar
        <>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <ConditionArrow
                level={conditionLevel}
                interactive={isMe}
                onCycle={onCycleCondition}
              />
              <PlayerName
                name={m.name}
                className="text-xs font-semibold text-suaza-ink"
              />
              <FootBadge foot={m.preferred_foot} />
              {positionsToShow.map((pos) => (
                <span
                  key={pos}
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold"
                  style={{ color: POSITION_COLOR[pos] }}
                >
                  {pos}
                </span>
              ))}
            </div>
          </div>
          {/* 양 팀 동시(전체) 보기에는 미표시. A/B 단일 팀 보기에서만 우측에 쿼터별 출전 bar. */}
          {!showOnlyPrimaryPosition && (
            <QuarterBar byQuarter={participation.byQuarter} />
          )}
        </>
      )}
    </div>
  );

  if (!stat) return cardBody;

  // 종료 임베드 — wrapper 가 전체 카드 테두리/색을 담당해 placed 강조선이 끊김 없이 둘림
  const wrapperStyle =
    placed && highlight ? { borderColor: highlight.borderColor } : undefined;
  return (
    <div
      className={`flex flex-col rounded-xl bg-white overflow-hidden border ${
        placed ? "border-2" : "border-suaza-border"
      }`}
      style={wrapperStyle}
    >
      {cardBody}
      <PlayerStatRow
        matchId={matchId!}
        playerId={m.id}
        stat={stat}
        canEdit={canEditStats}
      />
    </div>
  );
}

function BottomSheet({
  slot,
  members,
  placedSet,
  availableIds,
  currentPlayerId,
  onClose,
  onPick,
  onClear,
}: {
  slot: SlotDef;
  members: EditorMember[];
  placedSet: Set<string>;
  availableIds: Set<string>;
  currentPlayerId: string | null;
  onClose: () => void;
  onPick: (id: string) => void;
  onClear: () => void;
}) {
  const [filter, setFilter] = useState<Filter>(slot.role as Filter);
  const [query, setQuery] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-end desktop:items-center desktop:justify-center bg-black/40">
      <div className="absolute inset-0" onClick={onClose} aria-label="닫기" />
      <div className="relative w-full desktop:w-[420px] desktop:rounded-2xl bg-white rounded-t-2xl shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-suaza-border">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: POSITION_COLOR[slot.role] }}
            />
            <h3 className="text-base font-semibold text-suaza-ink">
              {slot.role} 슬롯에 배치
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-suaza-ink-muted hover:text-suaza-ink text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-3 flex flex-col gap-2 border-b border-suaza-border">
          <SearchInput value={query} onChange={setQuery} />
          <FilterTabs value={filter} onChange={setFilter} />
        </div>

        <div className="px-3 py-2 overflow-y-auto flex-1">
          <PlayerList
            members={members}
            placedSet={placedSet}
            availableIds={availableIds}
            filter={filter}
            query={query}
            readonly={false}
            onTap={(id) => onPick(id)}
          />
        </div>

        {currentPlayerId && (
          <div className="px-5 py-3 border-t border-suaza-border">
            <button
              type="button"
              onClick={onClear}
              className="w-full h-11 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50"
            >
              이 슬롯 비우기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
