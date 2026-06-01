import { createClient } from "@/lib/supabase/server";
import { yearRange } from "@/lib/stats/helpers";
import MatchesList, {
  type MatchListEntry,
  type MatchMember,
} from "./matches-list";

type MatchRow = {
  id: string;
  match_date: string;
  opponent: string;
  our_score: number | null;
  opponent_score: number | null;
  intra_winner: "A" | "B" | null;
};

type ParticipationRow = {
  match_id: string;
  player_id: string;
  goals: number;
  assists: number;
  custom_stats: Record<string, number> | null;
};

type MemberRow = {
  id: string;
  name: string;
  jersey_number: number | null;
};

export default async function MatchesView({
  year,
  years,
}: {
  year: number;
  years: number[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myId = user?.id ?? null;
  const { from, to } = yearRange(year);

  const { data: matchesRaw } = await supabase
    .from("matches")
    .select(
      "id, match_date, opponent, our_score, opponent_score, intra_winner",
    )
    .eq("status", "done")
    .gte("match_date", from)
    .lt("match_date", to)
    .order("match_date", { ascending: false });

  const matches = (matchesRaw ?? []) as MatchRow[];
  const matchIds = matches.map((m) => m.id);

  const [
    { data: partsRaw },
    { data: membersRaw },
    { data: myAttendancesRaw },
  ] = await Promise.all([
    matchIds.length === 0
      ? Promise.resolve({ data: [] as ParticipationRow[] })
      : supabase
          .from("match_participations")
          .select("match_id, player_id, goals, assists, custom_stats")
          .in("match_id", matchIds)
          .is("archived_at", null),
    supabase
      .from("profiles")
      .select("id, name, jersey_number")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    matchIds.length === 0 || !myId
      ? Promise.resolve({
          data: [] as { match_id: string; team: "A" | "B" | null }[],
        })
      : supabase
          .from("match_attendances")
          .select("match_id, team")
          .eq("player_id", myId)
          .in("match_id", matchIds),
  ]);

  const parts = (partsRaw ?? []) as ParticipationRow[];
  const rawMembers = (membersRaw ?? []) as MemberRow[];

  // 본인 항상 맨 위
  const members: MatchMember[] = (
    myId
      ? [
          ...rawMembers.filter((m) => m.id === myId),
          ...rawMembers.filter((m) => m.id !== myId),
        ]
      : rawMembers
  ).map((m) => ({
    id: m.id,
    name: m.name,
    jerseyNumber: m.jersey_number,
  }));

  // 매치당 attendance count 와 result
  const countByMatch = new Map<string, number>();
  for (const p of parts) {
    countByMatch.set(p.match_id, (countByMatch.get(p.match_id) ?? 0) + 1);
  }

  // 상대전: 팀 단위 결과(점수 기준). 자체전: 팀이 갈리므로 매트릭스 컬럼 단위로는 결정 불가 → null.
  function resultOf(m: MatchRow): "W" | "D" | "L" | null {
    if (m.opponent === "자체전") return null;
    if (m.our_score == null || m.opponent_score == null) return null;
    if (m.our_score > m.opponent_score) return "W";
    if (m.our_score < m.opponent_score) return "L";
    return "D";
  }

  // 본인이 그 경기에서 배정된 팀(자체전 한정). 상대전은 무관.
  const myTeamByMatch = new Map<string, "A" | "B" | null>();
  for (const a of (myAttendancesRaw ?? []) as {
    match_id: string;
    team: "A" | "B" | null;
  }[]) {
    myTeamByMatch.set(a.match_id, a.team);
  }

  // 모바일 카드에서 보여줄 "내 기준" 결과.
  //  - 상대전: 팀 결과(=resultOf)와 동일
  //  - 자체전 + 내 팀 배정됨: intra_winner 와 비교 (null=무, 같으면 승, 다르면 패)
  //  - 자체전 + 미배정: null (표기하지 않음)
  function myResultOf(m: MatchRow): "W" | "D" | "L" | null {
    if (m.opponent !== "자체전") return resultOf(m);
    const myTeam = myTeamByMatch.get(m.id) ?? null;
    if (myTeam !== "A" && myTeam !== "B") return null;
    if (m.intra_winner == null) return "D";
    return m.intra_winner === myTeam ? "W" : "L";
  }

  const matchEntries: MatchListEntry[] = matches.map((m) => ({
    id: m.id,
    matchDate: m.match_date,
    opponent: m.opponent,
    ourScore: m.our_score,
    opponentScore: m.opponent_score,
    result: resultOf(m),
    myResult: myResultOf(m),
    attendingCount: countByMatch.get(m.id) ?? 0,
  }));

  // 매치 x 플레이어 셀 데이터 (직렬화 가능한 평면 구조)
  const cells = parts.map((p) => ({
    matchId: p.match_id,
    playerId: p.player_id,
    goals: p.goals ?? 0,
    assists: p.assists ?? 0,
    cleanSheets: p.custom_stats?.clean_sheets ?? 0,
    refereeCount: p.custom_stats?.referee_count ?? 0,
    mom: p.custom_stats?.mom ?? 0,
  }));

  const wins = matchEntries.filter((m) => m.result === "W").length;
  const draws = matchEntries.filter((m) => m.result === "D").length;
  const losses = matchEntries.filter((m) => m.result === "L").length;

  return (
    <MatchesList
      year={year}
      years={years}
      matches={matchEntries}
      members={members}
      cells={cells}
      myId={myId}
      wins={wins}
      draws={draws}
      losses={losses}
    />
  );
}
