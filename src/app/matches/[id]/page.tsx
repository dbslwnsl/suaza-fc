import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addParticipant,
  deleteMatch,
  removeParticipant,
  setAttendance,
  updateParticipant,
} from "@/lib/matches/actions";
import AttendanceManagerBoard from "@/components/attendance-manager-board";
import NewMatchForm from "@/app/matches/new/new-match-form";
import {
  MATCH_STATUS_BADGE,
  MATCH_STATUS_LABEL,
  RESULT_BADGE,
  RESULT_LABEL,
  getResult,
  type Match,
} from "@/lib/matches/helpers";

type StatDef = { key: string; label: string; sort_order: number };

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
  } | null;
};

type MemberOpt = {
  id: string;
  name: string;
  jersey_number: number | null;
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
    { data: statDefs },
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
        "id, match_id, player_id, goals, assists, custom_stats, player:profiles(id, name, jersey_number)",
      )
      .eq("match_id", id),
    supabase
      .from("profiles")
      .select("id, name, jersey_number")
      .order("name", { ascending: true }),
    supabase
      .from("stat_definitions")
      .select("key, label, sort_order")
      .order("sort_order", { ascending: true })
      .order("key", { ascending: true }),
    supabase
      .from("match_attendances")
      .select("status, player:profiles(id, name, jersey_number)")
      .eq("match_id", id),
    supabase
      .from("match_attendances")
      .select("status")
      .eq("match_id", id)
      .eq("player_id", user.id)
      .maybeSingle(),
  ]);

  type VotePlayer = { id: string; name: string; jersey_number: number | null };
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
  const defs = (statDefs ?? []) as StatDef[];
  const totalMembers = (allMembers ?? []).length;

  const participations = ((participationsRaw ?? []) as unknown as Participation[])
    .slice()
    .sort((a, b) =>
      (a.player?.name ?? "").localeCompare(b.player?.name ?? "", "ko"),
    );

  const participatedIds = new Set(participations.map((p) => p.player_id));
  const availableMembers = ((allMembers ?? []) as MemberOpt[]).filter(
    (mem) => !participatedIds.has(mem.id),
  );

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

        <VSCard m={m} isIntra={isIntra} isStaff={isStaff} />

            <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4">
              {m.status === "scheduled" && (
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
                />
              )}
              <ParticipationCard
                isPast={m.status === "done"}
                isStaff={isStaff}
                isManager={me?.role === "manager"}
                participations={participations}
                availableMembers={availableMembers}
                defs={defs}
                matchId={m.id}
              />
            </div>

            <MatchInfoSummary m={m} isStaff={isStaff} />

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
}: {
  m: Match;
  isIntra: boolean;
  isStaff: boolean;
}) {
  return (
    <section className="bg-white rounded-2xl border border-suaza-border desktop:border-0 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-5 desktop:p-8 flex flex-col gap-4">
      <div className="grid grid-cols-3 items-center gap-3">
        {isIntra ? (
          <>
            <TeamSide kind="letter" letter="A" color="#EF3E3E" />
            <VsBadge />
            <TeamSide kind="letter" letter="B" color="#338CF2" />
          </>
        ) : (
          <>
            <TeamSide kind="us" />
            <VsBadge />
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

      <div className="flex items-center justify-center gap-2">
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

function VsBadge() {
  return (
    <span className="text-suaza-ink-muted font-bold text-base desktop:text-2xl text-center">
      VS
    </span>
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
      <div className="bg-red-50/50 rounded-xl p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-suaza-accent text-white text-xs font-bold flex items-center justify-center shrink-0">
            {myName?.charAt(0) ?? "?"}
          </span>
          <span className="text-sm font-medium text-suaza-ink">
            <span className="desktop:hidden">내 응답을 알려주세요</span>
            <span className="hidden desktop:inline">
              {myName ? `${myName} 님의 응답을 알려주세요` : "응답을 알려주세요"}
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

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 py-2">
        <StatCount label="참석" value={counts.attending} color="#22C55E" />
        <StatCount label="불참" value={counts.absent} color="#EF3E3E" />
        <StatCount label="미정" value={counts.undecided} color="#9CA3AF" />
        <StatCount label="미투표" value={counts.nonVoters} color="#D1D5DB" />
      </div>

      {/* Member pills */}
      {isManager ? (
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
// Participation Card
// ───────────────────────────────────────────────────────────

function ParticipationCard({
  isPast,
  isStaff,
  isManager,
  participations,
  availableMembers,
  defs,
  matchId,
}: {
  isPast: boolean;
  isStaff: boolean;
  isManager: boolean;
  participations: Participation[];
  availableMembers: MemberOpt[];
  defs: StatDef[];
  matchId: string;
}) {
  return (
    <section className="bg-white rounded-2xl border border-suaza-border desktop:border-0 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-5 desktop:p-8 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-suaza-ink text-lg">선수별 기록</h2>
        {isStaff && isManager && (
          <Link
            href="/settings/stats"
            className="text-xs text-suaza-accent hover:underline"
          >
            항목 관리 ›
          </Link>
        )}
      </div>

      {!isPast && participations.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-6 flex flex-col items-center gap-2 text-center">
          <span className="text-3xl">⚽</span>
          <span className="font-bold text-suaza-ink">경기 종료 후 입력</span>
          <span className="text-xs text-suaza-ink-muted">
            골 · 도움 · 클린시트 등<span className="hidden desktop:inline"><br />경기가 끝나면 등록할 수 있어요</span>
          </span>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {participations.map((p) =>
            isStaff ? (
              <ParticipationEditRow
                key={p.id}
                p={p}
                matchId={matchId}
                defs={defs}
              />
            ) : (
              <ParticipationReadRow key={p.id} p={p} defs={defs} />
            ),
          )}
        </ul>
      )}

      {isStaff && availableMembers.length > 0 && (
        <form action={addParticipant.bind(null, matchId)} className="flex gap-2">
          <select
            name="player_id"
            required
            defaultValue=""
            className="flex-1 px-3 py-2 rounded-lg border border-dashed border-suaza-border text-sm text-suaza-ink-muted bg-white focus:outline-none focus:border-suaza-button"
          >
            <option value="" disabled>
              + 미리 출전 선수 추가
            </option>
            {availableMembers.map((mem) => (
              <option key={mem.id} value={mem.id}>
                {mem.jersey_number != null ? `#${mem.jersey_number} ` : ""}
                {mem.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="text-sm bg-suaza-button text-white rounded-lg px-3 font-medium hover:opacity-90"
          >
            추가
          </button>
        </form>
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────
// Match Info Summary
// ───────────────────────────────────────────────────────────

function MatchInfoSummary({ m, isStaff }: { m: Match; isStaff: boolean }) {
  const items: { label: string; value: React.ReactNode }[] = [
    { label: "상대팀", value: m.opponent },
    { label: "일시", value: formatMatchDateShort(m.match_date) },
    { label: "장소", value: m.location || "—" },
    {
      label: "상태",
      value: (
        <span className="inline-flex items-center gap-1">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: statusDotColor(m.status) }}
          />
          {MATCH_STATUS_LABEL[m.status]}
        </span>
      ),
    },
  ];

  return (
    <section className="bg-white rounded-2xl border border-suaza-border desktop:border-0 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-5 desktop:p-8 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-suaza-ink text-lg">경기 정보</h2>
        {isStaff && (
          <Link
            href={`/matches/${m.id}?edit=1`}
            className="text-xs text-suaza-accent hover:underline font-medium"
          >
            수정 ›
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 desktop:grid-cols-4 gap-4 text-sm">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col gap-1">
            <span className="text-xs text-suaza-ink-muted">{it.label}</span>
            <span className="font-bold text-suaza-ink">{it.value}</span>
          </div>
        ))}
      </div>

      {m.notes && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-suaza-ink-muted">메모</span>
          <p className="text-sm text-suaza-ink whitespace-pre-wrap">
            {m.notes}
          </p>
        </div>
      )}
    </section>
  );
}

function ParticipationReadRow({
  p,
  defs,
}: {
  p: Participation;
  defs: StatDef[];
}) {
  const stats: string[] = [];
  if (p.goals) stats.push(`골 ${p.goals}`);
  if (p.assists) stats.push(`어시 ${p.assists}`);
  for (const d of defs) {
    const v = p.custom_stats?.[d.key];
    if (v) stats.push(`${d.label} ${v}`);
  }
  return (
    <li className="border border-suaza-border rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
      <span className="font-medium text-suaza-ink">
        {p.player?.jersey_number != null ? `#${p.player.jersey_number} ` : ""}
        {p.player?.name ?? "(알 수 없음)"}
      </span>
      <span className="text-sm text-suaza-ink-muted">
        {stats.length > 0 ? stats.join(" · ") : "기록 없음"}
      </span>
    </li>
  );
}

function ParticipationEditRow({
  p,
  matchId,
  defs,
}: {
  p: Participation;
  matchId: string;
  defs: StatDef[];
}) {
  return (
    <li className="border border-suaza-border rounded-lg p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-suaza-ink">
          {p.player?.jersey_number != null ? `#${p.player.jersey_number} ` : ""}
          {p.player?.name ?? "(알 수 없음)"}
        </span>
        <form action={removeParticipant.bind(null, p.id, matchId)}>
          <button
            type="submit"
            className="text-xs text-red-600 hover:underline"
            aria-label="출전 명단에서 제외"
          >
            제외
          </button>
        </form>
      </div>
      <form
        action={updateParticipant.bind(null, p.id, matchId)}
        className="flex flex-col gap-2"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <NumberField name="goals" label="골" defaultValue={p.goals} />
          <NumberField name="assists" label="어시" defaultValue={p.assists} />
          {defs.map((d) => (
            <NumberField
              key={d.key}
              name={`custom__${d.key}`}
              label={d.label}
              defaultValue={p.custom_stats?.[d.key] ?? ""}
            />
          ))}
        </div>
        <button
          type="submit"
          className="self-end text-sm bg-suaza-button text-white rounded-md px-3 py-1.5 font-medium hover:opacity-90"
        >
          저장
        </button>
      </form>
    </li>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: number | string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-suaza-ink-muted">{label}</span>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={0}
        className="w-full px-2 py-1.5 rounded-md border border-suaza-border text-sm text-suaza-ink focus:outline-none focus:border-suaza-button"
      />
    </label>
  );
}

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────

function statusDotColor(status: string) {
  return status === "scheduled"
    ? "#3B82F6"
    : status === "done"
      ? "#22C55E"
      : "#9CA3AF";
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

function formatMatchDateShort(iso: string) {
  const d = new Date(iso);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} (${days[d.getDay()]}) ${formatMatchTime(iso)}`;
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

