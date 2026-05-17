import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/page-header";
import {
  MATCH_STATUS_BADGE,
  MATCH_STATUS_LABEL,
  RESULT_BADGE,
  RESULT_LABEL,
  formatMatchDate,
  getResult,
  type Match,
} from "@/lib/matches/helpers";

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: matches }, { data: me }] = await Promise.all([
    supabase
      .from("matches")
      .select("*")
      .order("match_date", { ascending: false }),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
  ]);

  const isStaff = me?.role === "manager" || me?.role === "coach";
  const all = (matches ?? []) as Match[];
  const upcoming = all
    .filter((m) => m.status === "scheduled")
    .slice()
    .reverse();
  const past = all.filter((m) => m.status !== "scheduled");

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[800px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-8">
        <PageHeader
          title="경기 일정 / 결과"
          right={
            isStaff && (
              <Link
                href="/matches/new"
                className="text-sm bg-suaza-button text-white rounded-lg px-3.5 py-2 font-medium hover:opacity-90"
              >
                + 새 경기
              </Link>
            )
          }
        />

        {message && (
          <p className="-mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
            {message}
          </p>
        )}
        {error && (
          <p className="-mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </p>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-suaza-ink">예정된 경기</h2>
          {upcoming.length === 0 ? (
            <p className="text-suaza-ink-muted text-sm">
              예정된 경기가 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {upcoming.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-suaza-ink">지난 경기</h2>
          {past.length === 0 ? (
            <p className="text-suaza-ink-muted text-sm">지난 경기가 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {past.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function MatchCard({ match }: { match: Match }) {
  const result =
    match.status === "done"
      ? getResult(match.our_score, match.opponent_score)
      : null;
  return (
    <li>
      <Link
        href={`/matches/${match.id}`}
        className="block p-4 border border-suaza-border rounded-lg hover:bg-gray-50 transition"
      >
        <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
          <span className="font-bold text-suaza-ink text-base">
            vs {match.opponent}
          </span>
          <div className="flex items-center gap-1.5">
            {result && (
              <span
                className={`text-xs px-2 py-0.5 rounded ${RESULT_BADGE[result]}`}
              >
                {RESULT_LABEL[result]} {match.our_score}-{match.opponent_score}
              </span>
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded ${MATCH_STATUS_BADGE[match.status]}`}
            >
              {MATCH_STATUS_LABEL[match.status]}
            </span>
          </div>
        </div>
        <div className="text-sm text-suaza-ink-muted">
          {formatMatchDate(match.match_date)}
          {match.location && <span> · {match.location}</span>}
        </div>
      </Link>
    </li>
  );
}
