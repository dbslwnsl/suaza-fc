import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  aggregateSeason,
  yearRange,
  type ParticipationRow,
  type StatDef,
} from "@/lib/stats/helpers";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function SeasonView({
  year,
  years,
  sort = "goals",
}: {
  year: number;
  years: number[];
  sort?: string;
}) {
  const supabase = await createClient();
  const { from, to } = yearRange(year);

  // 1. 해당 연도 종료 경기
  const { data: matchesRaw } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "done")
    .gte("match_date", from)
    .lt("match_date", to);

  const matchIds = (matchesRaw ?? []).map((m) => m.id);

  // 2. 그 경기들의 선수 기록 + stat 정의
  const [{ data: partsRaw }, { data: defsRaw }] = await Promise.all([
    matchIds.length === 0
      ? Promise.resolve({ data: [] as ParticipationRow[] })
      : supabase
          .from("match_participations")
          .select(
            "match_id, player_id, goals, assists, custom_stats, player:profiles(id, name, jersey_number)",
          )
          .in("match_id", matchIds),
    supabase
      .from("stat_definitions")
      .select("key, label, sort_order")
      .order("sort_order", { ascending: true })
      .order("key", { ascending: true }),
  ]);

  const defs = (defsRaw ?? []) as StatDef[];
  const stats = aggregateSeason(
    (partsRaw ?? []) as unknown as ParticipationRow[],
    defs,
  );

  stats.sort((a, b) => {
    if (sort === "name") {
      return a.name.localeCompare(b.name, "ko");
    }
    let av: number, bv: number;
    if (sort === "appearances") {
      av = a.appearances;
      bv = b.appearances;
    } else if (sort === "assists") {
      av = a.assists;
      bv = b.assists;
    } else if (defs.some((d) => d.key === sort)) {
      av = a.custom[sort] ?? 0;
      bv = b.custom[sort] ?? 0;
    } else {
      av = a.goals;
      bv = b.goals;
    }
    if (bv !== av) return bv - av;
    return (a.jersey_number ?? 9999) - (b.jersey_number ?? 9999);
  });

  const showMedals = sort !== "name";

  return (
    <section className="flex flex-col gap-4">
      <YearSelector year={year} years={years} tab="season" sort={sort} />

      {stats.length === 0 ? (
        <p className="text-suaza-ink-muted text-sm">
          {year}년 종료된 경기 기록이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <Th className="text-left w-10">#</Th>
                <SortTh
                  label="선수"
                  sortKey="name"
                  current={sort}
                  year={year}
                  align="left"
                />
                <SortTh label="출전" sortKey="appearances" current={sort} year={year} />
                <SortTh label="골" sortKey="goals" current={sort} year={year} />
                <SortTh label="어시" sortKey="assists" current={sort} year={year} />
                {defs.map((d) => (
                  <SortTh
                    key={d.key}
                    label={d.label}
                    sortKey={d.key}
                    current={sort}
                    year={year}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => (
                <tr key={s.player_id}>
                  <Td className="text-suaza-ink-muted">
                    {showMedals ? (MEDALS[i] ?? i + 1) : i + 1}
                  </Td>
                  <Td>
                    <Link
                      href={`/members/${s.player_id}`}
                      className="text-suaza-ink hover:underline whitespace-nowrap"
                    >
                      {s.jersey_number != null && (
                        <span className="text-suaza-ink-muted text-xs mr-1">
                          #{s.jersey_number}
                        </span>
                      )}
                      <span className="font-medium">{s.name}</span>
                    </Link>
                  </Td>
                  <Td className="text-center">{s.appearances}</Td>
                  <Td className="text-center font-bold text-suaza-ink">
                    {s.goals}
                  </Td>
                  <Td className="text-center">{s.assists}</Td>
                  {defs.map((d) => (
                    <Td key={d.key} className="text-center">
                      {s.custom[d.key] ?? 0}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function YearSelector({
  year,
  years,
  tab,
  sort,
}: {
  year: number;
  years: number[];
  tab: "season" | "matches";
  sort?: string;
}) {
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
        {years.map((y) => {
          const params = new URLSearchParams();
          params.set("tab", tab);
          params.set("year", String(y));
          if (sort && sort !== "goals") params.set("sort", sort);
          return (
            <Link
              key={y}
              href={`/members?${params.toString()}`}
              className={`px-2.5 py-1 rounded text-xs transition ${
                y === year
                  ? "bg-suaza-button text-white"
                  : "border border-suaza-border text-suaza-ink hover:bg-gray-50"
              }`}
            >
              {y}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`py-2 px-2 text-suaza-ink-muted font-medium border-b border-suaza-border ${className}`}
    >
      {children}
    </th>
  );
}

function SortTh({
  label,
  sortKey,
  current,
  year,
  align = "center",
}: {
  label: string;
  sortKey: string;
  current: string;
  year: number;
  align?: "left" | "center";
}) {
  const active = current === sortKey;
  return (
    <th
      className={`py-2 px-2 text-suaza-ink-muted font-medium border-b border-suaza-border ${
        align === "left" ? "text-left" : "text-center min-w-[80px] w-[80px]"
      }`}
    >
      <Link
        href={`/members?tab=season&year=${year}&sort=${sortKey}`}
        className={`inline-flex items-center gap-0.5 whitespace-nowrap hover:text-suaza-ink ${
          active ? "text-suaza-ink font-bold" : ""
        }`}
      >
        {label}
        {active && <span className="text-[10px]">▼</span>}
      </Link>
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`py-2 px-2 text-suaza-ink border-b border-suaza-border/60 ${className}`}
    >
      {children}
    </td>
  );
}
