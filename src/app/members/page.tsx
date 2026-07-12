import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RosterView from "./roster-view";
import SeasonView from "./season-view";
import MatchesView from "./matches-view";

const TABS = ["roster", "season", "matches"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  roster: "회원명단",
  season: "시즌기록",
  matches: "경기기록",
};

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    year?: string;
  }>;
}) {
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as Tab)
    : "roster";

  // 사용 가능한 연도 (종료된 경기 기준)
  const supabase = await createClient();
  const { data: yearRows } = await supabase
    .from("matches")
    .select("match_date")
    .eq("status", "done")
    .order("match_date", { ascending: false });

  const years = Array.from(
    new Set(
      (yearRows ?? []).map((r) => new Date(r.match_date).getFullYear()),
    ),
  );

  const requestedYear = sp.year ? Number(sp.year) : NaN;
  const year =
    Number.isFinite(requestedYear) && years.includes(requestedYear)
      ? requestedYear
      : (years[0] ?? new Date().getFullYear());

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[800px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex items-center gap-3">
          <svg
            className="w-9 h-9 text-suaza-ink shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            회원&기록
          </h1>
        </header>

        <nav className="flex border-b border-suaza-border -mb-2">
          {TABS.map((t) => {
            const active = tab === t;
            const href = t === "roster" ? "/members" : `/members?tab=${t}`;
            return (
              <Link
                key={t}
                href={href}
                className={`flex-1 text-center px-2 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                  active
                    ? "border-suaza-button text-suaza-ink"
                    : "border-transparent text-suaza-ink-muted hover:text-suaza-ink"
                }`}
              >
                {TAB_LABEL[t]}
              </Link>
            );
          })}
        </nav>

        {tab === "roster" && <RosterView year={year} />}
        {tab === "season" && <SeasonView year={year} years={years} />}
        {tab === "matches" && <MatchesView year={year} years={years} />}
      </div>
    </main>
  );
}

