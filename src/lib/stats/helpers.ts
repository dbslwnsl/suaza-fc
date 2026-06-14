export type StatDef = {
  key: string;
  label: string;
  sort_order: number;
  point_value?: number;
};

// 포인트 합계 대상이 아닌 항목 (합계 자체)
export const AGGREGATE_POINT_KEY = "points";

// 기준일: 이 시각 이전(미만)의 경기는 직접 입력한 포인트(custom_stats.points)를 사용,
// 이후 경기는 항목 기준점수(point_value)로 계산.
// "2026-05-16 까지 = 수동(CSV), 그 이후 = 가중치" → 경계 = 2026-05-17 00:00 KST.
export const POINTS_WEIGHT_CUTOFF_MS = Date.parse("2026-05-17T00:00:00+09:00");

/** def 목록 → { key: point_value } 맵 */
export function pointValueMap(defs: StatDef[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const d of defs) m[d.key] = d.point_value ?? 0;
  return m;
}

/**
 * 한 경기 참가기록의 포인트.
 * - 기준일 이전 경기: 직접 입력한 포인트(custom_stats.points) 그대로 사용.
 * - 기준일 이후 경기: Σ(항목 횟수 × 기준점수). goals/assists 는 컬럼,
 *   attendance 는 1(참가), 그 외는 custom_stats. 'points'(합계)는 제외.
 */
export function pointsForParticipation(
  p: {
    goals?: number | null;
    assists?: number | null;
    custom_stats: Record<string, number> | null;
  },
  matchDate: string | null | undefined,
  pointValues: Record<string, number>,
): number {
  const ms = matchDate ? new Date(matchDate).getTime() : Infinity;
  if (ms < POINTS_WEIGHT_CUTOFF_MS) {
    return p.custom_stats?.points ?? 0;
  }
  let sum = 0;
  for (const [key, pv] of Object.entries(pointValues)) {
    if (!pv || key === AGGREGATE_POINT_KEY) continue;
    let count: number;
    if (key === "goals") count = p.goals ?? 0;
    else if (key === "assists") count = p.assists ?? 0;
    else if (key === "attendance") count = p.custom_stats?.attendance ?? 1;
    else count = p.custom_stats?.[key] ?? 0;
    sum += count * pv;
  }
  return sum;
}

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
  defs: StatDef[] = [],
): RichPlayerSeasonStat[] {
  const totalMatches = matches.length;
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const pvMap = pointValueMap(defs);

  // 선수별 participation 들을 match_date desc 로 정렬해 가장 최근 5개 결과 산출
  const partsByPlayer = new Map<string, ParticipationRow[]>();
  for (const p of parts) {
    const arr = partsByPlayer.get(p.player_id) ?? [];
    arr.push(p);
    partsByPlayer.set(p.player_id, arr);
  }

  return base.map((s) => {
    const playerParts = partsByPlayer.get(s.player_id) ?? [];
    const playedPairs = playerParts
      .map((p) => {
        const m = matchById.get(p.match_id);
        return m ? { p, m } : null;
      })
      .filter((x): x is { p: ParticipationRow; m: MatchSummary } => !!x);
    // 승리: custom_stats.win_points > 0 우선, 없으면 일반 경기 점수 기반
    let wins = 0;
    for (const { p, m } of playedPairs) {
      const winPts = p.custom_stats?.win_points ?? 0;
      if (winPts > 0) {
        wins += 1;
      } else if (
        m.opponent !== "자체전" &&
        resultFromScores(m.our_score, m.opponent_score) === "W"
      ) {
        wins += 1;
      }
    }
    const recent5: MatchResult[] = playedPairs
      .slice()
      .sort(
        (a, b) =>
          new Date(b.m.match_date).getTime() -
          new Date(a.m.match_date).getTime(),
      )
      .slice(0, 5)
      .map(({ p, m }) => {
        const winPts = p.custom_stats?.win_points ?? 0;
        if (winPts > 0) return "W";
        if (m.opponent === "자체전") return "L";
        return resultFromScores(m.our_score, m.opponent_score) ?? "D";
      });
    return {
      ...s,
      attackPoints: s.goals + s.assists,
      cleanSheets: s.custom.clean_sheets ?? 0,
      refereeCount: s.custom.referee_count ?? 0,
      mom: s.custom.mom ?? 0,
      wins,
      points: playedPairs.reduce(
        (acc, { p, m }) => acc + pointsForParticipation(p, m.match_date, pvMap),
        0,
      ),
      attendanceRate: totalMatches > 0 ? s.appearances / totalMatches : 0,
      recent5,
    };
  });
}

// 경기/통계는 클럽 운영 기준 KST(서울) 자정 경계로 잘라야 한다.
// 서버(Vercel) 가 UTC 라 new Date(year, 0, 1) 는 UTC 자정이 되어 KST 보다 9시간
// 뒤로 밀린다 → 1/1 새벽 KST 경기가 연도/월 집계에서 누락. 명시적 +09:00
// 으로 KST 경계의 ISO 를 만든다.
const pad2 = (n: number) => String(n).padStart(2, "0");

export function yearRange(year: number) {
  return {
    from: `${year}-01-01T00:00:00+09:00`,
    to: `${year + 1}-01-01T00:00:00+09:00`,
  };
}

/**
 * month: 1~12 면 해당 월, 그 외 값(0 / null)은 연도 전체.
 * KST 기준 월 경계.
 */
export function periodRange(year: number, month: number) {
  if (month < 1 || month > 12) return yearRange(year);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return {
    from: `${year}-${pad2(month)}-01T00:00:00+09:00`,
    to: `${nextYear}-${pad2(nextMonth)}-01T00:00:00+09:00`,
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

/**
 * 시즌 순위 — 표준 경쟁 순위(1,2,2,4 방식): "나보다 값이 큰 사람 수 + 1".
 * 시즌기록 리더보드(season-list)와 동일한 공동순위 규칙. 값이 0 이하면 순위 없음(null).
 * 홈/프로필 카드의 순위 뱃지·메달이 리더보드와 항상 일치하도록 공용으로 사용한다.
 */
export function seasonRank(
  myValue: number,
  allValues: Iterable<number>,
): number | null {
  if (myValue <= 0) return null;
  let greater = 0;
  for (const v of allValues) if (v > myValue) greater += 1;
  return greater + 1;
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
