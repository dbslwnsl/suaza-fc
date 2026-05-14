import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/auth/actions";
import {
  TITLE_BADGE,
  TITLE_LABEL,
  type MemberTitle,
} from "@/lib/members/positions";
import {
  MATCH_STATUS_BADGE,
  MATCH_STATUS_LABEL,
  RESULT_BADGE,
  RESULT_LABEL,
  formatMatchDate,
  getResult,
  type Match,
} from "@/lib/matches/helpers";
import { formatPostDate } from "@/lib/board/helpers";
import { AttendanceVote } from "./matches/[id]/page";

type NoticeRow = {
  id: string;
  title: string;
  created_at: string;
  author: { name: string } | null;
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: profile },
    { data: latestNotice },
    { data: upcomingMatch },
    { data: lastMatch },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, nickname, title, positions")
      .eq("id", user!.id)
      .single(),
    supabase
      .from("posts")
      .select("id, title, created_at, author:profiles(name)")
      .eq("is_notice", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("matches")
      .select("*")
      .eq("status", "scheduled")
      .order("match_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("matches")
      .select("*")
      .eq("status", "done")
      .order("match_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const upcoming = upcomingMatch as Match | null;
  const last = lastMatch as Match | null;
  const notice = latestNotice as unknown as NoticeRow | null;

  // 다가오는 경기 출석 상태/카운트
  let myStatus: string | null = null;
  const counts = { attending: 0, absent: 0, undecided: 0 };
  if (upcoming) {
    const [{ data: all }, { data: mine }] = await Promise.all([
      supabase
        .from("match_attendances")
        .select("status")
        .eq("match_id", upcoming.id),
      supabase
        .from("match_attendances")
        .select("status")
        .eq("match_id", upcoming.id)
        .eq("player_id", user!.id)
        .maybeSingle(),
    ]);
    for (const a of (all ?? []) as { status: keyof typeof counts }[]) {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
    }
    myStatus = (mine as { status: string } | null)?.status ?? null;
  }

  const lastResult = last
    ? getResult(last.our_score, last.opponent_score)
    : null;

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto flex flex-col gap-4">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative w-9 h-9 rounded-full overflow-hidden">
              <Image
                src="/suaza-emblem.png"
                alt="수아자FC"
                fill
                sizes="36px"
                priority
                className="object-cover"
              />
            </div>
            <span className="font-bold text-suaza-ink text-xl">수아자FC</span>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="text-[13px] border border-suaza-border rounded-md px-3 py-1.5 text-suaza-ink hover:bg-gray-50 transition"
            >
              로그아웃
            </button>
          </form>
        </header>

        {/* Profile Card */}
        <section className="bg-white sm:rounded-2xl sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-4 sm:p-6 rounded-xl border sm:border-0 border-suaza-border flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="relative w-14 h-14 rounded-full overflow-hidden shrink-0">
              <Image
                src="/suaza-emblem.png"
                alt={profile?.name ?? "프로필"}
                fill
                sizes="56px"
                className="object-cover"
              />
            </div>
            <div className="flex flex-col gap-1">
              {profile ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-suaza-ink text-lg">
                      {profile.name}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${TITLE_BADGE[(profile.title as MemberTitle) ?? "player"]}`}
                    >
                      {TITLE_LABEL[(profile.title as MemberTitle) ?? "player"]}
                    </span>
                  </div>
                  <span className="text-suaza-ink-muted text-[13px]">
                    {user!.email}
                  </span>
                  {profile.positions && profile.positions.length > 0 && (
                    <span className="text-suaza-ink-muted text-[13px]">
                      포지션: {profile.positions.join(", ")}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="font-bold text-suaza-ink text-lg">
                    {user!.email}
                  </span>
                  <span className="text-amber-700 text-[13px]">
                    ⚠️ 프로필 정보가 없습니다.
                  </span>
                </>
              )}
            </div>
          </div>
          {profile && (
            <Link
              href={`/members/${user!.id}`}
              className="text-[13px] font-bold text-suaza-accent hover:underline"
            >
              내 프로필 수정 →
            </Link>
          )}
        </section>

        {/* Latest Notice */}
        {notice && (
          <Link
            href={`/board/${notice.id}`}
            className="bg-white sm:rounded-2xl sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-4 sm:p-5 rounded-xl border sm:border-0 border-suaza-border hover:bg-gray-50 transition flex flex-col gap-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-2 py-0.5 rounded bg-suaza-accent text-white font-medium">
                공지
              </span>
              <span className="text-xs text-suaza-ink-muted">
                {notice.author?.name ?? ""} · {formatPostDate(notice.created_at)}
              </span>
            </div>
            <span className="font-bold text-suaza-ink">{notice.title}</span>
          </Link>
        )}

        {/* Upcoming Match + Attendance */}
        {upcoming && (
          <section className="bg-white sm:rounded-2xl sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-4 sm:p-5 rounded-xl border sm:border-0 border-suaza-border flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs text-suaza-ink-muted font-medium">
                다가오는 경기
              </h2>
              <span
                className={`text-xs px-2 py-0.5 rounded ${MATCH_STATUS_BADGE[upcoming.status]}`}
              >
                {MATCH_STATUS_LABEL[upcoming.status]}
              </span>
            </div>
            <Link
              href={`/matches/${upcoming.id}`}
              className="flex flex-col gap-1 hover:opacity-80"
            >
              <span className="font-bold text-suaza-ink text-lg">
                vs {upcoming.opponent}
              </span>
              <span className="text-sm text-suaza-ink-muted">
                {formatMatchDate(upcoming.match_date)}
                {upcoming.location && ` · ${upcoming.location}`}
              </span>
            </Link>
            <AttendanceVote
              matchId={upcoming.id}
              redirectTo="/"
              myStatus={myStatus}
              counts={counts}
            />
          </section>
        )}

        {/* Last Match */}
        {last && (
          <Link
            href={`/matches/${last.id}`}
            className="bg-white sm:rounded-2xl sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-4 sm:p-5 rounded-xl border sm:border-0 border-suaza-border hover:bg-gray-50 transition flex flex-col gap-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs text-suaza-ink-muted font-medium">
                최근 경기
              </h2>
              {lastResult && (
                <span
                  className={`text-xs px-2 py-0.5 rounded ${RESULT_BADGE[lastResult]}`}
                >
                  {RESULT_LABEL[lastResult]} {last.our_score}-{last.opponent_score}
                </span>
              )}
            </div>
            <span className="font-bold text-suaza-ink">vs {last.opponent}</span>
            <span className="text-sm text-suaza-ink-muted">
              {formatMatchDate(last.match_date)}
            </span>
          </Link>
        )}
      </div>
    </main>
  );
}
