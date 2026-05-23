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

export type MatchSummary = {
  id: string;
  match_date: string;
  our_score: number | null;
  opponent_score: number | null;
  opponent: string;
};

export type MatchResult = "W" | "D" | "L";

export type RichPlayerSeasonStat = PlayerSeasonStat & {
  attackPoints: number; // goals + assists
  cleanSheets: number;
  refereeCount: number;
  mom: number; // custom_stats.mom 합 (MOM 횟수)
  wins: number; // 승리한 경기 수 (자체전 제외)
  points: number; // custom_stats.points 합
  attendanceRate: number; // 0~1
  recent5: MatchResult[]; // 가장 최근 5경기 (출전한 것만)
};

function resultFromScores(
  our: number | null,
  opp: number | null,
): MatchResult | null {
  if (our == null || opp == null) return null;
  if (our > opp) return "W";
  if (our < opp) return "L";
  return "D";
}

/**
 * aggregateSeason 결과에 시즌 통계용 파생 필드를 추가.
 * - attackPoints, attendanceRate, recent5, points 등
 * - matches 는 시즌 종료 경기 목록 (match_date 내림차순 권장)
 * - parts 는 archive 안 된 participation row
 */
export function buildRichSeasonStats(
  base: PlayerSeasonStat[],
  parts: ParticipationRow[],
  matches: MatchSummary[],
): RichPlayerSeasonStat[] {
  const totalMatches = matches.length;
  const matchById = new Map(matches.map((m) => [m.id, m]));

  // 선수별 participation 들을 match_date desc 로 정렬해 가장 최근 5개 결과 산출
  const partsByPlayer = new Map<string, ParticipationRow[]>();
  for (const p of parts) {
    const arr = partsByPlayer.get(p.player_id) ?? [];
    arr.push(p);
    partsByPlayer.set(p.player_id, arr);
  }

  return base.map((s) => {
    const playerParts = partsByPlayer.get(s.player_id) ?? [];
    const playedMatches = playerParts
      .map((p) => matchById.get(p.match_id))
      .filter((m): m is MatchSummary => !!m);
    // 승리 횟수: 자체전 제외, 본인이 출전한 경기 중 W
    const wins = playedMatches.filter(
      (m) =>
        m.opponent !== "자체전" &&
        resultFromScores(m.our_score, m.opponent_score) === "W",
    ).length;
    const recent5: MatchResult[] = playedMatches
      .sort(
        (a, b) =>
          new Date(b.match_date).getTime() - new Date(a.match_date).getTime(),
      )
      .slice(0, 5)
      .map((m) => {
        if (m.opponent === "자체전") return "D"; // 자체전은 무승부 표기
        return resultFromScores(m.our_score, m.opponent_score) ?? "D";
      });
    return {
      ...s,
      attackPoints: s.goals + s.assists,
      cleanSheets: s.custom.clean_sheets ?? 0,
      refereeCount: s.custom.referee_count ?? 0,
      mom: s.custom.mom ?? 0,
      wins,
      points: s.custom.points ?? 0,
      attendanceRate: totalMatches > 0 ? s.appearances / totalMatches : 0,
      recent5,
    };
  });
}

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
  // KST 기준 'M/D' (서버 타임존 무관)
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  });
  const parts = fmt.formatToParts(new Date(iso));
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${month}/${day}`;
}
