import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/auth/actions";
import {
  FOOT_LABEL,
  POSITION_COLOR,
  TITLE_BADGE,
  TITLE_LABEL,
  type MemberTitle,
  type Position,
  type PreferredFoot,
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
import {
  fetchWeatherDebug,
  failureMessage,
  type WeatherInfo,
  type WeatherResult,
} from "@/lib/weather";

type NoticeRow = {
  id: string;
  title: string;
  created_at: string;
  author: { name: string; avatar_url: string | null } | null;
};

function NoticeAvatar({
  name,
  src,
}: {
  name: string | null;
  src: string | null;
}) {
  const initial = name?.charAt(0) || "?";
  return (
    <div
      className="relative shrink-0 w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center"
      aria-hidden
    >
      {src ? (
        <Image
          src={src}
          alt={name ?? "프로필"}
          fill
          sizes="40px"
          className="object-cover"
        />
      ) : (
        <span className="text-sm font-bold text-suaza-ink">{initial}</span>
      )}
    </div>
  );
}

function WeatherStrip({
  weather,
  matchDate,
}: {
  weather: WeatherInfo;
  matchDate: string;
}) {
  return (
    <div className="flex flex-col gap-1 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-[11px] text-sky-700 font-medium">
        <span>{forecastLabel(matchDate)}</span>
        <span className="text-suaza-ink-faint font-normal truncate max-w-[60%]">
          {weather.matchedLocation}
        </span>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-xl">{weather.emoji}</span>
        <span className="text-sm font-bold text-suaza-ink">{weather.label}</span>
        <span className="text-xs text-suaza-ink-muted tabular-nums">
          {weather.tempMin}° / {weather.tempMax}°
        </span>
        {weather.precipitationProbability > 0 && (
          <span className="text-xs text-sky-700 tabular-nums">
            💧 {weather.precipitationProbability}%
          </span>
        )}
      </div>
    </div>
  );
}

function forecastLabel(matchDateIso: string): string {
  const matchDate = new Date(matchDateIso);
  if (Number.isNaN(matchDate.getTime())) return "경기일 예보";
  // KST 기준 자정 비교 (Vercel UTC 서버에서도 동일 동작)
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = new Date(fmt.format(new Date()) + "T00:00:00+09:00");
  const target = new Date(fmt.format(matchDate) + "T00:00:00+09:00");
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "오늘 예보";
  if (diff === 1) return "내일 예보";
  if (diff > 1) return `D-${diff} 예보`;
  return "경기일 예보";
}

function PositionBadge({ position }: { position: Position }) {
  const color = POSITION_COLOR[position];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold"
      style={{ color, backgroundColor: `${color}1A` }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {position}
    </span>
  );
}

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
    { data: partsRaw },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "name, nickname, title, positions, role, avatar_url, jersey_number, preferred_foot",
      )
      .eq("id", user!.id)
      .single(),
    supabase
      .from("posts")
      .select("id, title, created_at, author:profiles(name, avatar_url)")
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
    supabase
      .from("match_participations")
      .select("goals, assists, custom_stats, match:matches(status)")
      .eq("player_id", user!.id)
      .is("archived_at", null),
  ]);

  const upcoming = upcomingMatch as Match | null;
  const last = lastMatch as Match | null;
  const notice = latestNotice as unknown as NoticeRow | null;

  // 다가오는 경기의 날씨 (있으면) — 실패해도 사유 표시
  const weatherResult: WeatherResult | null = upcoming
    ? await fetchWeatherDebug(upcoming.location, upcoming.match_date)
    : null;

  // 다가오는 경기 출석 데이터
  type VotePlayer = { id: string; name: string; jersey_number: number | null };
  let myStatus: string | null = null;
  const byStatus: {
    attending: VotePlayer[];
    absent: VotePlayer[];
    undecided: VotePlayer[];
  } = { attending: [], absent: [], undecided: [] };
  let nonVoters: VotePlayer[] = [];

  if (upcoming) {
    const [{ data: attRaw }, { data: mine }, { data: allMembers }] =
      await Promise.all([
        supabase
          .from("match_attendances")
          .select("status, player:profiles(id, name, jersey_number)")
          .eq("match_id", upcoming.id),
        supabase
          .from("match_attendances")
          .select("status")
          .eq("match_id", upcoming.id)
          .eq("player_id", user!.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id, name, jersey_number")
          .is("deleted_at", null)
          .order("name", { ascending: true }),
      ]);

    const votedIds = new Set<string>();
    for (const row of (attRaw ?? []) as unknown as {
      status: keyof typeof byStatus;
      player: VotePlayer | null;
    }[]) {
      if (row.player && row.status in byStatus) {
        byStatus[row.status].push(row.player);
        votedIds.add(row.player.id);
      }
    }
    nonVoters = ((allMembers ?? []) as VotePlayer[]).filter(
      (m) => !votedIds.has(m.id),
    );
    for (const key of ["attending", "absent", "undecided"] as const) {
      byStatus[key].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    }
    myStatus = (mine as { status: string } | null)?.status ?? null;
  }

  const lastResult = last
    ? getResult(last.our_score, last.opponent_score)
    : null;

  // 누적 통계 (종료 경기만)
  type Part = {
    goals: number;
    assists: number;
    custom_stats: Record<string, number> | null;
    match: { status: string } | null;
  };
  const done = ((partsRaw ?? []) as unknown as Part[]).filter(
    (p) => p.match?.status === "done",
  );
  const homeStats: { label: string; value: number }[] = [
    { label: "출전", value: done.length },
    { label: "골", value: done.reduce((a, p) => a + (p.goals ?? 0), 0) },
    { label: "어시", value: done.reduce((a, p) => a + (p.assists ?? 0), 0) },
    {
      label: "클린시트",
      value: done.reduce(
        (a, p) => a + (p.custom_stats?.clean_sheets ?? 0),
        0,
      ),
    },
    {
      label: "포인트",
      value: done.reduce((a, p) => a + (p.custom_stats?.points ?? 0), 0),
    },
  ];

  const positions = (profile?.positions ?? []) as Position[];
  const foot = (profile?.preferred_foot ?? null) as PreferredFoot | null;

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
        <section className="bg-white sm:rounded-2xl sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-4 sm:p-6 rounded-xl border sm:border-0 border-suaza-border flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center">
              {profile?.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={profile?.name ?? "프로필"}
                  fill
                  sizes="(min-width: 640px) 96px, 80px"
                  className="object-cover"
                />
              ) : (
                <span className="text-2xl sm:text-3xl font-bold text-suaza-ink">
                  {profile?.name?.charAt(0) ?? "?"}
                </span>
              )}
            </div>

            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
              {profile ? (
                <>
                  <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                    <span className="font-bold text-suaza-ink text-lg leading-tight">
                      {profile.name}
                    </span>
                    {profile.jersey_number != null && (
                      <span
                        className="font-bold text-lg leading-tight"
                        style={{ color: "#338CF2" }}
                      >
                        #{profile.jersey_number}
                      </span>
                    )}
                    {profile.nickname && (
                      <span className="hidden pointer-fine:inline text-suaza-ink-muted text-sm">
                        ({profile.nickname})
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${TITLE_BADGE[(profile.title as MemberTitle) ?? "player"]}`}
                    >
                      {TITLE_LABEL[(profile.title as MemberTitle) ?? "player"]}
                    </span>
                  </div>

                  {(positions.length > 0 || foot) && (
                    <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                      {positions.map((p) => (
                        <PositionBadge key={p} position={p} />
                      ))}
                      {foot && (
                        <>
                          {positions.length > 0 && (
                            <span className="hidden pointer-fine:inline text-suaza-ink-faint">
                              ·
                            </span>
                          )}
                          <span className="hidden pointer-fine:inline text-sm text-suaza-ink-muted">
                            {FOOT_LABEL[foot]}
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  <span className="text-suaza-ink-muted text-xs">
                    {user!.email}
                  </span>
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

            {profile && (
              <Link
                href={`/members/${user!.id}`}
                className="text-xs sm:text-sm font-bold text-suaza-accent bg-red-50 hover:bg-red-100 transition px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0"
              >
                <span className="pointer-fine:hidden">수정</span>
                <span className="hidden pointer-fine:inline">
                  프로필 수정 ›
                </span>
              </Link>
            )}
          </div>

          {profile && (
            <>
              <div className="h-px bg-suaza-border" />
              <div className="grid grid-cols-5">
                {homeStats.map((s, i) => (
                  <div
                    key={s.label}
                    className={`flex flex-col items-center gap-1 ${
                      i > 0 ? "border-l border-suaza-border" : ""
                    }`}
                  >
                    <span className="text-xl sm:text-2xl font-bold text-suaza-ink">
                      {s.value}
                    </span>
                    <span className="text-[11px] sm:text-xs text-suaza-ink-muted">
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Latest Notice (항상 표시 — 없으면 안내) */}
        {notice ? (
          <Link
            href={`/board/${notice.id}`}
            className="bg-white sm:rounded-2xl sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-4 sm:p-5 rounded-xl border sm:border-0 border-suaza-border hover:bg-gray-50 transition flex items-center gap-3"
          >
            <NoticeAvatar
              name={notice.author?.name ?? null}
              src={notice.author?.avatar_url ?? null}
            />
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded bg-suaza-accent text-white font-medium shrink-0">
                  공지
                </span>
                <span className="text-xs text-suaza-ink-muted truncate">
                  {notice.author?.name ?? ""} · {formatPostDate(notice.created_at)}
                </span>
              </div>
              <span className="font-bold text-suaza-ink truncate">
                {notice.title}
              </span>
            </div>
          </Link>
        ) : (
          <div className="bg-white sm:rounded-2xl sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-4 sm:p-5 rounded-xl border sm:border-0 border-suaza-border flex items-center gap-2">
            <span className="text-[11px] px-2 py-0.5 rounded bg-gray-200 text-gray-600 font-medium">
              공지
            </span>
            <span className="text-sm text-suaza-ink-muted">
              등록된 공지가 없습니다
            </span>
          </div>
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
            {weatherResult &&
              (weatherResult.ok ? (
                <WeatherStrip
                  weather={weatherResult.data}
                  matchDate={upcoming.match_date}
                />
              ) : (
                <div className="flex items-center gap-2 bg-gray-50 border border-suaza-border rounded-lg px-3 py-2 text-xs text-suaza-ink-muted">
                  <span>🌤️</span>
                  <span>날씨 정보 없음</span>
                  <span className="text-suaza-ink-faint truncate">
                    · {failureMessage(weatherResult.failure)}
                  </span>
                </div>
              ))}
            <AttendanceVote
              matchId={upcoming.id}
              redirectTo="/"
              myStatus={myStatus}
              byStatus={byStatus}
              nonVoters={nonVoters}
              isManager={profile?.role === "manager"}
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
