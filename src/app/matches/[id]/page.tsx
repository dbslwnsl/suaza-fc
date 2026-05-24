import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteMatch } from "@/lib/matches/actions";
import AttendanceManagerBoard from "@/components/attendance-manager-board";
import {
  AttendanceCardVote,
  AttendanceCompactVote,
} from "./attendance-vote-panel";
import NewMatchForm from "@/app/matches/new/new-match-form";
import ScoreControl from "./score-control";
import TeamBuilder from "./team-builder";
import ParticipationBoard, {
  type ParticipationData,
} from "./participation-board";
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
import { fetchWeather, type WeatherInfo } from "@/lib/weather";

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
  ] = await Promise.all([
    supabase.from("matches").select("*").eq("id", id).single(),
    supabase
      .from("profiles")
      .select("role, name")
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
        "status, team, player:profiles(id, name, jersey_number, positions, title)",
      )
      .eq("match_id", id),
    supabase
      .from("match_attendances")
      .select("status")
      .eq("match_id", id)
      .eq("player_id", user.id)
      .maybeSingle(),
  ]);

  type VotePlayer = {
    id: string;
    name: string;
    jersey_number: number | null;
    positions?: string[] | null;
    title?: string | null;
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
    player: VotePlayer | null;
  }[]) {
    if (row.player && row.status in byStatus) {
      byStatus[row.status].push(row.player);
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
  const myStatus = (myAttendance as { status: string } | null)?.status ?? null;

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

  // 예정 경기의 날씨 (있으면 표시)
  const weather: WeatherInfo | null =
    m.status === "scheduled"
      ? await fetchWeather(m.location, m.match_date)
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
            ‹ 경기 목록
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

        <VSCard
          m={m}
          isIntra={isIntra}
          isStaff={isStaff}
          isStarted={isStarted}
          dDay={dDay}
          weather={weather}
        />

            <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4 desktop:items-stretch">
              {/* 출석투표: 좌측 상단 */}
              {m.status !== "canceled" && (
                <div className="order-1 desktop:h-full">
                  <AttendanceCard
                    matchId={m.id}
                    meId={user.id}
                    myStatus={myStatus}
                    byStatus={byStatus}
                    nonVoters={nonVoters}
                    isManager={isStaff}
                    myName={me?.name ?? null}
                    totalMembers={totalMembers}
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
              {/* 자체전 선발: 출석 우측 상단 (높이 맞춤) */}
              {isIntra && m.status !== "canceled" && (
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
              {/* 선수별 기록: 전체 폭 하단 */}
              <div className="order-3 desktop:col-span-2">
                <ParticipationBoard
                  matchId={m.id}
                  isStaff={isStaff}
                  isManager={me?.role === "manager"}
                  myUserId={user.id}
                  isStarted={isStarted}
                  isMyselfAttending={myStatus === "attending"}
                  myProfile={
                    ((allMembers ?? []) as unknown as ParticipationData["player"][]).find(
                      (mm) => mm?.id === user.id,
                    ) ?? null
                  }
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
      </div>
    </main>
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
  weather,
}: {
  m: Match;
  isIntra: boolean;
  isStaff: boolean;
  isStarted: boolean;
  dDay: string | null;
  weather: WeatherInfo | null;
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
            <TeamSide
              kind="letter"
              letter="A"
              color={m.team_a_color ?? DEFAULT_TEAM_COLOR.A}
              subtitle={getTeamName(m, "A")}
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
              kind="letter"
              letter="B"
              color={m.team_b_color ?? DEFAULT_TEAM_COLOR.B}
              subtitle={getTeamName(m, "B")}
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
              {weather && (
                <span className="inline-flex items-center gap-1 ml-2 tabular-nums">
                  <span className="text-base">{weather.emoji}</span>
                  <span className="text-suaza-ink font-medium">
                    {weather.label}
                  </span>
                  <span>· {weather.tempMax}°</span>
                  <span className="ml-1 text-sky-700">
                    강수 {weather.precipitationProbability}%
                  </span>
                </span>
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
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          className="w-16 h-16 desktop:w-24 desktop:h-24 rounded-full flex items-center justify-center"
          style={{ backgroundColor: color }}
        >
          <span className="text-2xl desktop:text-4xl font-bold text-white">
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
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-16 h-16 desktop:w-24 desktop:h-24 rounded-full flex items-center justify-center"
        style={{ backgroundColor: color ?? "#338CF2" }}
      >
        <span className="text-2xl desktop:text-4xl font-bold text-white">
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
  const isLight =
    color.toLowerCase() === "#ffffff" || color.toLowerCase() === "#f9fafb";
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

// ───────────────────────────────────────────────────────────
// Attendance Card (new design)
// ───────────────────────────────────────────────────────────

type AttendancePlayer = {
  id: string;
  name: string;
  jersey_number: number | null;
};

function AttendanceCard({
  matchId,
  meId,
  myStatus,
  byStatus,
  nonVoters,
  isManager,
  myName,
  totalMembers,
  deadlineStr,
  locked,
  lockedMessage,
}: {
  matchId: string;
  meId: string;
  myStatus: string | null;
  byStatus: {
    attending: AttendancePlayer[];
    absent: AttendancePlayer[];
    undecided: AttendancePlayer[];
  };
  nonVoters: AttendancePlayer[];
  isManager?: boolean;
  myName: string | null;
  totalMembers: number;
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
        byStatus={byStatus}
        nonVoters={nonVoters}
        isManager={!!isManager}
        locked={!!locked}
        lockedMessage={lockedMessage}
      >
        {isManager && (
          <AttendanceManagerBoard
            matchId={matchId}
            byStatus={byStatus}
            nonVoters={nonVoters}
          />
        )}
      </AttendanceCardVote>
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
  byStatus,
  nonVoters,
  isManager,
  locked,
  lockedMessage,
}: {
  matchId: string;
  meId: string;
  myName: string | null;
  myStatus: string | null;
  byStatus: {
    attending: VotePlayer[];
    absent: VotePlayer[];
    undecided: VotePlayer[];
  };
  nonVoters: VotePlayer[];
  isManager?: boolean;
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
        byStatus={byStatus}
        nonVoters={nonVoters}
        isManager={!!isManager}
        locked={!!locked}
        lockedMessage={lockedMessage}
      >
        {isManager && (
          <AttendanceManagerBoard
            matchId={matchId}
            byStatus={byStatus}
            nonVoters={nonVoters}
          />
        )}
      </AttendanceCompactVote>
    </section>
  );
}

