import {
  aggregateSeason,
  yearRange,
  type ParticipationRow,
  type StatDef,
} from "@/lib/stats/helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SeasonKings = {
  goal: Set<string>;
  assist: Set<string>;
  cleanSheet: Set<string>;
  referee: Set<string>;
};

/**
 * 해당 연도의 카테고리별 시즌 1위(공동 1위 포함) player_id 집합.
 * 값이 0 인 카테고리는 빈 집합. 어디서나 동일 정책으로 재사용.
 */
export async function computeSeasonKings(
  supabase: SupabaseClient,
  year: number,
): Promise<SeasonKings> {
  const empty: SeasonKings = {
    goal: new Set(),
    assist: new Set(),
    cleanSheet: new Set(),
    referee: new Set(),
  };
  const { from, to } = yearRange(year);

  const { data: matchesRaw } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "done")
    .gte("match_date", from)
    .lt("match_date", to);
  const matchIds = (matchesRaw ?? []).map((m) => m.id as string);
  if (matchIds.length === 0) return empty;

  const [{ data: partsRaw }, { data: defsRaw }] = await Promise.all([
    supabase
      .from("match_participations")
      .select(
        "match_id, player_id, goals, assists, custom_stats, player:profiles(id, name, jersey_number)",
      )
      .in("match_id", matchIds)
      .is("archived_at", null),
    supabase
      .from("stat_definitions")
      .select("key, label, sort_order, point_value"),
  ]);

  const defs = (defsRaw ?? []) as StatDef[];
  const parts = (partsRaw ?? []) as unknown as ParticipationRow[];
  const aggregated = aggregateSeason(parts, defs);

  const pick = (getter: (s: (typeof aggregated)[number]) => number) => {
    let max = 0;
    for (const s of aggregated) {
      const v = getter(s);
      if (v > max) max = v;
    }
    if (max <= 0) return new Set<string>();
    const out = new Set<string>();
    for (const s of aggregated) {
      if (getter(s) === max) out.add(s.player_id);
    }
    return out;
  };

  return {
    goal: pick((s) => s.goals ?? 0),
    assist: pick((s) => s.assists ?? 0),
    cleanSheet: pick((s) => s.custom.clean_sheets ?? 0),
    referee: pick((s) => s.custom.referee_count ?? 0),
  };
}
