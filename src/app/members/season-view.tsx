import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  aggregateSeason,
  periodRange,
  type ParticipationRow,
  type PlayerSeasonStat,
  type StatDef,
} from "@/lib/stats/helpers";
import MonthSelect from "./month-select";
import { TAG_ACTIVE, TAG_DEFAULT, TAG_HOVER } from "@/lib/ui/tag-class";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function SeasonView({
  year,
  years,
  sort = "goals",
  month = 0,
}: {
  year: number;
  years: number[];
  sort?: string;
  month?: number;
}) {
  const supabase = await createClient();
  const { from, to } = periodRange(year, month);

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
  const aggregated = aggregateSeason(
    (partsRaw ?? []) as unknown as ParticipationRow[],
    defs,
  );

  // 모든 회원 명단을 받아 출전 없는 사람도 0 으로 채움
  const { data: allMembersRaw } = await supabase
    .from("profiles")
    .select("id, name, jersey_number")
    .order("name", { ascending: true });

  const statsMap = new Map(aggregated.map((s) => [s.player_id, s]));
  const stats: PlayerSeasonStat[] = (allMembersRaw ?? []).map(
    (m) =>
      statsMap.get(m.id) ?? {
        player_id: m.id,
        name: m.name,
        jersey_number: m.jersey_number,
        appearances: 0,
        goals: 0,
        assists: 0,
        custom: {},
      },
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
      <div className="flex items-center gap-3 flex-wrap text-sm">
        <YearSelector year={year} years={years} sort={sort} month={month} />
        <MonthSelect year={year} month={month} sort={sort} />
      </div>

      {stats.length === 0 ? (
        <p className="text-suaza-ink-muted text-sm">
          등록된 회원이 없습니다.
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
                  month={month}
                  align="left"
                />
                <SortTh
                  label="출전"
                  sortKey="appearances"
                  current={sort}
                  year={year}
                  month={month}
                />
                <SortTh
                  label="골"
                  sortKey="goals"
                  current={sort}
                  year={year}
                  month={month}
                />
                <SortTh
                  label="어시"
                  sortKey="assists"
                  current={sort}
                  year={year}
                  month={month}
                />
                {defs.map((d) => (
                  <SortTh
                    key={d.key}
                    label={d.label}
                    sortKey={d.key}
                    current={sort}
                    year={year}
                    month={month}
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
  sort,
  month,
}: {
  year: number;
  years: number[];
  sort?: string;
  month?: number;
}) {
  if (years.length === 0) {
    return (
      <span className="text-suaza-ink-muted">기록된 연도가 없습니다.</span>
    );
  }
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {years.map((y) => {
        const params = new URLSearchParams();
        params.set("tab", "season");
        params.set("year", String(y));
        if (month && month >= 1 && month <= 12)
          params.set("month", String(month));
        if (sort && sort !== "goals") params.set("sort", sort);
        return (
          <Link
            key={y}
            href={`/members?${params.toString()}`}
            className={`${y === year ? TAG_ACTIVE : `${TAG_DEFAULT} ${TAG_HOVER}`} transition`}
          >
            {y}
          </Link>
        );
      })}
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
  month,
  align = "center",
}: {
  label: string;
  sortKey: string;
  current: string;
  year: number;
  month: number;
  align?: "left" | "center";
}) {
  const active = current === sortKey;
  const params = new URLSearchParams();
  params.set("tab", "season");
  params.set("year", String(year));
  if (month >= 1 && month <= 12) params.set("month", String(month));
  params.set("sort", sortKey);
  return (
    <th
      className={`py-2 px-2 text-suaza-ink-muted font-medium border-b border-suaza-border ${
        align === "left" ? "text-left" : "text-center min-w-[80px] w-[80px]"
      }`}
    >
      <Link
        href={`/members?${params.toString()}`}
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
