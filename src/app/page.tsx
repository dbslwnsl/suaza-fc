import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
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
  isAttendanceVoteLocked,
  type Match,
} from "@/lib/matches/helpers";
import PastMatchCard from "./matches/past-match-card";
import NoticeCard from "./notice-card";
import TeamSwitcher from "@/components/team-switcher";
import {
  getMyTeams,
  getCurrentTeam,
  isPlatformAdmin,
  DEFAULT_TEAM_ID,
} from "@/lib/teams/context";
import { type PostCategory } from "@/lib/board/helpers";
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

  // 멀티팀 — 현재 팀 컨텍스트. 모든 리스트 쿼리를 이 팀으로 필터한다.
  const myTeams = await getMyTeams();
  const resolvedTeam = await getCurrentTeam();
  // 팀 소속이 없고 열람 중인 팀도 없는 플랫폼 관리자 — 관리자 화면이 홈.
  if (!resolvedTeam && (await isPlatformAdmin())) {
    redirect("/admin/teams");
  }
  const currentTeam = resolvedTeam ?? {
    id: DEFAULT_TEAM_ID,
    name: "수아자FC",
    slug: "suaza-fc",
    emblem_url: "/suaza-emblem.png",
    role: "player",
    title: "player",
  };
  const teamId = currentTeam.id;

  // 출석 마감 판정용 현재 시각 — 서버 컴포넌트라 요청당 1회 실행이라 안전.
  // (react-hooks/purity 는 클라이언트 재렌더를 가정한 규칙이라 여기선 예외 처리)
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  const [
    { data: profile },
    { data: latestNotice },
    { data: upcomingMatch },
    { data: lastMatch },
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
      .eq("team_id", teamId)
      .eq("is_notice", true)
      .order("created_at", { ascending: false })
      .limit(3),
    // 예정 + 진행중(라이브) 경기 — 진행중 경기도 홈에 계속 노출한다.
    // auto_progress_due_matches 가 시각 지난 경기를 in_progress 로 넘기므로
    // 진행중 경기의 match_date 는 항상 예정 경기보다 앞서 asc 정렬로 우선된다.
    supabase
      .from("matches")
      .select("*")
      .eq("team_id", teamId)
      .in("status", ["scheduled", "in_progress"])
      .order("match_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    // 일정&결과 페이지의 "지난 경기" 카드와 동일하게 종료/취소 경기 최근 2건
    supabase
      .from("matches")
      .select("*")
      .eq("team_id", teamId)
      .in("status", ["done", "canceled"])
      .order("match_date", { ascending: false })
      .limit(2),
  ]);

  const upcoming = upcomingMatch as Match | null;
  // 예정 경기 투표 잠금 여부(마감/종료/시작) — 날짜 라인 "투표마감" 표기 및 투표 패널 잠금에 공용.
  const upcomingLocked = upcoming
    ? isAttendanceVoteLocked(upcoming, nowMs)
    : false;
  const recentMatches = (lastMatch ?? []) as Match[];
  const notices = (latestNotice ?? []) as unknown as NoticeRow[];

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
          .select(
            "id, name, jersey_number, positions, is_injured, on_leave, team_members!inner(team_id)",
          )
          .eq("team_members.team_id", teamId)
          .eq("team_members.status", "active")
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
        // 부상/장기불참이라도 본인/매니저가 명시적으로 투표한 상태는 그대로 존중.
        // (부상 상태는 프로필에서만 변경 — 출석 표기와 분리. 매치 상세와 동일)
        byStatus[row.status].push(enriched);
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
    // 부상/장기불참은 '기본값'으로만 불참. 본인이 직접 투표하면 그 투표를 우선.
    // (부상 해제는 프로필에서만 — 경기상세와 동일)
    const meBlocked =
      !!(profile as { is_injured?: boolean | null })?.is_injured ||
      !!(profile as { on_leave?: boolean | null })?.on_leave;
    myStatus = m?.status ?? (meBlocked ? "absent" : null);
    myAttendingQuarters = m?.attending_quarters ?? null;
  }

  const positions = (profile?.positions ?? []) as Position[];
  const foot = (profile?.preferred_foot ?? null) as PreferredFoot | null;

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[800px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-4">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          {/* 팀 브랜딩 — 소속 팀이 2개 이상이면 탭해서 전환 */}
          <TeamSwitcher
            current={{
              id: currentTeam.id,
              name: currentTeam.name,
              emblem_url: currentTeam.emblem_url,
            }}
            teams={myTeams.map((t) => ({
              id: t.id,
              name: t.name,
              emblem_url: t.emblem_url,
            }))}
          />
          <div className="flex items-center gap-2">
            {profile && (
              <Link
                href="/settings"
                aria-label="설정"
                title="설정"
                className="inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 text-suaza-ink hover:text-suaza-ink-muted transition"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-[18px] h-[18px] sm:w-5 sm:h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M3 6h18" />
                  <path d="M3 12h18" />
                  <path d="M3 18h18" />
                </svg>
              </Link>
            )}
          </div>
        </header>

        {/* Profile Card — 카드 전체가 내 프로필로 이동하는 탭 영역 */}
        <section className="flex flex-col gap-4">
          <div className="relative flex items-start gap-3 sm:gap-4">
            {profile && (
              <Link
                href={`/members/${user!.id}`}
                aria-label="내 프로필 보기"
                className="absolute inset-0 z-10 rounded-xl transition hover:bg-suaza-bg/40"
              />
            )}
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-x-1.5 gap-y-1 flex-wrap min-w-0">
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
                    {/* 카드 전체가 링크(오버레이) — 화살표는 탭 가능 힌트 장식 */}
                    <span
                      aria-hidden
                      className="inline-flex shrink-0 items-center text-suaza-ink-muted"
                    >
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

          </div>
        </section>

        {/* 프로필 카드 폭에 맞춘 공지 위 가로 구분선 */}
        <div className="h-px bg-suaza-border" />

        {/* 공지 — 최신순 최대 3개 (없으면 안내) */}
        {notices.length > 0 ? (
          <div className="flex flex-col divide-y divide-suaza-border border-l-2 border-suaza-accent pl-4">
            {notices.map((n, i) => (
              <div key={n.id} className="py-3 first:pt-0 last:pb-0">
                <NoticeCard notice={n} showLabel={i === 0} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2 py-0.5 rounded bg-gray-200 text-gray-600 font-medium">
              공지
            </span>
            <span className="text-sm text-suaza-ink-muted">
              등록된 공지가 없습니다
            </span>
          </div>
        )}

        {/* 공지 아래 가로 구분선 */}
        <div className="h-px bg-suaza-border" />

        {/* Upcoming Match + Attendance */}
        {upcoming && (
          <section className="flex flex-col gap-3">
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
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-suaza-ink-muted truncate min-w-0">
                  {formatMatchDate(upcoming.match_date)}
                </span>
                {upcomingLocked && (
                  <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    투표마감
                  </span>
                )}
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
              locked={upcomingLocked}
            />
          </section>
        )}

        {/* 지난 경기 — 일정&결과 페이지와 동일한 카드 디자인. 최근 2건. */}
        {recentMatches.length > 0 && (
          <section className="flex flex-col gap-3">
            {/* "지난 경기" 위 가로 구분선 */}
            <div className="h-px bg-suaza-border" />
            {/* 제목 줄 전체가 일정&결과로 이동하는 링크 */}
            <Link
              href="/matches"
              aria-label="지난 경기 더보기"
              className="flex items-center justify-between gap-2 transition hover:opacity-70"
            >
              <h2 className="text-lg font-bold text-suaza-ink">지난 경기</h2>
              <svg
                className="w-4 h-4 shrink-0 text-suaza-ink-faint"
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
            </Link>
            <div className="grid grid-cols-1 gap-0 divide-y divide-suaza-border">
              {recentMatches.map((m) => (
                <div key={m.id} className="py-4 first:pt-0">
                  <PastMatchCard match={m} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
