import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { shortDate, yearRange } from "@/lib/stats/helpers";

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
  const { from, to } = yearRange(year);

  const { data: matchesRaw } = await supabase
    .from("matches")
    .select("id, match_date, opponent, our_score, opponent_score")
    .eq("status", "done")
    .gte("match_date", from)
    .lt("match_date", to)
    .order("match_date", { ascending: true });

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
      .order("jersey_number", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true }),
  ]);

  const parts = (partsRaw ?? []) as ParticipationRow[];
  const members = (membersRaw ?? []) as Member[];

  // 출전 있는 선수만
  const playedIds = new Set(parts.map((p) => p.player_id));
  const playedMembers = members.filter((m) => playedIds.has(m.id));

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
      ) : playedMembers.length === 0 ? (
        <p className="text-suaza-ink-muted text-sm">기록된 출전이 없습니다.</p>
      ) : (
        <>
          <Legend />
          <p className="text-xs text-suaza-ink-faint">
            ← 가로로 스크롤해서 모든 경기를 확인하세요
          </p>
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
                {playedMembers.map((m) => {
                  const row = cells.get(m.id);
                  return (
                    <tr key={m.id}>
                      <td className="sticky left-0 z-10 bg-white py-2 px-2 border-b border-r border-suaza-border whitespace-nowrap">
                        <Link
                          href={`/members/${m.id}`}
                          className="text-suaza-ink hover:underline"
                        >
                          {m.jersey_number != null && (
                            <span className="text-suaza-ink-muted text-[10px] mr-1">
                              #{m.jersey_number}
                            </span>
                          )}
                          {m.name}
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
    <div className="flex items-center gap-2 flex-wrap text-sm">
      <span className="text-suaza-ink-muted">연도:</span>
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
    </div>
  );
}
