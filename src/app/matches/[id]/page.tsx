import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeSeasonKings } from "@/lib/stats/kings";
import { closeAttendanceVote, deleteMatch } from "@/lib/matches/actions";
import { WeatherInlineClient } from "@/components/weather-client";
import {
  IntraTeamCircle,
  IntraTeamColorsProvider,
} from "@/components/intra-team-colors";
import {
  AttendanceCardVote,
  AttendanceCompactVote,
  AttendanceProvider,
} from "./attendance-vote-panel";
import NewMatchForm from "@/app/matches/new/new-match-form";
import ScoreControl from "./score-control";
import TeamRecapCard from "./team-recap-card";
import TeamBuilder from "./team-builder";
import FormationEmbed from "./formation/embed";
import FormationCollapsible from "./formation-collapsible";
import MatchInfoReadonly from "./match-info-readonly";
import MatchCommentSection, { type MatchComment } from "./match-comments";
import MatchShareButton from "./match-share-button";
import {
  DEFAULT_TEAM_COLOR,
  DEFAULT_VS_COLOR,
  MATCH_STATUS_BADGE,
  MATCH_STATUS_DOT_COLOR,
  MATCH_STATUS_LABEL,
  getTeamName,
  isMatchStarted,
  type Match,
} from "@/lib/matches/helpers";
import { fetchWeatherDebug, failureMessage } from "@/lib/weather";

export default async function MatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string; edit?: string }>;
}) {
  const { id } = await params;
  const { error, message, edit } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // 시각이 지난 모든 경기를 자동 진행/완료 처리 (조회 전 실행)
  await supabase.rpc("auto_progress_due_matches");

  // 경기 1건을 먼저 조회해 연도를 확정한 뒤, 나머지 쿼리와 시즌 집계를 한 번에 병렬 실행.
  // computeSeasonKings 가 matchYear 에 의존해 과거엔 Promise.all 뒤에서 순차 await 되었고,
  // 댓글 등 revalidate 시 재렌더가 느려지는 큰 원인이었다 → 병렬로 합류.
  const { data: match } = await supabase
    .from("matches")
    .select("*")
    .eq("id", id)
    .single();
  if (!match) notFound();
  const matchYear = new Date((match as Match).match_date).getFullYear();

  const [
    { data: me },
    { data: allMembers },
    { data: attendancesRaw },
    { data: myAttendance },
    { data: commentsRaw },
    { data: mercenariesRaw },
    seasonKings,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, name, avatar_url, is_injured, on_leave, condition")
      .eq("id", user.id)
      .single(),
    supabase
      .from("profiles")
      .select("id, name, jersey_number, positions, title, is_injured, on_leave")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("match_attendances")
      .select(
        "status, team, attending_quarters, updated_at, condition, player:profiles(id, name, jersey_number, positions, title, deleted_at, is_injured, on_leave, condition)",
      )
      .eq("match_id", id),
    supabase
      .from("match_attendances")
      .select("status, attending_quarters, condition")
      .eq("match_id", id)
      .eq("player_id", user.id)
      .maybeSingle(),
    supabase
      .from("match_comments")
      .select(
        "id, content, created_at, updated_at, author_id, parent_id, author:profiles(name, avatar_url)",
      )
      .eq("match_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("match_mercenaries")
      .select("id, name, team")
      .eq("match_id", id)
      .order("created_at", { ascending: true }),
    computeSeasonKings(supabase, matchYear),
  ]);

  const comments = (commentsRaw ?? []) as unknown as MatchComment[];

  type VotePlayer = {
    id: string;
    name: string;
    jersey_number: number | null;
    positions?: string[] | null;
    title?: string | null;
    attending_quarters?: number[] | null;
    voted_at?: string | null;
    is_injured?: boolean | null;
    on_leave?: boolean | null;
    /** 컨디션 1~5 단계 (기본 3) */
    condition?: number | null;
    isGoalKing?: boolean;
    isAssistKing?: boolean;
    isCleanSheetKing?: boolean;
    isRefereeKing?: boolean;
  };
  const byStatus: {
    attending: VotePlayer[];
    absent: VotePlayer[];
    undecided: VotePlayer[];
  } = { attending: [], absent: [], undecided: [] };
  const votedIds = new Set<string>();
  // 자체전 팀 편성용: 참석자 + team 배정 + 주 포지션(positions[0]) 분류용
  const teamMembers: {
    id: string;
    name: string;
    team: "A" | "B" | null;
    positions: string[] | null;
    condition: number | null;
    isMercenary?: boolean;
  }[] = [];
  // 종료/취소된 경기는 지난 기록이므로 삭제 회원도 그대로 보존,
  // 예정·진행 중 경기에서는 삭제 회원을 명단에서 제외.
  const matchStatus = (match as Match | null)?.status ?? null;
  const isPastMatch = matchStatus === "done" || matchStatus === "canceled";
  // seasonKings(시즌 카테고리 1위, 공동 1위 포함)는 위 Promise.all 에서 병렬 산출됨.
  // 출석 명단에서 득점왕/어시왕/CS왕/심판왕 딱지 표기에 사용.
  const withKings = (p: VotePlayer): VotePlayer => ({
    ...p,
    isGoalKing: seasonKings.goal.has(p.id),
    isAssistKing: seasonKings.assist.has(p.id),
    isCleanSheetKing: seasonKings.cleanSheet.has(p.id),
    isRefereeKing: seasonKings.referee.has(p.id),
  });
  for (const row of (attendancesRaw ?? []) as unknown as {
    status: keyof typeof byStatus;
    team: "A" | "B" | null;
    attending_quarters: number[] | null;
    updated_at: string | null;
    condition: number | null;
    player: (VotePlayer & { deleted_at?: string | null }) | null;
  }[]) {
    // 소프트 삭제된 회원: 예정·진행 경기에서만 제외 (지난 경기는 기록 보존)
    if (!isPastMatch && row.player?.deleted_at) continue;
    if (row.player && row.status in byStatus) {
      const enriched: VotePlayer = withKings({
        ...row.player,
        attending_quarters: row.attending_quarters,
        voted_at: row.updated_at,
        // 경기별 컨디션 — match_attendances.condition 을 우선 사용 (없으면 null = "?")
        condition: row.condition,
      });
      // 부상자는 실제 투표와 무관하게 불참으로 강제 이동 (지난 경기는 기록 보존)
      const injuredNow = !isPastMatch && !!row.player.is_injured;
      const onLeaveNow = !isPastMatch && !!row.player.on_leave;
      const effectiveStatus =
        injuredNow || onLeaveNow ? "absent" : row.status;
      byStatus[effectiveStatus].push(enriched);
      votedIds.add(row.player.id);
      if (effectiveStatus === "attending") {
        teamMembers.push({
          id: row.player.id,
          name: row.player.name,
          team: row.team ?? null,
          positions: row.player.positions ?? null,
          condition: row.player.condition ?? null,
        });
      }
    }
  }
  // 용병은 참석 리스트에 자동 포함 (포지션 미지정 → "용병" 그룹으로 별도 분류).
  for (const merc of (mercenariesRaw ?? []) as {
    id: string;
    name: string;
    team: "A" | "B" | null;
  }[]) {
    teamMembers.push({
      id: merc.id,
      name: merc.name,
      team: merc.team,
      positions: null,
      condition: null,
      isMercenary: true,
    });
  }
  // 팀 편성 참석 리스트를 출석 낙관과 공유하기 위한 데이터 (AttendanceProvider 주입용).
  const baseTeam = new Map<string, "A" | "B" | null>(
    teamMembers
      .filter((tm) => !tm.isMercenary)
      .map((tm) => [tm.id, tm.team] as const),
  );
  const mercenaries = teamMembers.filter((tm) => tm.isMercenary);
  const rawNonVoters = ((allMembers ?? []) as VotePlayer[])
    .filter((m) => !votedIds.has(m.id))
    .map(withKings);
  // 부상 미투표자도 불참으로 이동 (지난 경기는 그대로 둔다)
  const nonVoters = isPastMatch
    ? rawNonVoters
    : rawNonVoters.filter((m) => !m.is_injured && !m.on_leave);
  if (!isPastMatch) {
    for (const m of rawNonVoters) {
      if (m.is_injured || m.on_leave) byStatus.absent.push(m);
    }
  }
  for (const key of ["attending", "absent", "undecided"] as const) {
    byStatus[key].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }
  const myAtt = myAttendance as
    | {
        status: string;
        attending_quarters: number[] | null;
        condition: number | null;
      }
    | null;
  // 부상자는 본인 응답도 불참으로 고정하고 투표 UI 를 잠근다 (지난 경기는 제외).
  const myInjured = !!(me as { is_injured?: boolean | null } | null)?.is_injured;
  const myOnLeave = !!(me as { on_leave?: boolean | null } | null)?.on_leave;
  const matchIsPast = matchStatus === "done" || matchStatus === "canceled";
  const injuredLock = myInjured && !matchIsPast;
  const onLeaveLock = myOnLeave && !matchIsPast;
  const forcedAbsent = injuredLock || onLeaveLock;
  const myStatus = forcedAbsent ? "absent" : myAtt?.status ?? null;
  const myAttendingQuarters = forcedAbsent
    ? null
    : myAtt?.attending_quarters ?? null;

  const m = match as Match;
  const isStaff = me?.role === "manager" || me?.role === "coach";
  const editing = edit === "1" && isStaff;
  const totalMembers = (allMembers ?? []).length;


  // D-day 계산 — 단말/서버 타임존과 무관하게 서울(Asia/Seoul) 달력 기준
  const matchYMD = kstParts(m.match_date);
  const nowYMD = kstParts(new Date().toISOString());
  const matchMidUTC = Date.UTC(
    Number(matchYMD.year),
    Number(matchYMD.month) - 1,
    Number(matchYMD.day),
  );
  const todayMidUTC = Date.UTC(
    Number(nowYMD.year),
    Number(nowYMD.month) - 1,
    Number(nowYMD.day),
  );
  const diffDays = Math.round((matchMidUTC - todayMidUTC) / 86400000);
  const dDay =
    m.status === "scheduled"
      ? diffDays > 0
        ? `D-${diffDays}`
        : diffDays === 0
          ? "D-DAY"
          : null
      : null;

  // 출석 마감 문구 — vote_deadline 이 있으면 그 시각, 없으면 경기 전날 23:59
  let deadlineStr: string;
  if (m.vote_deadline) {
    const dl = kstParts(m.vote_deadline);
    deadlineStr = `${Number(dl.month)}/${Number(dl.day)} ${dl.hour}:${dl.minute}`;
  } else {
    const deadlineDate = new Date(matchMidUTC - 86400000);
    deadlineStr = `${deadlineDate.getUTCMonth() + 1}/${deadlineDate.getUTCDate()} 23:59`;
  }

  const isIntra = m.opponent === "자체전";
  const isStarted = isMatchStarted(m);
  // 투표 마감 경과 여부 (매니저/감독은 마감 후에도 변경 가능)
  const deadlinePassed = m.vote_deadline
    ? Date.now() > new Date(m.vote_deadline).getTime()
    : false;
  // 수동 종료 여부
  const voteClosed = m.vote_closed_at != null;
  // 상태 자동 진행은 위에서 auto_progress_due_matches 로 이미 처리됨
  // (조회한 match 는 갱신 후 최신 상태)

  // 편집 모드: 경기 등록 화면과 동일한 레이아웃
  if (editing) {
    return (
      <main className="flex-1 bg-white desktop:bg-suaza-bg px-6 desktop:px-8 py-8 desktop:py-12">
        <div className="max-w-[600px] mx-auto bg-white desktop:rounded-2xl desktop:p-12 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            {m.status === "done" || m.status === "canceled" ? (
              <Link
                href={`/matches/${m.id}`}
                className="inline-flex items-center gap-1 text-sm text-suaza-ink-muted hover:underline w-fit"
              >
                <span aria-hidden>←</span> 경기 상세
              </Link>
            ) : null}
            <div className="flex items-center gap-3">
              {m.status !== "done" && m.status !== "canceled" && (
                <Link
                  href="/"
                  aria-label="홈으로"
                  className="relative w-9 h-9 rounded-full overflow-hidden block hover:opacity-80 transition shrink-0"
                >
                  <Image
                    src="/suaza-emblem.png"
                    alt="홈"
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                </Link>
              )}
              <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
                {m.status === "done" || m.status === "canceled"
                  ? "경기 정보 조회"
                  : "경기 정보 수정"}
              </h1>
            </div>
            <p className="text-sm text-suaza-ink-muted">
              {m.status === "done" || m.status === "canceled"
                ? "종료된 경기는 정보 조회만 가능합니다"
                : "경기 정보를 수정합니다"}
            </p>
          </header>

          {error && (
            <p className="-mt-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </p>
          )}

          {m.status === "done" || m.status === "canceled" ? (
            <MatchInfoReadonly match={m} />
          ) : (
            <NewMatchForm
              mode="edit"
              matchId={m.id}
              initial={{
                opponent: m.opponent,
                matchDate: m.match_date,
                location: m.location,
                status: m.status,
                notes: m.notes,
                durationHours: m.duration_hours,
                voteDeadline: m.vote_deadline,
                teamAName: m.team_a_name,
                teamBName: m.team_b_name,
                teamAColor: m.team_a_color,
                teamBColor: m.team_b_color,
                totalQuarters: m.total_quarters,
                quarterActions: m.quarter_actions,
              }}
              recentOpponents={[]}
              recentLocations={[]}
            />
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-white desktop:bg-suaza-bg px-6 desktop:px-8 py-6 desktop:py-12">
      <div className="max-w-[600px] desktop:max-w-[1400px] mx-auto flex flex-col gap-4">
        {/* Header: 경기 목록 */}
        <header className="flex items-center">
          <Link
            href="/matches"
            className="text-sm text-suaza-ink-muted hover:underline"
          >
            ← 경기 목록
          </Link>
        </header>

        {message && (
          <p className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">
            {message}
          </p>
        )}
        {error && (
          <p className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </p>
        )}

        <IntraTeamColorsProvider
          initialA={m.team_a_color ?? DEFAULT_TEAM_COLOR.A}
          initialB={m.team_b_color ?? DEFAULT_TEAM_COLOR.B}
        >
        <VSCard
          m={m}
          isIntra={isIntra}
          isStaff={isStaff}
          isStarted={isStarted}
          dDay={dDay}
        />

            <AttendanceProvider
              matchId={m.id}
              myStatus={myStatus}
              myAttendingQuarters={myAttendingQuarters}
              me={{
                id: user.id,
                name: me?.name ?? "",
                is_injured: injuredLock,
                on_leave: onLeaveLock,
              }}
              byStatus={byStatus}
              nonVoters={nonVoters}
              baseTeam={baseTeam}
              mercenaries={mercenaries}
            >
            <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4 desktop:items-stretch">
              {/* 출석투표: 좌측 상단 — 취소 경기엔 숨김 (완료 경기는 조회용으로 노출) */}
              {m.status !== "canceled" && (
                <div className="order-1 desktop:h-full">
                  <AttendanceCard
                    matchId={m.id}
                    myCondition={
                      myAtt?.condition ?? null
                    }
                    isManager={isStaff}
                    myName={me?.name ?? null}
                    totalMembers={totalMembers}
                    totalQuarters={m.total_quarters ?? 4}
                    quarterActions={m.quarter_actions ?? null}
                    deadlineStr={deadlineStr}
                    voteClosed={voteClosed}
                    locked={
                      forcedAbsent ||
                      isStarted ||
                      ((deadlinePassed || voteClosed) && !isStaff)
                    }
                    lockedMessage={
                      injuredLock
                        ? "🚑 부상 상태로 자동 불참 처리되었습니다 (프로필에서 부상 해제 시 투표 가능)"
                        : onLeaveLock
                          ? "📴 장기불참 상태로 자동 불참 처리되었습니다 (프로필에서 장기불참 해제 시 투표 가능)"
                          : isStarted
                          ? "🔒 경기 시작 후에는 출석 투표를 변경할 수 없습니다"
                          : voteClosed
                            ? "🔒 출석 투표가 종료되었습니다"
                            : "🔒 투표가 마감되었습니다 (매니저·감독만 변경 가능)"
                    }
                  />
                </div>
              )}
              {/* 자체전 선발: 출석 우측 상단 (높이 맞춤) — 취소 경기엔 숨김.
                  지난(done) 경기는 편집 가능한 TeamBuilder 대신 결과만 표기. */}
              {isIntra && m.status !== "canceled" && m.status !== "done" && (
                <div className="order-2 desktop:h-full">
                  <TeamBuilder
                    matchId={m.id}
                    absentCount={byStatus.absent.length}
                    undecidedCount={byStatus.undecided.length}
                    nonVoterCount={nonVoters.length}
                    teamAColor={m.team_a_color}
                    teamBColor={m.team_b_color}
                    teamAName={getTeamName(m, "A")}
                    teamBName={getTeamName(m, "B")}
                    teamACaptain={m.team_a_captain}
                    teamBCaptain={m.team_b_captain}
                    readonly={!isStaff}
                    canAddMercenary={
                      isStaff ||
                      user.id === m.team_a_captain ||
                      user.id === m.team_b_captain
                    }
                  />
                </div>
              )}
              {isIntra && m.status === "done" && (
                <div className="order-2 desktop:h-full">
                  <TeamRecapCard
                    matchId={m.id}
                    attendees={teamMembers}
                    teamAName={getTeamName(m, "A")}
                    teamBName={getTeamName(m, "B")}
                    teamACaptain={m.team_a_captain}
                    teamBCaptain={m.team_b_captain}
                    teamAColor={m.team_a_color}
                    teamBColor={m.team_b_color}
                    editable={isStaff}
                    lockCaptain
                  />
                </div>
              )}
              {/* 포메이션 전체 임베드 — 취소가 아니면 항상 노출(출석투표 위).
                  모바일은 카드 wrapper(흰 배경/테두리/padding) 없이 운동장이 페이지 배경
                  위에 풀폭으로 표시되도록, 데스크탑에서만 카드 스타일 적용.
                  데스크탑은 운동장 비율이 컨테이너 높이를 기준으로 잡혀 폭주할 수 있어
                  명시적인 높이(80vh)를 부여한다. */}
              {m.status !== "canceled" && (
                <div className="order-0 desktop:col-span-2">
                  <FormationCollapsible
                    defaultExpanded={
                      m.status === "done" || m.status === "in_progress"
                    }
                  >
                    <Suspense
                      fallback={
                        <p className="text-sm text-suaza-ink-muted py-6 text-center">
                          포메이션을 불러오는 중...
                        </p>
                      }
                    >
                      <FormationEmbed matchId={m.id} />
                    </Suspense>
                  </FormationCollapsible>
                </div>
              )}

              {/* 댓글:
                  - 상대전(자체전 아님) + 우측이 비어있을 때(=진행 전/중) →
                    데스크탑에선 출석투표 옆 우측 컬럼으로 올림 + 출석 카드 높이에 맞춘 독립 세로 스크롤.
                  - 자체전 또는 종료(=포메이션 임베드가 전체 폭 차지) → 기존처럼 전체 폭 하단. */}
              {!isIntra && m.status !== "done" && m.status !== "canceled" ? (
                <div className="order-2 desktop:h-full desktop:min-h-0">
                  <MatchCommentSection
                    matchId={m.id}
                    comments={comments}
                    myUserId={user.id}
                    myName={me?.name ?? null}
                    myAvatarUrl={
                      (me as { avatar_url?: string | null } | null)
                        ?.avatar_url ?? null
                    }
                    isManager={me?.role === "manager"}
                    scrollableOnDesktop
                  />
                </div>
              ) : (
                <div className="order-4 desktop:col-span-2">
                  <MatchCommentSection
                    matchId={m.id}
                    comments={comments}
                    myUserId={user.id}
                    myName={me?.name ?? null}
                    myAvatarUrl={
                      (me as { avatar_url?: string | null } | null)
                        ?.avatar_url ?? null
                    }
                    isManager={me?.role === "manager"}
                  />
                </div>
              )}
            </div>
            </AttendanceProvider>

            {isStaff && (
              <form action={deleteMatch.bind(null, m.id)} className="flex justify-center mt-4">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 text-sm border border-red-300 text-red-600 rounded-lg px-4 py-2 font-medium hover:bg-red-50 transition"
                >
                  <span>🗑</span>
                  경기 삭제
                </button>
              </form>
            )}
        </IntraTeamColorsProvider>
      </div>
    </main>
  );
}

// 날씨 한 줄 — Suspense 로 streaming. 외부 API 응답이 카드/페이지 첫 paint 를 차단하지 않는다.
// 홈 화면과 동일하게 실패 시에도 사유와 함께 "날씨 정보 없음"을 노출한다.
async function WeatherInline({
  location,
  matchDate,
}: {
  location: string;
  matchDate: string;
}) {
  const result = await fetchWeatherDebug(location, matchDate);
  if (result.ok) {
    const weather = result.data;
    return (
      <span className="inline-flex items-center gap-1 ml-2 tabular-nums">
        <span className="text-base">{weather.emoji}</span>
        <span className="text-suaza-ink font-medium">{weather.label}</span>
        <span>· {weather.tempMax}°</span>
        <span className="ml-1 text-sky-700">
          강수 {weather.precipitationProbability}%
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 ml-2 text-suaza-ink-faint">
      <span>🌤️</span>
      <span>날씨 정보 없음</span>
      <span className="hidden desktop:inline truncate max-w-[260px]">
        · {failureMessage(result.failure)}
      </span>
    </span>
  );
}

// ───────────────────────────────────────────────────────────
// VS Card
// ───────────────────────────────────────────────────────────

function VSCard({
  m,
  isIntra,
  isStaff,
  isStarted,
  dDay,
}: {
  m: Match;
  isIntra: boolean;
  isStaff: boolean;
  isStarted: boolean;
  dDay: string | null;
}) {
  return (
    <section className="bg-white rounded-2xl border border-suaza-border desktop:border-0 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-5 desktop:p-8 flex flex-col gap-4">
      {/* 경기 유형 + 상태 + D-Day */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
            isIntra
              ? "bg-amber-50 text-amber-700"
              : "bg-red-50 text-suaza-accent"
          }`}
        >
          <span>{isIntra ? "⚽" : "🆚"}</span>
          {isIntra ? "자체전" : "상대전"}
        </span>
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${MATCH_STATUS_BADGE[m.status]}`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: statusDotColor(m.status) }}
          />
          {MATCH_STATUS_LABEL[m.status]}
        </span>
        {dDay && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
            {dDay}
          </span>
        )}
        <MatchShareButton
          matchId={m.id}
          opponent={m.opponent}
          matchDate={m.match_date}
        />
      </div>

      <div className="grid grid-cols-3 items-center gap-3">
        {isIntra ? (
          <>
            <IntraTeamCircle
              letter="A"
              subtitle={getTeamName(m, "A")}
              fallbackColor={m.team_a_color ?? DEFAULT_TEAM_COLOR.A}
            />
            {isStaff && isStarted ? (
              <ScoreControl
                matchId={m.id}
                ourScore={m.our_score}
                opponentScore={m.opponent_score}
              />
            ) : (
              <ScoreVs
                ourScore={m.our_score}
                opponentScore={m.opponent_score}
              />
            )}
            <IntraTeamCircle
              letter="B"
              subtitle={getTeamName(m, "B")}
              fallbackColor={m.team_b_color ?? DEFAULT_TEAM_COLOR.B}
            />
          </>
        ) : (
          <>
            <TeamSide
              kind="us"
              uniformColor={m.team_a_color ?? DEFAULT_VS_COLOR.A}
            />
            {isStaff && isStarted ? (
              <ScoreControl
                matchId={m.id}
                ourScore={m.our_score}
                opponentScore={m.opponent_score}
              />
            ) : (
              <ScoreVs
                ourScore={m.our_score}
                opponentScore={m.opponent_score}
              />
            )}
            <TeamSide
              kind="opponent"
              name={m.opponent}
              color={m.team_b_color ?? DEFAULT_VS_COLOR.B}
              uniformColor={m.team_b_color ?? DEFAULT_VS_COLOR.B}
            />
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 desktop:gap-4 text-suaza-ink-muted text-sm flex-wrap">
        <span className="inline-flex items-center gap-1">
          <span>📅</span>
          {formatMatchDateLong(m.match_date)}
        </span>
        <span className="hidden desktop:inline text-suaza-ink-faint">·</span>
        <span className="inline-flex items-center gap-1">
          <span>⏰</span>
          {formatMatchTime(m.match_date)}
          {m.duration_hours ? (
            <span className="text-suaza-ink-faint">
              ~{formatMatchEndTime(m.match_date, m.duration_hours)} ({m.duration_hours}시간)
            </span>
          ) : null}
        </span>
        {m.location && (
          <>
            <span className="hidden desktop:inline text-suaza-ink-faint">·</span>
            <span className="inline-flex items-center gap-1 w-full desktop:w-auto justify-center">
              <span>📍</span>
              {m.location}
              {m.status === "scheduled" && (
                <Suspense fallback={null}>
                  <WeatherInline
                    location={m.location}
                    matchDate={m.match_date}
                  />
                </Suspense>
              )}
            </span>
          </>
        )}
      </div>

      {isStaff && (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Link
            href={`/matches/${m.id}?edit=1`}
            className="text-sm font-bold text-suaza-accent bg-red-50 hover:bg-red-100 transition px-4 py-1.5 rounded-lg"
          >
            {m.status === "done" || m.status === "canceled"
              ? "경기 정보 조회 ›"
              : "경기 정보 수정 ›"}
          </Link>
        </div>
      )}
    </section>
  );
}

function ScoreVs({
  ourScore,
  opponentScore,
}: {
  ourScore: number | null;
  opponentScore: number | null;
}) {
  return (
    <div className="flex items-center justify-center gap-2 desktop:gap-3 text-suaza-ink">
      <span className="text-3xl desktop:text-5xl font-bold tabular-nums">
        {ourScore ?? 0}
      </span>
      <span className="text-suaza-ink-muted font-bold text-sm desktop:text-xl">
        VS
      </span>
      <span className="text-3xl desktop:text-5xl font-bold tabular-nums">
        {opponentScore ?? 0}
      </span>
    </div>
  );
}

function TeamSide({
  kind,
  name,
  letter,
  color,
  subtitle,
  uniformColor,
}: {
  kind: "us" | "opponent" | "letter";
  name?: string;
  letter?: "A" | "B";
  color?: string;
  subtitle?: string;
  uniformColor?: string;
}) {
  if (kind === "us") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="relative w-16 h-16 desktop:w-24 desktop:h-24 rounded-full overflow-hidden bg-white">
          <Image
            src="/suaza-emblem.png"
            alt="SUAZA FC"
            fill
            sizes="96px"
            className="object-cover"
          />
        </div>
        <span className="text-sm desktop:text-lg font-bold text-suaza-ink">
          SUAZA FC
        </span>
        {uniformColor && <JerseyMini color={uniformColor} />}
      </div>
    );
  }

  if (kind === "letter") {
    const letterTextCls = isLightHex(color ?? "")
      ? "text-suaza-ink"
      : "text-white";
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          className="w-16 h-16 desktop:w-24 desktop:h-24 rounded-full flex items-center justify-center"
          style={{ backgroundColor: color }}
        >
          <span
            className={`text-2xl desktop:text-4xl font-bold ${letterTextCls}`}
          >
            {letter}
          </span>
        </div>
        <span className="text-sm desktop:text-lg font-bold text-suaza-ink text-center break-keep">
          {subtitle ?? `${letter}팀`}
        </span>
      </div>
    );
  }

  const trimmed = (name ?? "").trim();
  const oppBg = color ?? "#338CF2";
  const oppTextCls = isLightHex(oppBg) ? "text-suaza-ink" : "text-white";
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-16 h-16 desktop:w-24 desktop:h-24 rounded-full flex items-center justify-center"
        style={{ backgroundColor: oppBg }}
      >
        <span className={`text-2xl desktop:text-4xl font-bold ${oppTextCls}`}>
          {trimmed.charAt(0) || "?"}
        </span>
      </div>
      <span className="text-sm desktop:text-lg font-bold text-suaza-ink text-center break-all">
        {trimmed || "(상대팀)"}
      </span>
      {uniformColor && <JerseyMini color={uniformColor} />}
    </div>
  );
}

// 작은 유니폼 아이콘 (팀 이름 아래 표시)
function JerseyMini({ color }: { color: string }) {
  const isLight = isLightHex(color);
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-5 h-5 desktop:w-6 desktop:h-6"
      fill={color}
      stroke={isLight ? "#737a8c" : "rgba(0,0,0,0.25)"}
      strokeWidth={isLight ? 0.6 : 0.4}
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 3 L6 4 L3 7 L4 10.5 L7 10 L7 21 L17 21 L17 10 L20 10.5 L21 7 L18 4 L15 3 L14 4.5 L12 5 L10 4.5 Z" />
    </svg>
  );
}

// hex 색상의 밝기 판단 (Rec. 601 luma > 200 이면 밝은 색)
function isLightHex(hex: string): boolean {
  const m = hex.match(/^#([0-9A-Fa-f]{6})$/);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b > 200;
}

// ───────────────────────────────────────────────────────────
// Attendance Card (new design)
// ───────────────────────────────────────────────────────────

type AttendancePlayer = {
  id: string;
  name: string;
  jersey_number: number | null;
  attending_quarters?: number[] | null;
  voted_at?: string | null;
  is_injured?: boolean | null;
  on_leave?: boolean | null;
};

function AttendanceCard({
  matchId,
  myCondition,
  isManager,
  myName,
  totalMembers,
  totalQuarters,
  quarterActions,
  deadlineStr,
  voteClosed,
  locked,
  lockedMessage,
}: {
  matchId: string;
  /** null = 미설정 ("?") */
  myCondition?: number | null;
  isManager?: boolean;
  myName: string | null;
  totalMembers: number;
  totalQuarters: number;
  quarterActions?: (string | null)[] | null;
  deadlineStr: string;
  voteClosed?: boolean;
  locked?: boolean;
  lockedMessage?: string;
}) {
  return (
    <section className="bg-white rounded-2xl border border-suaza-border desktop:border-0 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-5 desktop:p-8 flex flex-col gap-4 desktop:h-full">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="font-bold text-suaza-ink text-lg">출석</h2>
          <span className="text-xs text-suaza-ink-muted">
            <span className="hidden desktop:inline">전체 </span>
            {totalMembers}명
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {voteClosed ? (
            <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600 font-medium">
              종료됨
            </span>
          ) : (
            <span className="text-xs text-suaza-ink-muted">
              마감 {deadlineStr}
            </span>
          )}
          {isManager && (
            <form action={closeAttendanceVote.bind(null, matchId)}>
              <button
                type="submit"
                disabled={voteClosed}
                className="text-xs font-medium px-2.5 py-1 rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                투표 종료
              </button>
            </form>
          )}
        </div>
      </div>

      <AttendanceCardVote
        matchId={matchId}
        myName={myName}
        myCondition={myCondition}
        isManager={!!isManager}
        totalQuarters={totalQuarters}
        quarterActions={quarterActions}
        locked={!!locked}
        lockedMessage={lockedMessage}
      />
    </section>
  );
}

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────

function statusDotColor(status: string) {
  return (
    MATCH_STATUS_DOT_COLOR[status as keyof typeof MATCH_STATUS_DOT_COLOR] ??
    "#9CA3AF"
  );
}

// 서버 타임존(보통 UTC) 무관하게 KST 기준으로 추출
function kstParts(iso: string) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    weekday: get("weekday"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

const WEEKDAY_KO: Record<string, string> = {
  Sun: "일", Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토",
};

function formatMatchDateLong(iso: string) {
  const p = kstParts(iso);
  const dayKo = WEEKDAY_KO[p.weekday] ?? p.weekday;
  return `${p.year}년 ${Number(p.month)}월 ${Number(p.day)}일 (${dayKo})`;
}

function formatMatchTime(iso: string) {
  const p = kstParts(iso);
  return `${p.hour}:${p.minute}`;
}

function formatMatchEndTime(iso: string, durationHours: number) {
  const end = new Date(
    new Date(iso).getTime() + durationHours * 60 * 60 * 1000,
  ).toISOString();
  const p = kstParts(end);
  return `${p.hour}:${p.minute}`;
}

// ───────────────────────────────────────────────────────────
// AttendanceVote — 홈 페이지가 import 하므로 유지
// ───────────────────────────────────────────────────────────

type VotePlayer = {
  id: string;
  name: string;
  jersey_number: number | null;
};

export function AttendanceVote({
  matchId,
  meId,
  myName,
  myStatus,
  myAttendingQuarters = null,
  byStatus,
  nonVoters,
  isManager,
  totalQuarters = 4,
  quarterActions,
  locked,
  lockedMessage,
}: {
  matchId: string;
  meId: string;
  myName: string | null;
  myStatus: string | null;
  myAttendingQuarters?: number[] | null;
  byStatus: {
    attending: VotePlayer[];
    absent: VotePlayer[];
    undecided: VotePlayer[];
  };
  nonVoters: VotePlayer[];
  isManager?: boolean;
  totalQuarters?: number;
  quarterActions?: (string | null)[] | null;
  locked?: boolean;
  lockedMessage?: string;
}) {
  return (
    <section className="flex flex-col gap-3 p-4 border border-suaza-border rounded-lg">
      <h2 className="font-bold text-suaza-ink">출석</h2>

      <AttendanceCompactVote
        matchId={matchId}
        me={{ id: meId, name: myName ?? "" }}
        myStatus={myStatus}
        myAttendingQuarters={myAttendingQuarters}
        byStatus={byStatus}
        nonVoters={nonVoters}
        isManager={!!isManager}
        totalQuarters={totalQuarters}
        quarterActions={quarterActions}
        locked={!!locked}
        lockedMessage={lockedMessage}
      />
    </section>
  );
}

