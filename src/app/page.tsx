import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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
  formatMatchDate,
  isMatchStarted,
  isAttendanceVoteLocked,
  type Match,
} from "@/lib/matches/helpers";
import PastMatchCard from "./matches/past-match-card";
import NoticeCard from "./notice-card";
import { type PostCategory } from "@/lib/board/helpers";
import {
  aggregateSeason,
  pointsForParticipation,
  pointValueMap,
  seasonRank,
  yearRange,
  type ParticipationRow as SeasonPartRow,
  type PlayerSeasonStat,
  type StatDef,
} from "@/lib/stats/helpers";
import { AttendanceVote } from "./matches/[id]/page";
import { computeSeasonKings } from "@/lib/stats/kings";

type NoticeRow = {
  id: string;
  title: string;
  content: string;
  category: PostCategory;
  created_at: string;
  author: { name: string; avatar_url: string | null } | null;
};

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

  // 시각이 지난 경기 자동 진행/완료 처리 (조회 전)
  await supabase.rpc("auto_progress_due_matches");

  // 시즌(달력 연도) 순위 산정용 — 홈 통계 카드 메달/순위 뱃지
  const seasonYear = new Date().getFullYear();
  const { from: seasonFrom, to: seasonTo } = yearRange(seasonYear);
  // 출석 마감 판정용 현재 시각 — 서버 컴포넌트라 요청당 1회 실행이라 안전.
  // (react-hooks/purity 는 클라이언트 재렌더를 가정한 규칙이라 여기선 예외 처리)
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  const [
    { data: profile },
    { data: latestNotice },
    { data: upcomingMatch },
    { data: lastMatch },
    { data: partsRaw },
    { data: statDefsRaw },
    { data: seasonMatchesRaw },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "name, nickname, title, positions, role, avatar_url, jersey_number, preferred_foot, is_injured, on_leave",
      )
      .eq("id", user!.id)
      .single(),
    supabase
      .from("posts")
      .select(
        "id, title, content, category, created_at, author:profiles!posts_author_id_fkey(name, avatar_url)",
      )
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
    // 일정&결과 페이지의 "지난 경기" 카드와 동일하게 종료/취소 경기 최근 2건
    supabase
      .from("matches")
      .select("*")
      .in("status", ["done", "canceled"])
      .order("match_date", { ascending: false })
      .limit(2),
    supabase
      .from("match_participations")
      .select("goals, assists, custom_stats, match:matches(match_date, status)")
      .eq("player_id", user!.id)
      .is("archived_at", null),
    supabase
      .from("stat_definitions")
      .select("key, label, sort_order, point_value")
      .is("hidden_at", null),
    supabase
      .from("matches")
      .select("id, match_date")
      .eq("status", "done")
      .gte("match_date", seasonFrom)
      .lt("match_date", seasonTo),
  ]);

  const upcoming = upcomingMatch as Match | null;
  const recentMatches = (lastMatch ?? []) as Match[];
  const notice = latestNotice as unknown as NoticeRow | null;

  // 다가오는 경기 출석 데이터
  type VotePlayer = {
    id: string;
    name: string;
    jersey_number: number | null;
    positions?: string[] | null;
    attending_quarters?: number[] | null;
    voted_at?: string | null;
    is_injured?: boolean | null;
    on_leave?: boolean | null;
    isGoalKing?: boolean;
    isAssistKing?: boolean;
    isCleanSheetKing?: boolean;
    isRefereeKing?: boolean;
  };
  let myStatus: string | null = null;
  let myAttendingQuarters: number[] | null = null;
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
          .select(
            "status, attending_quarters, updated_at, player:profiles(id, name, jersey_number, positions, deleted_at, is_injured, on_leave)",
          )
          .eq("match_id", upcoming.id),
        supabase
          .from("match_attendances")
          .select("status, attending_quarters")
          .eq("match_id", upcoming.id)
          .eq("player_id", user!.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id, name, jersey_number, positions, is_injured, on_leave")
          .is("deleted_at", null)
          .order("name", { ascending: true }),
      ]);

    // 이 경기 일자가 속한 연도의 시즌 카테고리 1위 (공동 1위 포함)
    const upcomingYear = new Date(upcoming.match_date).getFullYear();
    const seasonKings = await computeSeasonKings(supabase, upcomingYear);
    const withKings = (p: VotePlayer): VotePlayer => ({
      ...p,
      isGoalKing: seasonKings.goal.has(p.id),
      isAssistKing: seasonKings.assist.has(p.id),
      isCleanSheetKing: seasonKings.cleanSheet.has(p.id),
      isRefereeKing: seasonKings.referee.has(p.id),
    });

    const votedIds = new Set<string>();
    for (const row of (attRaw ?? []) as unknown as {
      status: keyof typeof byStatus;
      attending_quarters: number[] | null;
      updated_at: string | null;
      player: (VotePlayer & { deleted_at?: string | null }) | null;
    }[]) {
      // 소프트 삭제된 회원은 출석 명단에서 제외
      if (row.player?.deleted_at) continue;
      if (row.player && row.status in byStatus) {
        const enriched = withKings({
          ...row.player,
          attending_quarters: row.attending_quarters,
          voted_at: row.updated_at,
        });
        // 부상/장기불참은 자동 불참 처리 (매치 상세와 동일)
        const forcedAbsent =
          !!row.player.is_injured || !!row.player.on_leave;
        const effectiveStatus = forcedAbsent ? "absent" : row.status;
        byStatus[effectiveStatus].push(enriched);
        votedIds.add(row.player.id);
      }
    }
    const rawNonVoters = ((allMembers ?? []) as VotePlayer[])
      .filter((m) => !votedIds.has(m.id))
      .map(withKings);
    // 부상/장기불참 미투표자도 불참으로 이동
    nonVoters = rawNonVoters.filter((m) => !m.is_injured && !m.on_leave);
    for (const m of rawNonVoters) {
      if (m.is_injured || m.on_leave) byStatus.absent.push(m);
    }
    for (const key of ["attending", "absent", "undecided"] as const) {
      byStatus[key].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    }
    const m = mine as
      | { status: string; attending_quarters: number[] | null }
      | null;
    myStatus = m?.status ?? null;
    myAttendingQuarters = m?.attending_quarters ?? null;
    // 부상/장기불참이면 예정 경기 투표를 자동으로 불참 표시 (경기상세와 동일)
    const meBlocked =
      !!(profile as { is_injured?: boolean | null })?.is_injured ||
      !!(profile as { on_leave?: boolean | null })?.on_leave;
    if (meBlocked) {
      myStatus = "absent";
      myAttendingQuarters = null;
    }
  }

  // 누적 통계 (종료 경기만)
  type Part = {
    goals: number;
    assists: number;
    custom_stats: Record<string, number> | null;
    match: { match_date: string; status: string } | null;
  };
  const done = ((partsRaw ?? []) as unknown as Part[]).filter(
    (p) => p.match?.status === "done",
  );
  // 포인트: 경기별 계산 (기준일 이전 = 수동 입력, 이후 = 항목 기준점수)
  const statDefs = (statDefsRaw ?? []) as StatDef[];
  const pvMap = pointValueMap(statDefs);

  // ── 시즌 순위 (메달/순위 뱃지/포인트 강조) — 프로필 카드와 동일 로직 ──
  const seasonMatchRows = (seasonMatchesRaw ?? []) as {
    id: string;
    match_date: string;
  }[];
  const seasonMatchIds = seasonMatchRows.map((m) => m.id);
  const seasonMatchDateById = new Map(
    seasonMatchRows.map((m) => [m.id, m.match_date]),
  );
  const { data: seasonPartsRaw } = seasonMatchIds.length
    ? await supabase
        .from("match_participations")
        .select(
          "match_id, player_id, goals, assists, custom_stats, player:profiles(id, name, jersey_number)",
        )
        .in("match_id", seasonMatchIds)
        .is("archived_at", null)
    : { data: [] as SeasonPartRow[] };
  const seasonParts = (seasonPartsRaw ?? []) as unknown as SeasonPartRow[];
  const seasonStatsMap = new Map<string, PlayerSeasonStat>(
    aggregateSeason(seasonParts, statDefs).map((s) => [s.player_id, s]),
  );
  const myId = user!.id;
  // Dense ranking: 동률은 같은 순위. 본인 값이 0 이하면 순위 없음(null).
  const rankInCategory = (
    getter: (s: PlayerSeasonStat) => number,
  ): number | null => {
    const myStat = seasonStatsMap.get(myId);
    if (!myStat) return null;
    return seasonRank(
      getter(myStat),
      Array.from(seasonStatsMap.values(), getter),
    );
  };
  const attendanceRank = rankInCategory((s) => s.appearances ?? 0);
  const goalRank = rankInCategory((s) => s.goals ?? 0);
  const assistRank = rankInCategory((s) => s.assists ?? 0);
  const cleanSheetRank = rankInCategory((s) => s.custom?.clean_sheets ?? 0);

  // 포인트는 경기별 가중치 계산 → 별도 맵으로 집계 후 순위 산정
  const seasonPointsByPlayer = new Map<string, number>();
  for (const p of seasonParts) {
    const pts = pointsForParticipation(
      p,
      seasonMatchDateById.get(p.match_id),
      pvMap,
    );
    seasonPointsByPlayer.set(
      p.player_id,
      (seasonPointsByPlayer.get(p.player_id) ?? 0) + pts,
    );
  }
  const pointsRank = seasonRank(
    seasonPointsByPlayer.get(myId) ?? 0,
    seasonPointsByPlayer.values(),
  );

  const homeStats: {
    label: string;
    value: number;
    tone?: "primary";
    rank?: number | null;
    alwaysShowRank?: boolean;
  }[] = [
    { label: "출전", value: done.length, rank: attendanceRank },
    {
      label: "골",
      value: done.reduce((a, p) => a + (p.goals ?? 0), 0),
      rank: goalRank,
    },
    {
      label: "어시",
      value: done.reduce((a, p) => a + (p.assists ?? 0), 0),
      rank: assistRank,
    },
    {
      label: "클린시트",
      value: done.reduce((a, p) => a + (p.custom_stats?.clean_sheets ?? 0), 0),
      rank: cleanSheetRank,
    },
    {
      label: "포인트",
      value: done.reduce(
        (a, p) => a + pointsForParticipation(p, p.match?.match_date, pvMap),
        0,
      ),
      tone: "primary",
      rank: pointsRank,
      alwaysShowRank: true,
    },
  ];

  const positions = (profile?.positions ?? []) as Position[];
  const foot = (profile?.preferred_foot ?? null) as PreferredFoot | null;

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[800px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-4">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative w-7 h-7 rounded-lg overflow-hidden">
              <Image
                src="/suaza-emblem.png"
                alt="수아자FC"
                fill
                sizes="28px"
                priority
                className="object-cover"
              />
            </div>
            <span className="font-bold text-suaza-ink text-2xl sm:text-[28px]">
              수아자FC
            </span>
          </div>
          <div className="flex items-center gap-2">
            {(profile?.title === "president" ||
              profile?.title === "head_coach") && (
              <Link
                href="/settings"
                aria-label="감독 설정"
                title="감독 설정"
                className="inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 border border-suaza-border rounded-md text-suaza-ink hover:bg-gray-100 transition"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-[13px] h-[13px] sm:w-[15px] sm:h-[15px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </Link>
            )}
          </div>
        </header>

        {/* Profile Card */}
        <section className="flex flex-col gap-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="relative shrink-0">
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-gray-100 flex items-center justify-center">
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
            </div>

            <div className="flex-1 self-stretch flex flex-col justify-between gap-1 min-w-0">
              {profile ? (
                <>
                  <div className="flex items-center gap-x-1.5 gap-y-1 flex-wrap">
                    <span className="font-bold text-suaza-ink text-lg leading-tight">
                      {profile.name}
                    </span>
                    {profile.title && (
                      <span
                        className={`text-[11px] leading-none px-2 py-0.5 rounded-full ${TITLE_BADGE[profile.title as MemberTitle]}`}
                      >
                        {TITLE_LABEL[profile.title as MemberTitle]}
                      </span>
                    )}
                    {profile.jersey_number != null && (
                      <span
                        className="font-bold text-sm leading-tight"
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
                  </div>

                  <span className="text-suaza-ink-muted text-xs">
                    {user!.email}
                  </span>

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
              <div className="flex items-center gap-1.5 shrink-0">
                <Link
                  href="/settings/notifications"
                  aria-label="알림 설정"
                  title="알림 설정"
                  className="inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-md border border-suaza-border text-suaza-ink hover:bg-gray-100 transition"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-[13px] h-[13px] sm:w-[15px] sm:h-[15px]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </Link>
                <Link
                  href={`/members/${user!.id}`}
                  aria-label="프로필 수정"
                  title="프로필 수정"
                  className="inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-md border border-suaza-border text-suaza-ink hover:bg-gray-100 transition"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-[13px] h-[13px] sm:w-[15px] sm:h-[15px]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </Link>
              </div>
            )}
          </div>

          {profile && (
            <>
              <div className="grid grid-cols-5">
                {homeStats.map((s, i) => {
                  const medal =
                    s.rank === 1
                      ? "🥇"
                      : s.rank === 2
                        ? "🥈"
                        : s.rank === 3
                          ? "🥉"
                          : null;
                  const showTextBadge =
                    !medal && s.alwaysShowRank && s.rank != null;
                  const valueCls =
                    s.tone === "primary" ? "text-blue-700" : "text-suaza-ink";
                  const labelCls =
                    s.tone === "primary"
                      ? "text-blue-600"
                      : "text-suaza-ink-muted";
                  return (
                    <div
                      key={s.label}
                      className={`relative flex flex-col items-center gap-0 sm:gap-1 ${
                        i > 0 ? "border-l border-suaza-border" : ""
                      }`}
                    >
                      {medal && (
                        <span
                          className="absolute -top-3 right-0.5 text-sm leading-none"
                          aria-label={`${s.label} 시즌 ${s.rank}위`}
                          title={`${s.label} 시즌 ${s.rank}위`}
                        >
                          {medal}
                        </span>
                      )}
                      {showTextBadge && (
                        <span
                          className={`absolute -top-3 right-0 px-1 py-0.5 rounded-full text-[9px] font-bold leading-none text-suaza-ink ${
                            s.tone === "primary" ? "bg-blue-100" : "bg-gray-200"
                          }`}
                          aria-label={`${s.label} 시즌 ${s.rank}위`}
                          title={`${s.label} 시즌 ${s.rank}위`}
                        >
                          {s.rank}위
                        </span>
                      )}
                      <span
                        className={`text-xl sm:text-2xl font-bold tabular-nums ${valueCls}`}
                      >
                        {s.value}
                      </span>
                      <span className={`text-[11px] sm:text-xs ${labelCls}`}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* Latest Notice (항상 표시 — 없으면 안내) */}
        {notice ? (
          <NoticeCard notice={notice} />
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
            <Link
              href={`/matches/${upcoming.id}`}
              className="flex flex-col gap-1 hover:opacity-80"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-bold text-suaza-ink text-lg min-w-0 truncate">
                  vs {upcoming.opponent}
                </span>
                <span className="shrink-0 flex items-center gap-1.5">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${MATCH_STATUS_BADGE[upcoming.status]}`}
                  >
                    {MATCH_STATUS_LABEL[upcoming.status]}
                  </span>
                  {/* 카드 진입(상세 보기) 힌트 — 탭 가능 표시 */}
                  <svg
                    className="w-4 h-4 text-suaza-ink-faint"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </span>
              <span className="text-sm text-suaza-ink-muted truncate">
                {formatMatchDate(upcoming.match_date)}
              </span>
            </Link>
            <AttendanceVote
              matchId={upcoming.id}
              meId={user!.id}
              myName={profile?.name ?? null}
              myPositions={profile?.positions ?? null}
              myInjured={!!(profile as { is_injured?: boolean | null })?.is_injured}
              myOnLeave={!!(profile as { on_leave?: boolean | null })?.on_leave}
              myStatus={myStatus}
              myAttendingQuarters={myAttendingQuarters}
              byStatus={byStatus}
              nonVoters={nonVoters}
              isManager={profile?.role === "manager"}
              totalQuarters={upcoming.total_quarters ?? 4}
              quarterActions={upcoming.quarter_actions ?? null}
              locked={isAttendanceVoteLocked(upcoming, nowMs)}
              lockedMessage={
                isMatchStarted(upcoming)
                  ? "🔒 경기 시작 후에는 출석 투표를 변경할 수 없습니다"
                  : upcoming.vote_closed_at != null
                    ? "🔒 출석 투표가 종료되었습니다"
                    : "🔒 투표가 마감되었습니다 (매니저·감독만 변경 가능)"
              }
            />
          </section>
        )}

        {/* 지난 경기 — 일정&결과 페이지와 동일한 카드 디자인. 최근 2건. */}
        {recentMatches.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-suaza-ink">지난 경기</h2>
            <div className="flex flex-col gap-3">
              {recentMatches.map((m) => (
                <PastMatchCard key={m.id} match={m} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
