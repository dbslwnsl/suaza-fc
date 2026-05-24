import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type Match } from "@/lib/matches/helpers";
import { fetchWeather } from "@/lib/weather";
import PastMatchesSection from "./past-matches-section";
import UpcomingMatchesSection from "./upcoming-matches-section";

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

  // 시각이 지난 경기 자동 진행/완료 처리 (조회 전)
  await supabase.rpc("auto_progress_due_matches");

  const [{ data: matches }, { data: me }] = await Promise.all([
    supabase
      .from("matches")
      .select("*")
      .order("match_date", { ascending: true }),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
  ]);

  const isStaff = me?.role === "manager" || me?.role === "coach";
  const all = (matches ?? []) as Match[];

  const live = all
    .filter((m) => m.status === "in_progress")
    .sort(
      (a, b) =>
        new Date(a.match_date).getTime() - new Date(b.match_date).getTime(),
    );
  const upcoming = all
    .filter((m) => m.status === "scheduled")
    .sort(
      (a, b) =>
        new Date(a.match_date).getTime() - new Date(b.match_date).getTime(),
    );
  const past = all
    .filter((m) => m.status === "done" || m.status === "canceled")
    .sort(
      (a, b) =>
        new Date(b.match_date).getTime() - new Date(a.match_date).getTime(),
    );

  // 예정된 경기 각각의 날씨 (병렬 fetch — Open-Meteo 16일 예보 한도 / 캐시는 라이브러리 내부)
  const upcomingWeathers = await Promise.all(
    upcoming.map((m) => fetchWeather(m.location, m.match_date)),
  );

  return (
    <main className="flex-1 bg-white desktop:bg-suaza-bg px-6 desktop:px-8 py-8 desktop:py-12">
      <div className="max-w-[800px] desktop:max-w-[1200px] mx-auto flex flex-col gap-8 desktop:gap-10">
        {/* Header */}
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <Link
              href="/"
              aria-label="홈으로"
              className="relative w-9 h-9 desktop:w-12 desktop:h-12 rounded-full overflow-hidden block hover:opacity-80 transition shrink-0 desktop:mt-1"
            >
              <Image
                src="/suaza-emblem.png"
                alt="홈"
                fill
                sizes="48px"
                className="object-cover"
              />
            </Link>
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl desktop:text-[32px] font-bold text-suaza-ink leading-tight">
                일정 & 결과
              </h1>
              <p className="hidden desktop:block text-sm text-suaza-ink-muted">
                진행 중인 경기, 다가오는 일정, 지난 결과를 한눈에 확인하세요.
              </p>
            </div>
          </div>
          {isStaff && (
            <Link
              href="/matches/new"
              className="text-xs desktop:text-sm bg-suaza-ink text-white rounded-lg px-2.5 desktop:px-4 py-1 desktop:py-2.5 font-medium hover:opacity-90 transition shrink-0 whitespace-nowrap self-center"
            >
              + 새 경기
            </Link>
          )}
        </header>

        {message && (
          <p className="-mt-2 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
            {message}
          </p>
        )}
        {error && (
          <p className="-mt-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </p>
        )}

        {/* 진행중인 경기 */}
        {live.length > 0 && (
          <section className="flex flex-col gap-4">
            <SectionHeader
              dotColor="#EF3E3E"
              title="진행중인 경기"
              count={live.length}
            />
            <div className="flex flex-col gap-4">
              {live.map((m) => (
                <LiveMatchCard key={m.id} match={m} />
              ))}
            </div>
          </section>
        )}

        {/* 예정된 경기 */}
        {upcoming.length > 0 && (
          <UpcomingMatchesSection
            matches={upcoming}
            weathers={upcomingWeathers}
          />
        )}

        {/* 지난 경기 */}
        {past.length > 0 && <PastMatchesSection matches={past} />}

        {/* Empty state */}
        {live.length === 0 && upcoming.length === 0 && past.length === 0 && (
          <p className="text-suaza-ink-muted text-sm text-center py-12">
            등록된 경기가 없습니다.
          </p>
        )}
      </div>
    </main>
  );
}

function SectionHeader({
  dotColor,
  title,
  count,
}: {
  dotColor?: string;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {dotColor && (
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}
      <h2 className="text-lg font-bold text-suaza-ink">{title}</h2>
      {count != null && (
        <span className="text-sm text-suaza-ink-muted">· {count}경기</span>
      )}
    </div>
  );
}

function LiveMatchCard({ match }: { match: Match }) {
  const isIntra = match.opponent === "자체전";
  const totalMin = (match.duration_hours ?? 2) * 60;
  const halfPoint = totalMin / 2;
  const elapsedMin = Math.max(
    0,
    Math.floor((Date.now() - new Date(match.match_date).getTime()) / 60000),
  );
  const period = elapsedMin < halfPoint ? "전반" : "후반";
  const periodMin = elapsedMin < halfPoint ? elapsedMin : elapsedMin - halfPoint;
  const periodLabel = `${period} ${periodMin}'`;

  const ourScore = match.our_score ?? 0;
  const oppScore = match.opponent_score ?? 0;
  const dateStr = formatLongDate(match.match_date);
  const timeStr = formatTime(match.match_date);

  return (
    <article className="rounded-2xl bg-suaza-ink text-white p-6 desktop:p-7 flex items-center justify-between gap-6">
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            LIVE
          </span>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded ${
              isIntra
                ? "bg-purple-500/30 text-purple-200"
                : "bg-blue-500/30 text-blue-200"
            }`}
          >
            {isIntra ? "자체전" : "상대전"}
          </span>
          <span className="text-xs text-white/70 ml-1">{periodLabel}</span>
        </div>
        <div className="text-3xl desktop:text-[40px] font-bold tracking-wide">
          {isIntra ? (
            <>
              A팀
              <span className="mx-3 tabular-nums">
                {ourScore} : {oppScore}
              </span>
              B팀
            </>
          ) : (
            <>
              SUAZA
              <span className="mx-3 tabular-nums">
                {ourScore} : {oppScore}
              </span>
              {match.opponent}
            </>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-white/80 flex-wrap">
          <span>📅 {dateStr}</span>
          <span>⏰ {timeStr} KICK-OFF</span>
          {match.location && <span>📍 {match.location}</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <Link
          href={`/matches/${match.id}`}
          className="bg-white text-suaza-ink text-sm font-bold rounded-lg px-4 py-2.5 hover:opacity-90 transition"
        >
          경기 현황 보기 →
        </Link>
        <span className="text-xs text-white/60">실시간 득점·교체 기록</span>
      </div>
    </article>
  );
}

function formatLongDate(iso: string): string {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  });
  const parts = fmt.formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  return `${year}년 ${month} ${day}일 (${weekday})`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(d);
}
