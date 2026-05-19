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
    .select("id, match_date, opponent, our_score, opponent_score")
    .eq("status", "done")
    .gte("match_date", from)
    .lt("match_date", to)
    .order("match_date", { ascending: false });

  const matches = (matchesRaw ?? []) as MatchRow[];
  const matchIds = matches.map((m) => m.id);

  const [{ data: partsRaw }, { data: membersRaw }] = await Promise.all([
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

  function resultOf(
    m: MatchRow,
  ): "W" | "D" | "L" | null {
    if (m.opponent === "자체전") return null;
    if (m.our_score == null || m.opponent_score == null) return null;
    if (m.our_score > m.opponent_score) return "W";
    if (m.our_score < m.opponent_score) return "L";
    return "D";
  }

  const matchEntries: MatchListEntry[] = matches.map((m) => ({
    id: m.id,
    matchDate: m.match_date,
    opponent: m.opponent,
    ourScore: m.our_score,
    opponentScore: m.opponent_score,
    result: resultOf(m),
    attendingCount: countByMatch.get(m.id) ?? 0,
  }));

  // 매치 x 플레이어 셀 데이터 (직렬화 가능한 평면 구조)
  const cells = parts.map((p) => ({
    matchId: p.match_id,
    playerId: p.player_id,
    goals: p.goals ?? 0,
    assists: p.assists ?? 0,
    cleanSheets: p.custom_stats?.clean_sheets ?? 0,
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
