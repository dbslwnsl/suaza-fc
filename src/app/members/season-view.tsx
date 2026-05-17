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
import { displayMemberName } from "@/lib/members/name";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function SeasonView({
  year,
  years,
  sort = "name",
  month = 0,
  order = "desc",
}: {
  year: number;
  years: number[];
  sort?: string;
  month?: number;
  order?: "asc" | "desc";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myId = user?.id ?? null;
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
          .in("match_id", matchIds)
          .is("archived_at", null),
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
      // 기본 정렬(가나다)에선 본인을 항상 맨 위로
      if (myId) {
        if (a.player_id === myId && b.player_id !== myId) return -1;
        if (b.player_id === myId && a.player_id !== myId) return 1;
      }
      return a.name.localeCompare(b.name, "ko");
    }
    let av: number, bv: number;
    if (sort === "appearances") {
      av = a.appearances;
      bv = b.appearances;
    } else if (sort === "assists") {
      av = a.assists;
      bv = b.assists;
    } else if (sort === "goals") {
      av = a.goals;
      bv = b.goals;
    } else if (defs.some((d) => d.key === sort)) {
      av = a.custom[sort] ?? 0;
      bv = b.custom[sort] ?? 0;
    } else {
      av = a.goals;
      bv = b.goals;
    }
    if (av !== bv) return order === "asc" ? av - bv : bv - av;
    return a.name.localeCompare(b.name, "ko");
  });

  const showMedals = sort !== "name" && order === "desc";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap text-sm">
        <YearSelector
          year={year}
          years={years}
          sort={sort}
          month={month}
          order={order}
        />
        <MonthSelect year={year} month={month} sort={sort} order={order} />
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
                  order={order}
                  year={year}
                  month={month}
                />
                <SortTh
                  label="출전"
                  sortKey="appearances"
                  current={sort}
                  order={order}
                  year={year}
                  month={month}
                />
                <SortTh
                  label="골"
                  sortKey="goals"
                  current={sort}
                  order={order}
                  year={year}
                  month={month}
                />
                <SortTh
                  label="어시"
                  sortKey="assists"
                  current={sort}
                  order={order}
                  year={year}
                  month={month}
                />
                {defs.map((d) => (
                  <SortTh
                    key={d.key}
                    label={d.label}
                    sortKey={d.key}
                    current={sort}
                    order={order}
                    year={year}
                    month={month}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => {
                const isMe = s.player_id === myId;
                return (
                <tr key={s.player_id} className={isMe ? "bg-red-50" : ""}>
                  <Td className="text-suaza-ink-muted">
                    {showMedals ? (MEDALS[i] ?? i + 1) : i + 1}
                  </Td>
                  <Td>
                    <Link
                      href={`/members/${s.player_id}`}
                      className="inline-flex items-baseline gap-1.5 text-suaza-ink hover:underline whitespace-nowrap"
                    >
                      <span className="inline-block w-7 text-right text-suaza-ink-muted text-xs">
                        {s.jersey_number != null ? `#${s.jersey_number}` : ""}
                      </span>
                      <span className="font-medium">{displayMemberName(s.name)}</span>
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
                );
              })}
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
  order,
}: {
  year: number;
  years: number[];
  sort?: string;
  month?: number;
  order?: "asc" | "desc";
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
        if (sort && sort !== "name") params.set("sort", sort);
        if (order === "asc") params.set("order", "asc");
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
  order,
  year,
  month,
  align = "center",
}: {
  label: string;
  sortKey: string;
  current: string;
  order: "asc" | "desc";
  year: number;
  month: number;
  align?: "left" | "center";
}) {
  const active = current === sortKey;
  const isNameCol = sortKey === "name";

  // 데이터 컬럼: 클릭 시 desc → asc → default(name=가나다)
  // 선수 컬럼: 항상 default 로 리셋
  let nextSort = sortKey;
  let nextOrder: "asc" | "desc" = "desc";
  if (isNameCol) {
    nextSort = "name";
  } else if (active && order === "desc") {
    nextOrder = "asc";
  } else if (active && order === "asc") {
    nextSort = "name";
  }

  const params = new URLSearchParams();
  params.set("tab", "season");
  params.set("year", String(year));
  if (month >= 1 && month <= 12) params.set("month", String(month));
  if (nextSort !== "name") params.set("sort", nextSort);
  if (nextOrder === "asc" && nextSort !== "name") params.set("order", "asc");

  const arrow = active && !isNameCol ? (order === "asc" ? "▲" : "▼") : null;

  return (
    <th
      className={`py-2 px-2 text-suaza-ink-muted font-medium border-b border-suaza-border ${
        align === "left"
          ? "text-left"
          : isNameCol
            ? "text-center"
            : "text-center min-w-[80px] w-[80px]"
      }`}
    >
      <Link
        href={`/members?${params.toString()}`}
        className={`inline-flex items-center gap-0.5 whitespace-nowrap hover:text-suaza-ink ${
          active && !isNameCol ? "text-suaza-ink font-bold" : ""
        }`}
      >
        {label}
        {arrow && <span className="text-[10px]">{arrow}</span>}
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
