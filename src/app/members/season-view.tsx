import { createClient } from "@/lib/supabase/server";
import {
  aggregateSeason,
  buildRichSeasonStats,
  periodRange,
  type MatchSummary,
  type ParticipationRow,
  type PlayerSeasonStat,
  type RichPlayerSeasonStat,
  type StatDef,
} from "@/lib/stats/helpers";
import SeasonList from "./season-list";

export default async function SeasonView({
  year,
  years,
}: {
  year: number;
  years: number[];
  // sort/month/order props 는 클라이언트 state 로 옮겨가 더 이상 사용 안 함
  sort?: string;
  month?: number;
  order?: "asc" | "desc";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myId = user?.id ?? null;
  const { from, to } = periodRange(year, 0);

  // 1. 해당 연도 종료 경기 (W/D/L 판정용 점수 포함)
  const { data: matchesRaw } = await supabase
    .from("matches")
    .select("id, match_date, our_score, opponent_score, opponent")
    .eq("status", "done")
    .gte("match_date", from)
    .lt("match_date", to)
    .order("match_date", { ascending: false });

  const matches = (matchesRaw ?? []) as MatchSummary[];
  const matchIds = matches.map((m) => m.id);

  // 2. 그 경기들의 선수 기록 + stat 정의
  const [{ data: partsRaw }, { data: defsRaw }] = await Promise.all([
    matchIds.length === 0
      ? Promise.resolve({ data: [] as ParticipationRow[] })
      : supabase
          .from("match_participations")
          .select(
            "match_id, player_id, goals, assists, custom_stats, player:profiles(id, name, jersey_number)",
          )
          .in("match_id", matchIds)
          .is("archived_at", null),
    supabase
      .from("stat_definitions")
      .select("key, label, sort_order")
      .order("sort_order", { ascending: true })
      .order("key", { ascending: true }),
  ]);

  const defs = (defsRaw ?? []) as StatDef[];
  const parts = (partsRaw ?? []) as unknown as ParticipationRow[];
  const aggregated = aggregateSeason(parts, defs);

  // 모든 활성 회원 명단을 받아 출전 없는 사람도 0 으로 채움
  const { data: allMembersRaw } = await supabase
    .from("profiles")
    .select("id, name, jersey_number")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const statsMap = new Map(aggregated.map((s) => [s.player_id, s]));
  const baseStats: PlayerSeasonStat[] = (allMembersRaw ?? []).map(
    (m) =>
      statsMap.get(m.id) ?? {
        player_id: m.id,
        name: m.name,
        jersey_number: m.jersey_number,
        appearances: 0,
        goals: 0,
        assists: 0,
        custom: {},
      },
  );

  const rich = buildRichSeasonStats(baseStats, parts, matches);
  const totalMembers = baseStats.length;
  const activeCount = rich.filter((s) => s.appearances > 0).length;

  return (
    <SeasonList
      stats={rich}
      myId={myId}
      year={year}
      years={years}
      totalMembers={totalMembers}
      activeCount={activeCount}
    />
  );
}

export type { RichPlayerSeasonStat };
