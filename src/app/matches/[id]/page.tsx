import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteMatch } from "@/lib/matches/actions";
import { WeatherInlineClient } from "@/components/weather-client";
import {
  IntraTeamCircle,
  IntraTeamColorsProvider,
} from "@/components/intra-team-colors";
import {
  AttendanceCardVote,
  AttendanceCompactVote,
} from "./attendance-vote-panel";
import NewMatchForm from "@/app/matches/new/new-match-form";
import ScoreControl from "./score-control";
import TeamRecapCard from "./team-recap-card";
import TeamBuilder from "./team-builder";
import ParticipationBoard, {
  type ParticipationData,
} from "./participation-board";
import MatchCommentSection, { type MatchComment } from "./match-comments";
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
type Participation = {
  id: string;
  match_id: string;
  player_id: string;
  goals: number;
  assists: number;
  custom_stats: Record<string, number> | null;
  player: {
    id: string;
    name: string;
    jersey_number: number | null;
    positions: string[] | null;
    title: string | null;
  } | null;
};

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

  const [
    { data: match },
    { data: me },
    { data: participationsRaw },
    { data: allMembers },
    { data: attendancesRaw },
    { data: myAttendance },
    { data: commentsRaw },
  ] = await Promise.all([
    supabase.from("matches").select("*").eq("id", id).single(),
    supabase
      .from("profiles")
      .select("role, name, avatar_url")
      .eq("id", user.id)
      .single(),
    supabase
      .from("match_participations")
      .select(
        "id, match_id, player_id, goals, assists, custom_stats, player:profiles(id, name, jersey_number, positions, title)",
      )
      .eq("match_id", id)
      .is("archived_at", null),
    supabase
      .from("profiles")
      .select("id, name, jersey_number, positions, title")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("match_attendances")
      .select(
        "status, team, quarters_attending, updated_at, player:profiles(id, name, jersey_number, positions, title)",
      )
      .eq("match_id", id),
    supabase
      .from("match_attendances")
      .select("status, quarters_attending")
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
  ]);

  const comments = (commentsRaw ?? []) as unknown as MatchComment[];

  type VotePlayer = {
    id: string;
    name: string;
    jersey_number: number | null;
    positions?: string[] | null;
    title?: string | null;
    quarters_attending?: number | null;
    voted_at?: string | null;
  };
  const byStatus: {
    attending: VotePlayer[];
    absent: VotePlayer[];
    undecided: VotePlayer[];
  } = { attending: [], absent: [], undecided: [] };
  const votedIds = new Set<string>();
  // 자체전 팀 편성용: 참석자 + team 배정
  const teamMembers: { id: string; name: string; team: "A" | "B" | null }[] =
    [];
  for (const row of (attendancesRaw ?? []) as unknown as {
    status: keyof typeof byStatus;
    team: "A" | "B" | null;
    quarters_attending: number | null;
    updated_at: string | null;
    player: VotePlayer | null;
  }[]) {
    if (row.player && row.status in byStatus) {
      const enriched: VotePlayer = {
        ...row.player,
        quarters_attending: row.quarters_attending,
        voted_at: row.updated_at,
      };
      byStatus[row.status].push(enriched);
      votedIds.add(row.player.id);
      if (row.status === "attending") {
        teamMembers.push({
          id: row.player.id,
          name: row.player.name,
          team: row.team ?? null,
        });
      }
    }
  }
  const nonVoters = ((allMembers ?? []) as VotePlayer[]).filter(
    (m) => !votedIds.has(m.id),
  );
  for (const key of ["attending", "absent", "undecided"] as const) {
    byStatus[key].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }
  const myAtt = myAttendance as
    | { status: string; quarters_attending: number | null }
    | null;
  const myStatus = myAtt?.status ?? null;
  const myQuartersAttending = myAtt?.quarters_attending ?? null;

  if (!match) notFound();

  const m = match as Match;
  const isStaff = me?.role === "manager" || me?.role === "coach";
  const editing = edit === "1" && isStaff;
  const totalMembers = (allMembers ?? []).length;

  const participations = ((participationsRaw ?? []) as unknown as Participation[])
    .slice()
    .sort((a, b) =>
      (a.player?.name ?? "").localeCompare(b.player?.name ?? "", "ko"),
    );

  const participatedIds = new Set(participations.map((p) => p.player_id));

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
  // 상태 자동 진행은 위에서 auto_progress_due_matches 로 이미 처리됨
  // (조회한 match 는 갱신 후 최신 상태)

  // 편집 모드: 경기 등록 화면과 동일한 레이아웃
  if (editing) {
    return (
      <main className="flex-1 bg-white desktop:bg-suaza-bg px-6 desktop:px-8 py-8 desktop:py-12">
        <div className="max-w-[600px] mx-auto bg-white desktop:rounded-2xl desktop:p-12 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
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
              <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
                경기 정보 수정
              </h1>
            </div>
            <p className="text-sm text-suaza-ink-muted">
              경기 정보를 수정합니다
            </p>
          </header>

          {error && (
            <p className="-mt-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </p>
          )}

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

            <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4 desktop:items-stretch">
              {/* 출석투표: 좌측 상단 — 지난(완료)·취소 경기엔 숨김 */}
              {m.status !== "canceled" && m.status !== "done" && (
                <div className="order-1 desktop:h-full">
                  <AttendanceCard
                    matchId={m.id}
                    meId={user.id}
                    myStatus={myStatus}
                    myQuartersAttending={myQuartersAttending}
                    byStatus={byStatus}
                    nonVoters={nonVoters}
                    isManager={isStaff}
                    myName={me?.name ?? null}
                    totalMembers={totalMembers}
                    totalQuarters={m.total_quarters ?? 4}
                    deadlineStr={deadlineStr}
                    locked={
                      isStarted ||
                      (deadlinePassed && !isStaff)
                    }
                    lockedMessage={
                      isStarted
                        ? "🔒 경기 시작 후에는 출석 투표를 변경할 수 없습니다"
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
                    attendees={teamMembers}
                    absentCount={byStatus.absent.length}
                    undecidedCount={byStatus.undecided.length}
                    nonVoterCount={nonVoters.length}
                    teamAColor={m.team_a_color}
                    teamBColor={m.team_b_color}
                    teamAName={getTeamName(m, "A")}
                    teamBName={getTeamName(m, "B")}
                    readonly={!isStaff}
                  />
                </div>
              )}
              {isIntra && m.status === "done" && (
                <div className="order-2 desktop:col-span-2">
                  <TeamRecapCard
                    matchId={m.id}
                    attendees={teamMembers}
                    teamAName={getTeamName(m, "A")}
                    teamBName={getTeamName(m, "B")}
                    editable={isStaff}
                  />
                </div>
              )}
              {/* 선수별 기록: 전체 폭 하단 — 예정된 경기에선 숨김 */}
              {m.status !== "scheduled" && (
                <div className="order-3 desktop:col-span-2">
                  <ParticipationBoard
                    matchId={m.id}
                    isStaff={isStaff}
                    isManager={me?.role === "manager"}
                    isStarted={isStarted}
                    participations={
                      participations as unknown as ParticipationData[]
                    }
                    attendingMembers={
                      byStatus.attending.filter(
                        (a) => !participatedIds.has(a.id),
                      ) as unknown as ParticipationData["player"][]
                    }
                  />
                </div>
              )}

              {/* 댓글: 데스크탑 — 출석/팀편성 아래 전체 폭. 모바일 — 가장 아래 */}
              <div className="order-4 desktop:col-span-2">
                <MatchCommentSection
                  matchId={m.id}
                  comments={comments}
                  myUserId={user.id}
                  myName={me?.name ?? null}
                  myAvatarUrl={
                    (me as { avatar_url?: string | null } | null)?.avatar_url ??
                    null
                  }
                  isManager={me?.role === "manager"}
                />
              </div>
            </div>

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

      <div className="flex items-center justify-center gap-2 flex-wrap">
        {isStaff && (
          <Link
            href={`/matches/${m.id}?edit=1`}
            className="text-sm font-bold text-suaza-accent bg-red-50 hover:bg-red-100 transition px-4 py-1.5 rounded-lg"
          >
            경기 정보 수정 ›
          </Link>
        )}
        <Link
          href={`/matches/${m.id}/formation`}
          className="text-sm font-medium text-suaza-ink bg-gray-100 hover:bg-gray-200 transition px-4 py-1.5 rounded-lg"
        >
          포메이션 ›
        </Link>
      </div>
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
  quarters_attending?: number | null;
  voted_at?: string | null;
};

function AttendanceCard({
  matchId,
  meId,
  myStatus,
  myQuartersAttending,
  byStatus,
  nonVoters,
  isManager,
  myName,
  totalMembers,
  totalQuarters,
  deadlineStr,
  locked,
  lockedMessage,
}: {
  matchId: string;
  meId: string;
  myStatus: string | null;
  myQuartersAttending: number | null;
  byStatus: {
    attending: AttendancePlayer[];
    absent: AttendancePlayer[];
    undecided: AttendancePlayer[];
  };
  nonVoters: AttendancePlayer[];
  isManager?: boolean;
  myName: string | null;
  totalMembers: number;
  totalQuarters: number;
  deadlineStr: string;
  locked?: boolean;
  lockedMessage?: string;
}) {
  return (
    <section className="bg-white rounded-2xl border border-suaza-border desktop:border-0 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-5 desktop:p-8 flex flex-col gap-4 desktop:h-full">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="font-bold text-suaza-ink text-lg">출석 투표</h2>
          <span className="text-xs text-suaza-ink-muted">
            <span className="hidden desktop:inline">전체 </span>
            {totalMembers}명
          </span>
        </div>
        <span className="text-xs text-suaza-ink-muted">
          마감 {deadlineStr}
        </span>
      </div>

      <AttendanceCardVote
        matchId={matchId}
        me={{ id: meId, name: myName ?? "" }}
        myName={myName}
        myStatus={myStatus}
        myQuartersAttending={myQuartersAttending}
        byStatus={byStatus}
        nonVoters={nonVoters}
        isManager={!!isManager}
        totalQuarters={totalQuarters}
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
  myQuartersAttending = null,
  byStatus,
  nonVoters,
  isManager,
  totalQuarters = 4,
  locked,
  lockedMessage,
}: {
  matchId: string;
  meId: string;
  myName: string | null;
  myStatus: string | null;
  myQuartersAttending?: number | null;
  byStatus: {
    attending: VotePlayer[];
    absent: VotePlayer[];
    undecided: VotePlayer[];
  };
  nonVoters: VotePlayer[];
  isManager?: boolean;
  totalQuarters?: number;
  locked?: boolean;
  lockedMessage?: string;
}) {
  return (
    <section className="flex flex-col gap-3 p-4 border border-suaza-border rounded-lg">
      <h2 className="font-bold text-suaza-ink">출석 투표</h2>

      <AttendanceCompactVote
        matchId={matchId}
        me={{ id: meId, name: myName ?? "" }}
        myStatus={myStatus}
        myQuartersAttending={myQuartersAttending}
        byStatus={byStatus}
        nonVoters={nonVoters}
        isManager={!!isManager}
        totalQuarters={totalQuarters}
        locked={!!locked}
        lockedMessage={lockedMessage}
      />
    </section>
  );
}

