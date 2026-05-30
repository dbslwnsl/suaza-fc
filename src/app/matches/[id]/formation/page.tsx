import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FormationEditor from "./formation-editor";

// 포메이션 데이터가 자주 바뀌므로 매 요청 fresh 로드 (cache 우회)
export const dynamic = "force-dynamic";
import {
  DEFAULT_TOTAL_QUARTERS,
  formatMatchDate,
  getTeamName,
  type QuarterAction,
} from "@/lib/matches/helpers";
import { type SavedQuarter } from "@/lib/formations/helpers";
import type {
  Position,
  MemberTitle,
  PreferredFoot,
} from "@/lib/members/positions";

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
// id 는 전체 쿼터 기준 1-based 인덱스(`${globalIndex}Q`), label 은 게임 쿼터 재번호(1Q, 2Q…).
export type GameQuarter = {
  id: string;
  globalIndex: number; // 전체 쿼터 기준 1-based — 출석 attending_quarters 와 매핑
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
  // 모든 쿼터가 준비/훈련이면 안전장치로 전체를 게임 쿼터 취급
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
  // 경기 설정 게임 쿼터에 맞춰 정렬 — 저장된 배치는 id 로 매칭, 없으면 빈 쿼터.
  return gameQuarters.map<SavedQuarter>((gq) => {
    const found = saved.find((q) => q.id === gq.id);
    return found ?? { id: gq.id, shape: "4-2-3-1", player_ids: [] };
  });
}

export default async function FormationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const { error, message } = await searchParams;

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
  ] = await Promise.all([
    // select("*") 로 조회해 마이그레이션(주장 컬럼) 미적용 시에도 페이지가 깨지지 않게 함.
    supabase.from("matches").select("*").eq("id", id).single(),
    supabase.from("profiles").select("role, title").eq("id", user.id).single(),
    supabase
      .from("formations")
      .select("shape, positions")
      .eq("match_id", id)
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
      .eq("match_id", id)
      .eq("status", "attending"),
  ]);

  if (!match) notFound();

  // 풀 권한(양 팀 편집): 권한 role=manager, 또는 직책 회장(president)/감독(head_coach)
  const isFullStaff =
    me?.role === "manager" ||
    me?.title === "president" ||
    me?.title === "head_coach";
  // 코치(직책 coach 또는 role=coach): 본인이 속한 팀만 편집 (회장·감독보다 약한 권한)
  const isCoach = me?.role === "coach" || me?.title === "coach";
  // 이 경기 자체전 주장 여부 — 주장도 자기 팀만 편집.
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
  // 자체전 편성팀 매핑 (player_id → 'A' | 'B' | null)
  const teamByPlayer: Record<string, "A" | "B" | null> = {};
  // 참여 쿼터 매핑 (player_id → 전체 쿼터 기준 번호 배열 | null=전체)
  const attendingQuartersByPlayer: Record<string, number[] | null> = {};
  for (const a of attendanceRows) {
    teamByPlayer[a.player_id] = a.team;
    attendingQuartersByPlayer[a.player_id] = a.attending_quarters ?? null;
  }
  const isIntra = match.opponent === "자체전";

  // 편집 권한 산출:
  // - 회장·감독(isFullStaff) → 양 팀("both")
  // - 코치 → 본인 배정 팀만. 자체전은 teamByPlayer 기준, 상대전은 팀이 하나라 그 팀 전체("both")
  // - 주장 → 본인 팀("A"/"B")
  // - 그 외 → null(보기 전용)
  const myTeam = teamByPlayer[user.id] ?? null;
  const editableTeam: "A" | "B" | "both" | null = isFullStaff
    ? "both"
    : isCoach
      ? isIntra
        ? myTeam
        : "both"
      : myCaptainTeam;

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg desktop:overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-6 sm:py-10 desktop:pb-0 flex flex-col gap-5 sm:gap-6 desktop:h-[calc(100dvh-64px)] desktop:min-h-0">
        <header className="flex items-center gap-3">
          <Link
            href={`/matches/${id}`}
            className="text-sm text-suaza-ink-muted hover:underline"
          >
            ← 경기 상세
          </Link>
        </header>

        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] sm:text-[28px] font-bold text-suaza-ink">
            포메이션 설정
          </h1>
          <p className="text-sm text-suaza-ink-muted">
            vs {match.opponent} · {formatMatchDate(match.match_date)}
            {match.location ? ` · ${match.location}` : ""}
          </p>
        </div>

        {message && (
          <p className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">
            {message}
          </p>
        )}
        {error && (
          <p className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </p>
        )}

        <FormationEditor
          matchId={id}
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
          matchLocked={
            match.status === "done" || match.status === "canceled"
          }
        />
      </div>
    </main>
  );
}
