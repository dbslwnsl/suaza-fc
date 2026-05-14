export type StatDef = { key: string; label: string; sort_order: number };

export type ParticipationRow = {
  match_id: string;
  player_id: string;
  goals: number;
  assists: number;
  custom_stats: Record<string, number> | null;
  player: { id: string; name: string; jersey_number: number | null } | null;
};

export type PlayerSeasonStat = {
  player_id: string;
  name: string;
  jersey_number: number | null;
  appearances: number;
  goals: number;
  assists: number;
  custom: Record<string, number>;
};

export function yearRange(year: number) {
  return {
    from: new Date(year, 0, 1).toISOString(),
    to: new Date(year + 1, 0, 1).toISOString(),
  };
}

/**
 * month: 1~12 면 해당 월, 그 외 값(0 / null)은 연도 전체.
 */
export function periodRange(year: number, month: number) {
  if (month < 1 || month > 12) return yearRange(year);
  return {
    from: new Date(year, month - 1, 1).toISOString(),
    to: new Date(year, month, 1).toISOString(),
  };
}

export function aggregateSeason(
  rows: ParticipationRow[],
  defs: StatDef[],
): PlayerSeasonStat[] {
  const byPlayer = new Map<string, PlayerSeasonStat>();
  for (const r of rows) {
    if (!r.player) continue;
    let s = byPlayer.get(r.player_id);
    if (!s) {
      s = {
        player_id: r.player_id,
        name: r.player.name,
        jersey_number: r.player.jersey_number,
        appearances: 0,
        goals: 0,
        assists: 0,
        custom: {},
      };
      byPlayer.set(r.player_id, s);
    }
    s.appearances += 1;
    s.goals += r.goals ?? 0;
    s.assists += r.assists ?? 0;
    for (const d of defs) {
      s.custom[d.key] = (s.custom[d.key] ?? 0) + (r.custom_stats?.[d.key] ?? 0);
    }
  }
  return [...byPlayer.values()];
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
