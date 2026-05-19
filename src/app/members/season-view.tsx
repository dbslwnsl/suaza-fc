import { createClient } from "@/lib/supabase/server";
import {
  periodRange,
  type MatchSummary,
  type ParticipationRow,
  type StatDef,
} from "@/lib/stats/helpers";
import SeasonList, { type RosterBase } from "./season-list";

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

  // 모든 활성 회원 명단 (출전 없는 사람도 명단에 포함)
  const { data: allMembersRaw } = await supabase
    .from("profiles")
    .select("id, name, jersey_number")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const roster: RosterBase[] = (allMembersRaw ?? []).map((m) => ({
    player_id: m.id,
    name: m.name,
    jersey_number: m.jersey_number,
  }));

  return (
    <SeasonList
      myId={myId}
      year={year}
      years={years}
      roster={roster}
      matches={matches}
      parts={parts}
      defs={defs}
      totalMembers={roster.length}
    />
  );
}
