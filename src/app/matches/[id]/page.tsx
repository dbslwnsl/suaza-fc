import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  deleteMatch,
  setAttendance,
  startMatch,
} from "@/lib/matches/actions";
import AttendanceManagerBoard from "@/components/attendance-manager-board";
import NewMatchForm from "@/app/matches/new/new-match-form";
import ScoreControl from "./score-control";
import ParticipationBoard, {
  type ParticipationData,
} from "./participation-board";
import {
  MATCH_STATUS_BADGE,
  MATCH_STATUS_DOT_COLOR,
  MATCH_STATUS_LABEL,
  RESULT_BADGE,
  RESULT_LABEL,
  getResult,
  isMatchStarted,
  type Match,
} from "@/lib/matches/helpers";

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
        "status, player:profiles(id, name, jersey_number, positions, title)",
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
  for (const row of (attendancesRaw ?? []) as unknown as {
    status: keyof typeof byStatus;
    player: VotePlayer | null;
  }[]) {
    if (row.player && row.status in byStatus) {
      byStatus[row.status].push(row.player);
      votedIds.add(row.player.id);
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
  const result =
    m.status === "done" ? getResult(m.our_score, m.opponent_score) : null;
  const totalMembers = (allMembers ?? []).length;

  const participations = ((participationsRaw ?? []) as unknown as Participation[])
    .slice()
    .sort((a, b) =>
      (a.player?.name ?? "").localeCompare(b.player?.name ?? "", "ko"),
    );

  const participatedIds = new Set(participations.map((p) => p.player_id));

  // D-day 계산
  const matchTs = new Date(m.match_date).getTime();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const matchStart = new Date(m.match_date);
  matchStart.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (matchStart.getTime() - todayStart.getTime()) / 86400000,
  );
  const dDay =
    m.status === "scheduled"
      ? diffDays > 0
        ? `D-${diffDays}`
        : diffDays === 0
          ? "D-DAY"
          : null
      : null;

  // 출석 마감 (경기 전날)
  const deadline = new Date(matchTs);
  deadline.setDate(deadline.getDate() - 1);
  const deadlineStr = `${deadline.getMonth() + 1}/${deadline.getDate()}`;

  const isIntra = m.opponent === "자체전";
  const isStarted = isMatchStarted(m);

  // 시각 경과 + scheduled 면 자동으로 in_progress 로 진행
  // 단, 매니저가 시작 시각 이후 명시적으로 변경한 흔적이 있으면 skip (수동 우선)
  const overriddenAfterStart =
    m.status_overridden_at != null &&
    new Date(m.status_overridden_at).getTime() >=
      new Date(m.match_date).getTime();
  if (m.status === "scheduled" && isStarted && !overriddenAfterStart) {
    await supabase.rpc("auto_progress_match", { p_match_id: m.id });
    m.status = "in_progress";
  }

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
        {/* Header: 경기 목록 + status + D-day */}
        <header className="flex items-center justify-between gap-2">
          <Link
            href="/matches"
            className="text-sm text-suaza-ink-muted hover:underline"
          >
            ‹ 경기 목록
          </Link>
          <div className="flex items-center gap-1.5">
            {result && (
              <span
                className={`text-xs px-2 py-0.5 rounded ${RESULT_BADGE[result]}`}
              >
                {RESULT_LABEL[result]} {m.our_score}-{m.opponent_score}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${MATCH_STATUS_BADGE[m.status]}`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: statusDotColor(m.status) }}
              />
              {MATCH_STATUS_LABEL[m.status]}
              {dDay && <span className="font-bold ml-1">{dDay}</span>}
            </span>
          </div>
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

        <VSCard m={m} isIntra={isIntra} isStaff={isStaff} isStarted={isStarted} />

            <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4">
              {m.status !== "canceled" && (
                <AttendanceCard
                  matchId={m.id}
                  redirectTo={`/matches/${m.id}`}
                  myStatus={myStatus}
                  byStatus={byStatus}
                  nonVoters={nonVoters}
                  isManager={me?.role === "manager"}
                  myName={me?.name ?? null}
                  totalMembers={totalMembers}
                  deadlineStr={deadlineStr}
                  locked={isStarted}
                />
              )}
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
}: {
  m: Match;
  isIntra: boolean;
  isStaff: boolean;
  isStarted: boolean;
}) {
  return (
    <section className="bg-white rounded-2xl border border-suaza-border desktop:border-0 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-5 desktop:p-8 flex flex-col gap-4">
      {/* 경기 유형 + 상태 라벨 */}
      <div className="flex items-center justify-center gap-2">
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
      </div>

      <div className="grid grid-cols-3 items-center gap-3">
        {isIntra ? (
          <>
            <TeamSide kind="letter" letter="A" color="#EF3E3E" />
            {isStaff ? (
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
            <TeamSide kind="letter" letter="B" color="#338CF2" />
          </>
        ) : (
          <>
            <TeamSide kind="us" />
            {isStaff ? (
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
            <TeamSide kind="opponent" name={m.opponent} />
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
            </span>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 flex-wrap">
        {isStaff && m.status === "scheduled" && (
          <form action={startMatch.bind(null, m.id)}>
            <button
              type="submit"
              className="text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 transition px-4 py-1.5 rounded-lg inline-flex items-center gap-1"
            >
              ▶ 경기 시작
              {isStarted && (
                <span className="text-[10px] font-normal opacity-80">
                  (시각 경과)
                </span>
              )}
            </button>
          </form>
        )}
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
}: {
  kind: "us" | "opponent" | "letter";
  name?: string;
  letter?: "A" | "B";
  color?: string;
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
        <span className="text-sm desktop:text-lg font-bold text-suaza-ink">
          {letter}팀
        </span>
      </div>
    );
  }

  const trimmed = (name ?? "").trim();
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-16 h-16 desktop:w-24 desktop:h-24 rounded-full bg-[#338CF2] flex items-center justify-center">
        <span className="text-2xl desktop:text-4xl font-bold text-white">
          {trimmed.charAt(0) || "?"}
        </span>
      </div>
      <span className="text-sm desktop:text-lg font-bold text-suaza-ink text-center break-all">
        {trimmed || "(상대팀)"}
      </span>
    </div>
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
  redirectTo,
  myStatus,
  byStatus,
  nonVoters,
  isManager,
  myName,
  totalMembers,
  deadlineStr,
  locked,
}: {
  matchId: string;
  redirectTo: string;
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
}) {
  const counts = {
    attending: byStatus.attending.length,
    absent: byStatus.absent.length,
    undecided: byStatus.undecided.length,
    nonVoters: nonVoters.length,
  };

  return (
    <section className="bg-white rounded-2xl border border-suaza-border desktop:border-0 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-5 desktop:p-8 flex flex-col gap-4">
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
          <span className="hidden desktop:inline"> 23:59</span>
        </span>
      </div>

      {/* My response */}
      {locked ? (
        <div className="bg-gray-50 rounded-xl p-3 text-center text-xs text-suaza-ink-muted">
          🔒 경기 시작 후에는 출석 투표를 변경할 수 없습니다
        </div>
      ) : (
        <div className="bg-red-50/50 rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-suaza-accent text-white text-xs font-bold flex items-center justify-center shrink-0">
              {myName?.charAt(0) ?? "?"}
            </span>
            <span className="text-sm font-medium text-suaza-ink">
              <span className="desktop:hidden">내 응답을 알려주세요</span>
              <span className="hidden desktop:inline">
                {myName
                  ? `${myName} 님의 응답을 알려주세요`
                  : "응답을 알려주세요"}
              </span>
            </span>
          </div>
          <form action={setAttendance.bind(null, matchId, redirectTo)}>
            <div className="grid grid-cols-3 gap-2">
              <AttendanceVoteButton
                value="attending"
                label="참석"
                icon="✓"
                active={myStatus === "attending"}
                activeClass="bg-green-600 text-white border-green-600"
              />
              <AttendanceVoteButton
                value="absent"
                label="불참"
                active={myStatus === "absent"}
                activeClass="bg-red-600 text-white border-red-600"
              />
              <AttendanceVoteButton
                value="undecided"
                label="미정"
                active={myStatus === "undecided"}
                activeClass="bg-gray-700 text-white border-gray-700"
              />
            </div>
          </form>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 py-2">
        <StatCount label="참석" value={counts.attending} color="#22C55E" />
        <StatCount label="불참" value={counts.absent} color="#EF3E3E" />
        <StatCount label="미정" value={counts.undecided} color="#9CA3AF" />
        <StatCount label="미투표" value={counts.nonVoters} color="#D1D5DB" />
      </div>

      {/* Member pills */}
      {isManager && !locked ? (
        <>
          <h3 className="text-sm font-bold text-suaza-ink">멤버별 응답</h3>
          <AttendanceManagerBoard
            matchId={matchId}
            byStatus={byStatus}
            nonVoters={nonVoters}
          />
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-suaza-ink">멤버별 응답</h3>
          <MemberGroup
            label="참석"
            count={counts.attending}
            color="#22C55E"
            members={byStatus.attending}
          />
          <MemberGroup
            label="불참"
            count={counts.absent}
            color="#EF3E3E"
            members={byStatus.absent}
          />
          <MemberGroup
            label="미정"
            count={counts.undecided}
            color="#9CA3AF"
            members={byStatus.undecided}
          />
          <MemberGroup
            label="미투표"
            count={counts.nonVoters}
            color="#D1D5DB"
            members={nonVoters}
            muted
          />
        </div>
      )}
    </section>
  );
}

function AttendanceVoteButton({
  value,
  label,
  icon,
  active,
  activeClass,
}: {
  value: string;
  label: string;
  icon?: string;
  active: boolean;
  activeClass: string;
}) {
  return (
    <button
      type="submit"
      name="status"
      value={value}
      className={`h-11 rounded-lg border text-sm font-medium transition flex items-center justify-center gap-1 ${
        active
          ? activeClass
          : "bg-white border-suaza-border text-suaza-ink hover:bg-gray-50"
      }`}
    >
      {icon && active && <span>{icon}</span>}
      {label}
    </button>
  );
}

function StatCount({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 border-r border-suaza-border last:border-r-0">
      <div className="flex items-center gap-1">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-xl font-bold text-suaza-ink">{value}</span>
      </div>
      <span className="text-[11px] text-suaza-ink-muted">{label}</span>
    </div>
  );
}

function MemberGroup({
  label,
  count,
  color,
  members,
  muted = false,
}: {
  label: string;
  count: number;
  color: string;
  members: AttendancePlayer[];
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        <span
          className={`text-xs font-bold ${muted ? "text-suaza-ink-muted" : "text-suaza-ink"}`}
        >
          {label} {count}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {members.length === 0 ? (
          <span className="text-xs text-suaza-ink-faint">—</span>
        ) : (
          members.map((m) => (
            <span
              key={m.id}
              className={`text-xs px-2.5 py-0.5 rounded-full border ${
                muted ? "text-suaza-ink-muted bg-gray-50" : "text-suaza-ink bg-white"
              }`}
              style={{ borderColor: muted ? "#E5E7EB" : color }}
            >
              {m.name}
            </span>
          ))
        )}
      </div>
    </div>
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

function formatMatchDateLong(iso: string) {
  const d = new Date(iso);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function formatMatchTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatMatchEndTime(iso: string, durationHours: number) {
  const d = new Date(new Date(iso).getTime() + durationHours * 60 * 60 * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
  redirectTo,
  myStatus,
  byStatus,
  nonVoters,
  isManager,
}: {
  matchId: string;
  redirectTo: string;
  myStatus: string | null;
  byStatus: {
    attending: VotePlayer[];
    absent: VotePlayer[];
    undecided: VotePlayer[];
  };
  nonVoters: VotePlayer[];
  isManager?: boolean;
}) {
  const opts: { value: string; label: string; activeClass: string }[] = [
    {
      value: "attending",
      label: "참석",
      activeClass: "bg-green-600 text-white border-green-600",
    },
    {
      value: "absent",
      label: "불참",
      activeClass: "bg-red-600 text-white border-red-600",
    },
    {
      value: "undecided",
      label: "미정",
      activeClass: "bg-gray-700 text-white border-gray-700",
    },
  ];

  return (
    <section className="flex flex-col gap-3 p-4 border border-suaza-border rounded-lg">
      <h2 className="font-bold text-suaza-ink">출석 투표</h2>

      <form action={setAttendance.bind(null, matchId, redirectTo)}>
        <div className="grid grid-cols-3 gap-2">
          {opts.map((o) => {
            const active = myStatus === o.value;
            return (
              <button
                key={o.value}
                type="submit"
                name="status"
                value={o.value}
                className={`h-10 rounded-lg border text-sm font-medium transition ${
                  active
                    ? o.activeClass
                    : "border-suaza-border text-suaza-ink hover:bg-gray-50"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </form>

      {isManager ? (
        <AttendanceManagerBoard
          matchId={matchId}
          byStatus={byStatus}
          nonVoters={nonVoters}
        />
      ) : (
        <div className="flex flex-col gap-2 pt-1">
          <AttendanceRow
            label="참석"
            count={byStatus.attending.length}
            badgeClass="bg-green-100 text-green-700"
            members={byStatus.attending}
          />
          <AttendanceRow
            label="불참"
            count={byStatus.absent.length}
            badgeClass="bg-red-100 text-red-700"
            members={byStatus.absent}
          />
          <AttendanceRow
            label="미정"
            count={byStatus.undecided.length}
            badgeClass="bg-gray-200 text-gray-700"
            members={byStatus.undecided}
          />
          <div className="h-px bg-suaza-border my-1" />
          <NonVoterRow members={nonVoters} />
        </div>
      )}
    </section>
  );
}

function AttendanceRow({
  label,
  count,
  badgeClass,
  members,
}: {
  label: string;
  count: number;
  badgeClass: string;
  members: VotePlayer[];
}) {
  const names = members.map((m) => m.name);
  return (
    <div className="flex items-start gap-2">
      <span
        className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${badgeClass}`}
      >
        {label} {count}
      </span>
      <span className="text-sm text-suaza-ink-muted leading-relaxed break-keep">
        {names.length > 0 ? names.join(", ") : "—"}
      </span>
    </div>
  );
}

function NonVoterRow({ members }: { members: VotePlayer[] }) {
  if (members.length === 0) {
    return (
      <p className="text-[11px] text-suaza-ink-faint">
        모두 투표를 완료했어요 ✓
      </p>
    );
  }
  const names = members.map((m) => m.name).join(", ");
  return (
    <div className="flex flex-col gap-0.5 text-[11px] text-suaza-ink-faint">
      <span className="font-medium">미투표 ({members.length})</span>
      <span className="break-keep">{names}</span>
    </div>
  );
}

