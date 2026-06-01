import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FormationEditor from "./formation-editor";
import {
  DEFAULT_TOTAL_QUARTERS,
  getTeamName,
  type QuarterAction,
} from "@/lib/matches/helpers";
import { type SavedQuarter } from "@/lib/formations/helpers";
import {
  pointValueMap,
  pointsForParticipation,
  type StatDef,
} from "@/lib/stats/helpers";
import type {
  Position,
  MemberTitle,
  PreferredFoot,
} from "@/lib/members/positions";

export type PlayerStat = {
  goals: number;
  assists: number;
  cleanSheets: number;
  refereeCount: number;
  mom: number;
  winPoints: number;
  attendance: number;
  points: number;
};

export type EditorMember = {
  id: string;
  name: string;
  jersey_number: number | null;
  positions: Position[] | null;
  title: MemberTitle | null;
  avatar_url: string | null;
  condition: number;
  preferred_foot: PreferredFoot | null;
};

type FormationRow = {
  shape: string;
  positions: {
    player_ids?: (string | null)[];
    quarters?: SavedQuarter[];
  };
};

// 포메이션 탭에 노출할 "게임 쿼터" (준비운동·훈련 제외).
export type GameQuarter = {
  id: string;
  globalIndex: number;
  label: string;
};

function buildGameQuarters(
  totalQuarters: number,
  actions: (QuarterAction | null)[],
): GameQuarter[] {
  const list: GameQuarter[] = [];
  let gameNum = 0;
  for (let i = 0; i < totalQuarters; i++) {
    const a = actions[i] ?? null;
    if (a === "warmup" || a === "training") continue;
    gameNum += 1;
    list.push({ id: `${i + 1}Q`, globalIndex: i + 1, label: `${gameNum}Q` });
  }
  if (list.length === 0) {
    for (let i = 0; i < totalQuarters; i++) {
      list.push({ id: `${i + 1}Q`, globalIndex: i + 1, label: `${i + 1}Q` });
    }
  }
  return list;
}

function buildInitialQuarters(
  f: FormationRow | null,
  gameQuarters: GameQuarter[],
): SavedQuarter[] {
  let saved: SavedQuarter[] = [];
  if (f) {
    if (Array.isArray(f.positions?.quarters)) {
      saved = f.positions.quarters
        .filter((q) => q && typeof q.shape === "string" && q.id)
        .map((q) => ({
          id: q.id,
          shape: q.shape,
          player_ids: q.player_ids ?? [],
          teamB: q.teamB
            ? {
                shape: q.teamB.shape,
                player_ids: q.teamB.player_ids ?? [],
              }
            : undefined,
        }));
    } else if (f.positions?.player_ids) {
      saved = [
        {
          id: "1Q",
          shape: f.shape ?? "4-2-3-1",
          player_ids: f.positions.player_ids,
        },
      ];
    }
  }
  return gameQuarters.map<SavedQuarter>((gq) => {
    const found = saved.find((q) => q.id === gq.id);
    return found ?? { id: gq.id, shape: "4-2-3-1", player_ids: [] };
  });
}

/**
 * FormationEditor 를 실제 데이터로 채워 렌더하는 서버 컴포넌트.
 * - 포메이션 페이지(/matches/[id]/formation) 및
 *   종료 경기 상세 페이지의 임베드(아래 "팀 편성 결과" ↔ "선수별 기록" 사이)에서 공통 사용.
 */
export default async function FormationEmbed({ matchId }: { matchId: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [
    { data: match },
    { data: me },
    { data: formation },
    { data: members },
    { data: attendances },
    { data: participations },
    { data: statDefs },
    { data: coachComments },
  ] = await Promise.all([
    supabase.from("matches").select("*").eq("id", matchId).single(),
    supabase.from("profiles").select("role, title").eq("id", user.id).single(),
    supabase
      .from("formations")
      .select("shape, positions")
      .eq("match_id", matchId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select(
        "id, name, jersey_number, positions, title, avatar_url, condition, preferred_foot",
      )
      .is("deleted_at", null)
      .order("jersey_number", { ascending: true, nullsFirst: false }),
    supabase
      .from("match_attendances")
      .select("player_id, status, team, attending_quarters")
      .eq("match_id", matchId)
      .eq("status", "attending"),
    supabase
      .from("match_participations")
      .select("player_id, goals, assists, custom_stats")
      .eq("match_id", matchId)
      .is("archived_at", null),
    supabase
      .from("stat_definitions")
      .select("key, label, sort_order, point_value"),
    // 코멘트 존재 여부 표시용 — RLS 가 본인(member_id=me) 또는 코칭스태프에게만 row 노출.
    // 일반 회원은 자기 자신에 대한 코멘트 카운트만 보임 → 아이콘 표시 분기에도 그대로 활용.
    supabase
      .from("coach_comments")
      .select("member_id")
      .eq("match_id", matchId),
  ]);

  if (!match) notFound();

  const isFullStaff =
    me?.role === "manager" ||
    me?.title === "president" ||
    me?.title === "head_coach";
  const isCoach = me?.role === "coach" || me?.title === "coach";
  // 감독·코치 코멘트 작성 가능 여부 — title 기준 head_coach/coach 만 (회장 제외)
  const canWriteCoachComment =
    me?.title === "head_coach" || me?.title === "coach";
  const teamACaptain = (match.team_a_captain as string | null) ?? null;
  const teamBCaptain = (match.team_b_captain as string | null) ?? null;
  const captainIds = [teamACaptain, teamBCaptain].filter(
    (x): x is string => !!x,
  );
  const myCaptainTeam: "A" | "B" | null =
    teamACaptain === user.id ? "A" : teamBCaptain === user.id ? "B" : null;
  const f = formation as FormationRow | null;
  const totalQuarters =
    (match.total_quarters as number | null) ?? DEFAULT_TOTAL_QUARTERS;
  const quarterActions = ((match.quarter_actions as
    | (QuarterAction | null)[]
    | null) ?? []) as (QuarterAction | null)[];
  const gameQuarters = buildGameQuarters(totalQuarters, quarterActions);
  const initialQuarters = buildInitialQuarters(f, gameQuarters);
  const attendanceRows = (attendances ?? []) as {
    player_id: string;
    team: "A" | "B" | null;
    attending_quarters: number[] | null;
  }[];
  const attendingIds = attendanceRows.map((a) => a.player_id);
  const teamByPlayer: Record<string, "A" | "B" | null> = {};
  const attendingQuartersByPlayer: Record<string, number[] | null> = {};
  for (const a of attendanceRows) {
    teamByPlayer[a.player_id] = a.team;
    attendingQuartersByPlayer[a.player_id] = a.attending_quarters ?? null;
  }
  const isIntra = match.opponent === "자체전";

  const myTeam = teamByPlayer[user.id] ?? null;
  const editableTeam: "A" | "B" | "both" | null = isFullStaff
    ? "both"
    : isCoach
      ? isIntra
        ? myTeam
        : "both"
      : myCaptainTeam;

  // 선수별 기록(participations) → playerId 맵. 종료 경기 명단 카드 우측에 표기.
  const defs = (statDefs ?? []) as StatDef[];
  const pvMap = pointValueMap(defs);
  const matchLocked =
    match.status === "done" || match.status === "canceled";
  // 자체전 종료 시: 회장·감독이 토글한 matches.intra_winner 가 승리팀.
  //   NULL(기본) = 무승부 → 양 팀 win_points 0.
  // 실제 row 가 없어도 표시 계산엔 winPoints 가산을 포함하고,
  // 실제 DB 저장은 매니저가 골/어시 등 입력하는 순간 incrementStatForPlayer 가 수행.
  const intraWinner = isIntra
    ? ((match as { intra_winner?: "A" | "B" | null } | null)?.intra_winner ??
      null)
    : null;
  const winPointBase = pvMap["win_points"] ?? 1;
  const statByPlayer: Record<string, PlayerStat> = {};
  for (const row of (participations ?? []) as {
    player_id: string;
    goals: number | null;
    assists: number | null;
    custom_stats: Record<string, number> | null;
  }[]) {
    const cs = row.custom_stats ?? {};
    statByPlayer[row.player_id] = {
      goals: row.goals ?? 0,
      assists: row.assists ?? 0,
      cleanSheets: cs.clean_sheets ?? 0,
      refereeCount: cs.referee_count ?? 0,
      mom: cs.mom ?? 0,
      winPoints: cs.win_points ?? 0,
      attendance: cs.attendance ?? 1,
      points: pointsForParticipation(row, match.match_date, pvMap),
    };
  }
  // 회원별 코멘트 개수 (말풍선 아이콘에 "코멘트 있음" 표시용)
  const commentCountByPlayer: Record<string, number> = {};
  for (const row of (coachComments ?? []) as { member_id: string }[]) {
    commentCountByPlayer[row.member_id] =
      (commentCountByPlayer[row.member_id] ?? 0) + 1;
  }

  // 출석한 선수는 row 없어도 1pt(attendance) 기본 표시.
  // 자체전 종료 & A팀이면 win_points 가산(미리보기).
  const attendanceBase = pvMap["attendance"] ?? 1;
  for (const a of attendanceRows) {
    if (statByPlayer[a.player_id]) continue;
    const isWinningSide =
      matchLocked && isIntra && intraWinner != null && a.team === intraWinner;
    statByPlayer[a.player_id] = {
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      refereeCount: 0,
      mom: 0,
      winPoints: isWinningSide ? winPointBase : 0,
      attendance: 1,
      points: attendanceBase + (isWinningSide ? winPointBase : 0),
    };
  }

  return (
    <FormationEditor
      matchId={matchId}
      myUserId={user.id}
      members={(members ?? []) as EditorMember[]}
      attendingIds={attendingIds}
      teamByPlayer={teamByPlayer}
      attendingQuartersByPlayer={attendingQuartersByPlayer}
      gameQuarters={gameQuarters}
      initialQuarters={initialQuarters}
      isIntra={isIntra}
      teamAName={getTeamName(match, "A")}
      teamBName={getTeamName(match, "B")}
      editableTeam={editableTeam}
      captainIds={captainIds}
      matchLocked={matchLocked}
      {...(matchLocked
        ? {
            statByPlayer,
            canEditStats: isFullStaff,
            winningTeam: intraWinner,
            canEditWinner: isIntra && isFullStaff,
            canWriteCoachComment,
            matchDate: match.match_date as string,
            commentCountByPlayer,
          }
        : {})}
    />
  );
}
