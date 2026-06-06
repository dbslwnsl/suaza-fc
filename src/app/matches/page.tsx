import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getTeamName, type Match } from "@/lib/matches/helpers";
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

  // 진행중인 경기들의 득점/어시스트 집계 (라이브 카드 표시용)
  const liveStats = new Map<string, LiveStats>();
  if (live.length > 0) {
    const liveIds = live.map((m) => m.id);
    const [{ data: liveParts }, { data: liveProfiles }] = await Promise.all([
      supabase
        .from("match_participations")
        .select("match_id, player_id, goals, assists")
        .in("match_id", liveIds)
        .is("archived_at", null),
      supabase.from("profiles").select("id, name"),
    ]);
    const nameById = new Map<string, string>();
    for (const p of (liveProfiles ?? []) as { id: string; name: string }[]) {
      nameById.set(p.id, p.name);
    }
    for (const id of liveIds) {
      liveStats.set(id, { scorers: [], assisters: [] });
    }
    for (const row of (liveParts ?? []) as {
      match_id: string;
      player_id: string;
      goals: number | null;
      assists: number | null;
    }[]) {
      const bucket = liveStats.get(row.match_id);
      if (!bucket) continue;
      const name = nameById.get(row.player_id) ?? "?";
      if ((row.goals ?? 0) > 0) {
        bucket.scorers.push({ name, count: row.goals ?? 0 });
      }
      if ((row.assists ?? 0) > 0) {
        bucket.assisters.push({ name, count: row.assists ?? 0 });
      }
    }
    for (const b of liveStats.values()) {
      b.scorers.sort((a, b) => b.count - a.count);
      b.assisters.sort((a, b) => b.count - a.count);
    }
  }
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

  return (
    <main className="flex-1 bg-white desktop:bg-suaza-bg px-6 desktop:px-8 py-8 desktop:py-12">
      <div className="max-w-[800px] desktop:max-w-[1200px] mx-auto flex flex-col gap-8 desktop:gap-10">
        {/* Header */}
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <svg
              className="w-9 h-9 desktop:w-12 desktop:h-12 shrink-0 desktop:mt-1 text-suaza-ink"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
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
                <LiveMatchCard
                  key={m.id}
                  match={m}
                  stats={liveStats.get(m.id) ?? { scorers: [], assisters: [] }}
                />
              ))}
            </div>
          </section>
        )}

        {/* 예정된 경기 — 날씨는 Suspense 로 streaming. 페이지 첫 paint 가 외부 API 응답에
            의존하지 않도록 카드는 즉시 표시되고 날씨만 비동기로 채워진다. */}
        {upcoming.length > 0 && (
          <Suspense
            fallback={
              <UpcomingMatchesSection
                matches={upcoming}
                weathers={upcoming.map(() => null)}
              />
            }
          >
            <UpcomingMatchesWithWeather matches={upcoming} />
          </Suspense>
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

async function UpcomingMatchesWithWeather({ matches }: { matches: Match[] }) {
  const weathers = await Promise.all(
    matches.map((m) => fetchWeather(m.location, m.match_date)),
  );
  return <UpcomingMatchesSection matches={matches} weathers={weathers} />;
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

type LiveStats = {
  scorers: { name: string; count: number }[];
  assisters: { name: string; count: number }[];
};

function LiveMatchCard({
  match,
  stats,
}: {
  match: Match;
  stats: LiveStats;
}) {
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
  const hasStats = stats.scorers.length > 0 || stats.assisters.length > 0;

  return (
    <article className="rounded-2xl bg-suaza-ink text-white p-6 desktop:p-7 flex flex-col desktop:flex-row desktop:items-center desktop:justify-between gap-5 desktop:gap-6">
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
        <Link
          href={`/matches/${match.id}`}
          className="text-3xl desktop:text-[40px] font-bold tracking-wide self-start hover:opacity-80 transition"
        >
          {isIntra ? (
            <>
              {getTeamName(match, "A")}
              <span className="mx-3 tabular-nums">
                {ourScore} : {oppScore}
              </span>
              {getTeamName(match, "B")}
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
        </Link>
        <div className="flex items-center gap-4 text-sm text-white/80 flex-wrap">
          <span>📅 {dateStr}</span>
          <span>⏰ {timeStr} KICK-OFF</span>
          {match.location && <span>📍 {match.location}</span>}
        </div>
      </div>
      {hasStats && (
        <div className="flex flex-col gap-2 desktop:shrink-0 desktop:max-w-[360px] desktop:items-end">
          {stats.scorers.length > 0 && (
            <StatLine icon="⚽" label="득점" items={stats.scorers} />
          )}
          {stats.assisters.length > 0 && (
            <StatLine icon="🅰️" label="어시" items={stats.assisters} />
          )}
        </div>
      )}
    </article>
  );
}

function StatLine({
  icon,
  label,
  items,
}: {
  icon: string;
  label: string;
  items: { name: string; count: number }[];
}) {
  return (
    <div className="flex items-baseline gap-2 text-sm desktop:justify-end flex-wrap">
      <span className="text-[11px] font-bold text-white/60 shrink-0">
        {icon} {label}
      </span>
      <span className="text-white/95">
        {items.map((s, i) => (
          <span key={i}>
            {i > 0 && ", "}
            {s.name}
            {s.count > 1 && (
              <span className="text-white/60"> ({s.count})</span>
            )}
          </span>
        ))}
      </span>
    </div>
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
