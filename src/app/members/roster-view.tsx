import { createClient } from "@/lib/supabase/server";
import {
  type MemberTitle,
  type Position,
  type PreferredFoot,
} from "@/lib/members/positions";
import {
  aggregateSeason,
  pointsForParticipation,
  pointValueMap,
  yearRange,
  type ParticipationRow,
  type PlayerSeasonStat,
  type StatDef,
} from "@/lib/stats/helpers";
import { displayMemberName } from "@/lib/members/name";
import RosterList, { type RosterMember } from "./roster-list";

type MemberRow = {
  id: string;
  name: string;
  nickname: string | null;
  title: MemberTitle;
  role: string | null;
  positions: Position[] | null;
  jersey_number: number | null;
  avatar_url: string | null;
  birth_date: string | null;
  preferred_foot: PreferredFoot | null;
  is_injured: boolean | null;
  on_leave: boolean | null;
};

export default async function RosterView({ year }: { year: number }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myId = user?.id ?? null;

  const { from, to } = yearRange(year);

  const { data: members } = await supabase
    .from("profiles")
    .select(
      "id, name, nickname, title, role, positions, jersey_number, avatar_url, birth_date, preferred_foot, is_injured, on_leave",
    )
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const { data: matchesRaw } = await supabase
    .from("matches")
    .select("id, match_date")
    .eq("status", "done")
    .gte("match_date", from)
    .lt("match_date", to);

  const matchIds = (matchesRaw ?? []).map((m) => m.id);
  const matchDateById = new Map(
    ((matchesRaw ?? []) as { id: string; match_date: string }[]).map((m) => [
      m.id,
      m.match_date,
    ]),
  );

  const [{ data: partsRaw }, { data: defsRaw }] = await Promise.all([
    matchIds.length
      ? supabase
          .from("match_participations")
          .select(
            "match_id, player_id, goals, assists, custom_stats, player:profiles(id, name, jersey_number)",
          )
          .in("match_id", matchIds)
          .is("archived_at", null)
      : Promise.resolve({ data: [] as ParticipationRow[] }),
    supabase
      .from("stat_definitions")
      .select("key, label, sort_order, point_value")
      .is("hidden_at", null),
  ]);

  const defs = (defsRaw ?? []) as StatDef[];
  const pvMap = pointValueMap(defs);
  const parts = (partsRaw ?? []) as unknown as ParticipationRow[];
  const aggregated = aggregateSeason(parts, defs);
  const statsMap = new Map<string, PlayerSeasonStat>(
    aggregated.map((s) => [s.player_id, s]),
  );
  // 포인트는 경기별로 계산 (기준일 이전: 수동 입력, 이후: 가중치)
  const pointsByPlayer = new Map<string, number>();
  for (const p of parts) {
    const pts = pointsForParticipation(
      p,
      matchDateById.get(p.match_id),
      pvMap,
    );
    pointsByPlayer.set(p.player_id, (pointsByPlayer.get(p.player_id) ?? 0) + pts);
  }

  // MOM 횟수 — custom_stats.mom 합 (순위 아님, 받은 사람 전부 표기)
  const momByPlayer = new Map<string, number>();
  for (const p of parts) {
    const mom = Number(p.custom_stats?.mom ?? 0);
    if (mom > 0)
      momByPlayer.set(p.player_id, (momByPlayer.get(p.player_id) ?? 0) + mom);
  }

  // ── 월별 MVP — 각 월(KST) 경기 포인트 합이 가장 높은 회원(공동 1위 포함) ──
  const kstMonth = (iso: string): number => {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      month: "numeric",
    }).formatToParts(new Date(iso));
    return Number(p.find((x) => x.type === "month")?.value ?? "0");
  };
  const matchMonthById = new Map<string, number>();
  for (const m of (matchesRaw ?? []) as { id: string; match_date: string }[]) {
    matchMonthById.set(m.id, kstMonth(m.match_date));
  }
  // month -> (playerId -> points)
  const monthPlayerPoints = new Map<number, Map<string, number>>();
  for (const p of parts) {
    const mo = matchMonthById.get(p.match_id);
    if (!mo) continue;
    const pts = pointsForParticipation(p, matchDateById.get(p.match_id), pvMap);
    let mp = monthPlayerPoints.get(mo);
    if (!mp) {
      mp = new Map();
      monthPlayerPoints.set(mo, mp);
    }
    mp.set(p.player_id, (mp.get(p.player_id) ?? 0) + pts);
  }
  // playerId -> 그 회원이 MVP인 월 목록
  const mvpMonthsByPlayer = new Map<string, number[]>();
  for (const [mo, mp] of monthPlayerPoints) {
    let max = 0;
    for (const v of mp.values()) if (v > max) max = v;
    if (max <= 0) continue;
    for (const [pid, v] of mp) {
      if (v === max) {
        const arr = mvpMonthsByPlayer.get(pid) ?? [];
        arr.push(mo);
        mvpMonthsByPlayer.set(pid, arr);
      }
    }
  }

  const raw = (members ?? []) as MemberRow[];
  const sorted = myId
    ? [
        ...raw.filter((m) => m.id === myId),
        ...raw.filter((m) => m.id !== myId),
      ]
    : raw;

  if (sorted.length === 0) {
    return (
      <p className="text-suaza-ink-muted text-sm">등록된 회원이 없습니다.</p>
    );
  }

  // 시즌 카테고리별 1위(공동 1위 포함). 값이 0이면 왕 없음.
  function pickKings(getter: (s: PlayerSeasonStat) => number): Set<string> {
    let max = 0;
    for (const s of statsMap.values()) {
      const v = getter(s);
      if (v > max) max = v;
    }
    if (max <= 0) return new Set();
    const out = new Set<string>();
    for (const s of statsMap.values()) {
      if (getter(s) === max) out.add(s.player_id);
    }
    return out;
  }
  const goalKings = pickKings((s) => s.goals ?? 0);
  const assistKings = pickKings((s) => s.assists ?? 0);
  const cleanSheetKings = pickKings((s) => s.custom.clean_sheets ?? 0);
  const refereeKings = pickKings((s) => s.custom.referee_count ?? 0);

  // 시즌 카테고리별 1~3위. 동점은 같은 순위(상위 3개 '값'까지만). 값 0 은 순위 없음.
  function pickRanks(
    getter: (s: PlayerSeasonStat) => number,
  ): Map<string, number> {
    const distinct = [
      ...new Set([...statsMap.values()].map(getter).filter((v) => v > 0)),
    ]
      .sort((a, b) => b - a)
      .slice(0, 3);
    const out = new Map<string, number>();
    for (const s of statsMap.values()) {
      const v = getter(s);
      if (v <= 0) continue;
      const idx = distinct.indexOf(v);
      if (idx >= 0) out.set(s.player_id, idx + 1);
    }
    return out;
  }
  const goalRanks = pickRanks((s) => s.goals ?? 0);
  const assistRanks = pickRanks((s) => s.assists ?? 0);
  const cleanSheetRanks = pickRanks((s) => s.custom.clean_sheets ?? 0);
  const refereeRanks = pickRanks((s) => s.custom.referee_count ?? 0);
  const appearanceRanks = pickRanks((s) => s.appearances ?? 0);

  const list: RosterMember[] = sorted.map((m) => {
    const stat = statsMap.get(m.id);
    return {
      id: m.id,
      name: m.name,
      displayName: displayMemberName(m.name),
      initial: m.name.charAt(0),
      nickname: m.nickname,
      title: m.title,
      role: m.role,
      positions: (m.positions ?? []) as Position[],
      jerseyNumber: m.jersey_number,
      avatarUrl: m.avatar_url,
      birthDate: m.birth_date,
      preferredFoot: m.preferred_foot,
      isInjured: m.is_injured ?? false,
      onLeave: m.on_leave ?? false,
      appearances: stat?.appearances ?? 0,
      goals: stat?.goals ?? 0,
      assists: stat?.assists ?? 0,
      cleanSheets: stat?.custom.clean_sheets ?? 0,
      points: pointsByPlayer.get(m.id) ?? 0,
      isGoalKing: goalKings.has(m.id),
      isAssistKing: assistKings.has(m.id),
      isCleanSheetKing: cleanSheetKings.has(m.id),
      isRefereeKing: refereeKings.has(m.id),
      mvpMonths: (mvpMonthsByPlayer.get(m.id) ?? []).sort((a, b) => a - b),
      ranks: {
        appearances: appearanceRanks.get(m.id) ?? null,
        goals: goalRanks.get(m.id) ?? null,
        assists: assistRanks.get(m.id) ?? null,
        cleanSheets: cleanSheetRanks.get(m.id) ?? null,
        referee: refereeRanks.get(m.id) ?? null,
      },
      momCount: momByPlayer.get(m.id) ?? 0,
    };
  });

  return <RosterList members={list} myId={myId} />;
}
