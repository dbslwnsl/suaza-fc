import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { shortDate, yearRange } from "@/lib/stats/helpers";
import { displayMemberName } from "@/lib/members/name";

type MatchRow = {
  id: string;
  match_date: string;
  opponent: string;
  our_score: number | null;
  opponent_score: number | null;
};

type Member = {
  id: string;
  name: string;
  jersey_number: number | null;
};

type ParticipationRow = {
  match_id: string;
  player_id: string;
  goals: number;
  assists: number;
  custom_stats: Record<string, number> | null;
};

type CellData = { goals: number; assists: number; cleanSheets: number };

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
          .in("match_id", matchIds),
    supabase
      .from("profiles")
      .select("id, name, jersey_number")
      .order("name", { ascending: true }),
  ]);

  const parts = (partsRaw ?? []) as ParticipationRow[];
  const rawMembers = (membersRaw ?? []) as Member[];
  // 본인을 항상 맨 위로
  const members = myId
    ? [
        ...rawMembers.filter((m) => m.id === myId),
        ...rawMembers.filter((m) => m.id !== myId),
      ]
    : rawMembers;

  // 인덱스: player_id -> match_id -> CellData
  const cells = new Map<string, Map<string, CellData>>();
  for (const p of parts) {
    let row = cells.get(p.player_id);
    if (!row) {
      row = new Map();
      cells.set(p.player_id, row);
    }
    row.set(p.match_id, {
      goals: p.goals ?? 0,
      assists: p.assists ?? 0,
      cleanSheets: p.custom_stats?.clean_sheets ?? 0,
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <YearSelector year={year} years={years} />

      {matches.length === 0 ? (
        <p className="text-suaza-ink-muted text-sm">
          {year}년 종료된 경기가 없습니다.
        </p>
      ) : (
        <>
          <Legend />
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <table className="text-xs sm:text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white py-2 px-2 text-left text-suaza-ink-muted font-medium border-b border-r border-suaza-border min-w-[110px]">
                    선수
                  </th>
                  {matches.map((m) => (
                    <th
                      key={m.id}
                      className="py-2 px-2 text-suaza-ink-muted font-normal border-b border-suaza-border min-w-[68px] align-bottom"
                    >
                      <Link
                        href={`/matches/${m.id}`}
                        className="flex flex-col items-center hover:underline"
                      >
                        <span className="font-medium text-suaza-ink">
                          {shortDate(m.match_date)}
                        </span>
                        <span className="text-[10px] text-suaza-ink-faint whitespace-nowrap">
                          vs {m.opponent}
                        </span>
                        {m.our_score != null && m.opponent_score != null && (
                          <span className="text-[10px] text-suaza-ink-faint">
                            {m.our_score}-{m.opponent_score}
                          </span>
                        )}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const row = cells.get(m.id);
                  const isMe = m.id === myId;
                  return (
                    <tr key={m.id} className={isMe ? "bg-red-50" : ""}>
                      <td
                        className={`sticky left-0 z-10 py-2 px-2 border-b border-r border-suaza-border whitespace-nowrap ${
                          isMe ? "bg-red-50" : "bg-white"
                        }`}
                      >
                        <Link
                          href={`/members/${m.id}`}
                          className="inline-flex items-baseline gap-1.5 text-suaza-ink hover:underline"
                        >
                          <span className="inline-block w-6 text-right text-suaza-ink-muted text-[10px]">
                            {m.jersey_number != null
                              ? `#${m.jersey_number}`
                              : ""}
                          </span>
                          <span>{displayMemberName(m.name)}</span>
                        </Link>
                      </td>
                      {matches.map((mt) => {
                        const cell = row?.get(mt.id);
                        return (
                          <td
                            key={mt.id}
                            className="py-2 px-2 text-center border-b border-suaza-border/60"
                          >
                            <CellMark cell={cell} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function CellMark({ cell }: { cell: CellData | undefined }) {
  if (!cell) return <span className="text-suaza-ink-faint">·</span>;
  if (cell.goals === 0 && cell.assists === 0 && cell.cleanSheets === 0)
    return <span className="text-suaza-ink-muted">○</span>;
  return (
    <span className="whitespace-nowrap text-xs sm:text-sm">
      {cell.goals > 0 && (
        <span>⚽{cell.goals > 1 ? cell.goals : ""}</span>
      )}
      {cell.assists > 0 && (
        <span className="ml-0.5">🅰{cell.assists > 1 ? cell.assists : ""}</span>
      )}
      {cell.cleanSheets > 0 && (
        <span className="ml-0.5">🛡️{cell.cleanSheets > 1 ? cell.cleanSheets : ""}</span>
      )}
    </span>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-suaza-ink-faint flex-wrap">
      <span>⚽ 골</span>
      <span>🅰 어시</span>
      <span>🛡️ 클린시트</span>
      <span>○ 출전</span>
      <span>· 미출전</span>
    </div>
  );
}

function YearSelector({ year, years }: { year: number; years: number[] }) {
  if (years.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-suaza-ink-muted">기록된 연도가 없습니다.</span>
      </div>
    );
  }
  return (
    <div className="flex gap-1 flex-wrap">
      {years.map((y) => (
        <Link
          key={y}
          href={`/members?tab=matches&year=${y}`}
          className={`px-2.5 py-1 rounded text-xs transition ${
            y === year
              ? "bg-suaza-button text-white"
              : "border border-suaza-border text-suaza-ink hover:bg-gray-50"
          }`}
        >
          {y}
        </Link>
      ))}
    </div>
  );
}
