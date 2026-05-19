import { createClient } from "@/lib/supabase/server";
import {
  type MemberTitle,
  type Position,
} from "@/lib/members/positions";
import {
  aggregateSeason,
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
  positions: Position[] | null;
  jersey_number: number | null;
  avatar_url: string | null;
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
      "id, name, nickname, title, positions, jersey_number, avatar_url",
    )
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const { data: matchesRaw } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "done")
    .gte("match_date", from)
    .lt("match_date", to);

  const matchIds = (matchesRaw ?? []).map((m) => m.id);

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
      .select("key, label, sort_order"),
  ]);

  const defs = (defsRaw ?? []) as StatDef[];
  const aggregated = aggregateSeason(
    (partsRaw ?? []) as unknown as ParticipationRow[],
    defs,
  );
  const statsMap = new Map<string, PlayerSeasonStat>(
    aggregated.map((s) => [s.player_id, s]),
  );

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

  const list: RosterMember[] = sorted.map((m) => {
    const stat = statsMap.get(m.id);
    return {
      id: m.id,
      name: m.name,
      displayName: displayMemberName(m.name),
      initial: m.name.charAt(0),
      nickname: m.nickname,
      title: m.title,
      positions: (m.positions ?? []) as Position[],
      jerseyNumber: m.jersey_number,
      avatarUrl: m.avatar_url,
      appearances: stat?.appearances ?? 0,
      goals: stat?.goals ?? 0,
      assists: stat?.assists ?? 0,
      cleanSheets: stat?.custom.clean_sheets ?? 0,
      points: stat?.custom.points ?? 0,
    };
  });

  return <RosterList members={list} myId={myId} />;
}
