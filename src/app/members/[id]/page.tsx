import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type MemberTitle,
  type Position,
  type PreferredFoot,
} from "@/lib/members/positions";
import { getMemberBadges } from "@/lib/members/badges";
import {
  aggregateSeason,
  pointsForParticipation,
  pointValueMap,
  seasonRank,
  yearRange,
  type ParticipationRow as SeasonPartRow,
  type PlayerSeasonStat,
} from "@/lib/stats/helpers";
import ProfileEditForm from "./profile-edit-form";
import AvatarUpload from "./avatar-upload";
import DeleteMemberButton from "./delete-member-button";
import MemberTitleEditor from "./title-editor";
import CoachCommentSection, { type CoachComment } from "./coach-comments";

type StatDef = {
  key: string;
  label: string;
  sort_order: number;
  point_value?: number;
};

// 기본/합계 항목 — 별도 표기되거나 합계라 항목 목록에서 제외
const BUILTIN_TOTAL_KEYS = new Set([
  "goals",
  "assists",
  "attendance",
  "points",
]);

type ParticipationRow = {
  goals: number;
  assists: number;
  custom_stats: Record<string, number> | null;
  match: {
    id: string;
    match_date: string;
    opponent: string;
    status: string;
  } | null;
};

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const { error, message } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // 현재 시즌(달력 연도) — "득점왕/어시왕/CS왕/심판왕" 순위 산정용
  const seasonYear = new Date().getFullYear();
  const { from: seasonFrom, to: seasonTo } = yearRange(seasonYear);

  const [
    { data: profile },
    { data: me },
    { data: statsRaw },
    { data: defs },
    { data: coachCommentsRaw },
    { data: seasonMatchesRaw },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, name, nickname, role, title, positions, jersey_number, birth_date, avatar_url, preferred_foot, is_injured, on_leave, profile_completed",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("profiles")
      .select("role, title, name, avatar_url")
      .eq("id", user.id)
      .single(),
    supabase
      .from("match_participations")
      .select(
        "goals, assists, custom_stats, match:matches(id, match_date, opponent, status)",
      )
      .eq("player_id", id)
      .is("archived_at", null),
    supabase
      .from("stat_definitions")
      .select("key, label, sort_order, point_value")
      .is("hidden_at", null)
      .order("sort_order", { ascending: true })
      .order("key", { ascending: true }),
    supabase
      .from("coach_comments")
      .select(
        "id, content, created_at, updated_at, author_id, parent_id, match_id, match:matches(id, match_date, opponent), author:profiles!coach_comments_author_id_fkey(name, title, avatar_url)",
      )
      .eq("member_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("matches")
      .select("id, match_date")
      .eq("status", "done")
      .gte("match_date", seasonFrom)
      .lt("match_date", seasonTo),
  ]);

  // 시즌 종료 경기들에 대한 전체 회원 참여 데이터 — 순위 산정용
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

  if (!profile) notFound();

  // 회원 이메일은 auth.users 에만 있어 admin 클라이언트로 조회
  // (본인은 자기 user.email 사용해 admin 호출 절약)
  const isSelf = user.id === profile.id;
  let profileEmail: string | null = null;
  if (isSelf) {
    profileEmail = user.email ?? null;
  } else {
    try {
      const admin = createAdminClient();
      const { data: target } = await admin.auth.admin.getUserById(profile.id);
      profileEmail = target?.user?.email ?? null;
    } catch (e) {
      // 가장 흔한 원인: SUPABASE_SERVICE_ROLE_KEY 미설정. 서버 로그에 원인을 남긴다.
      console.warn(
        `[members/[id]] 다른 회원 이메일 조회 실패 (profile.id=${profile.id}). SUPABASE_SERVICE_ROLE_KEY 환경변수가 .env.local/배포환경에 있는지 확인하세요.`,
        e instanceof Error ? e.message : e,
      );
      profileEmail = null;
    }
  }
  const isManager = me?.role === "manager";
  // 프로필 편집은 본인만. 다른 회원은 동일 레이아웃의 읽기 전용.
  const canEdit = isSelf;
  // 단, 회장(president)·감독(head_coach)·매니저는 타인의 부상/장기불참만 변경 가능.
  const canEditOthersStatus =
    isManager ||
    (me?.title ?? "player") === "president" ||
    (me?.title ?? "player") === "head_coach";
  // 가입 직후 첫 프로필 입력 단계 — 본인 + 아직 프로필 미완성.
  // 이때는 기록/코멘트 없이 입력 전용 화면("프로필 입력")으로 보여준다.
  const isProfileSetup =
    isSelf && !(profile as { profile_completed?: boolean }).profile_completed;
  const positions = (profile.positions ?? []) as Position[];
  const title = (profile.title ?? "player") as MemberTitle;

  // 감독&코치 코멘트: 작성은 감독/코치(title)만, 조회는 본인 또는 감독/코치만(RLS 강제)
  const myTitle = (me?.title ?? "player") as MemberTitle;
  // 회원 삭제 권한 — 매니저(회장 포함)만. 감독(head_coach)은 매니저 권한이 있어도 삭제는 제외.
  const canDeleteMembers = isManager && myTitle !== "head_coach";
  // 직책 부여 권한 — 회장(president)만.
  const canAssignTitles = myTitle === "president";
  const isCoachingStaff = myTitle === "head_coach" || myTitle === "coach";
  const showCoachComments = isCoachingStaff || isSelf;

  // 코멘트/답글 좋아요 집계 (경기 댓글과 동일 패턴)
  const ccRaw = (coachCommentsRaw ?? []) as unknown as Omit<
    CoachComment,
    "like_count" | "liked_by_me" | "likers"
  >[];
  const ccIds = ccRaw.map((c) => c.id);
  const ccLikeCount = new Map<string, number>();
  const ccLikedByMe = new Set<string>();
  const ccLikers = new Map<
    string,
    { id: string; name: string; avatar_url: string | null }[]
  >();
  if (ccIds.length > 0) {
    const { data: likeRows } = await supabase
      .from("coach_comment_likes")
      .select("comment_id, user_id, user:profiles(name, avatar_url)")
      .in("comment_id", ccIds);
    for (const r of (likeRows ?? []) as unknown as {
      comment_id: string;
      user_id: string;
      user: { name: string; avatar_url: string | null } | null;
    }[]) {
      ccLikeCount.set(r.comment_id, (ccLikeCount.get(r.comment_id) ?? 0) + 1);
      if (r.user_id === user.id) ccLikedByMe.add(r.comment_id);
      const arr = ccLikers.get(r.comment_id) ?? [];
      arr.push({
        id: r.user_id,
        name: r.user?.name ?? "(알 수 없음)",
        avatar_url: r.user?.avatar_url ?? null,
      });
      ccLikers.set(r.comment_id, arr);
    }
  }
  const coachComments: CoachComment[] = ccRaw.map((c) => ({
    ...c,
    like_count: ccLikeCount.get(c.id) ?? 0,
    liked_by_me: ccLikedByMe.has(c.id),
    likers: ccLikers.get(c.id) ?? [],
  }));

  // 코멘트 연결용: 이 회원이 참가한 '종료된' 경기 목록 (최신순, 중복 제거)
  const playedMatches = (() => {
    const seen = new Set<string>();
    const list: { id: string; match_date: string; opponent: string }[] = [];
    for (const r of (statsRaw ?? []) as unknown as ParticipationRow[]) {
      const mt = r.match;
      if (!mt || mt.status !== "done" || seen.has(mt.id)) continue;
      seen.add(mt.id);
      list.push({
        id: mt.id,
        match_date: mt.match_date,
        opponent: mt.opponent,
      });
    }
    return list.sort(
      (a, b) =>
        new Date(b.match_date).getTime() - new Date(a.match_date).getTime(),
    );
  })();

  // 누적 통계 (종료된 경기만)
  const done = ((statsRaw ?? []) as unknown as ParticipationRow[]).filter(
    (s) => s.match?.status === "done",
  );
  const statDefs = (defs ?? []) as StatDef[];
  const pvMap = pointValueMap(statDefs);
  const totalGoals = done.reduce((a, s) => a + (s.goals ?? 0), 0);
  const totalAssists = done.reduce((a, s) => a + (s.assists ?? 0), 0);
  // 항목별 누적 (custom_stats 키)
  const customAgg: Record<string, number> = {};
  for (const d of statDefs) {
    customAgg[d.key] = done.reduce(
      (a, s) => a + (s.custom_stats?.[d.key] ?? 0),
      0,
    );
  }
  // 포인트: 경기별 계산 (기준일 이전 = 수동 입력, 이후 = 항목 기준점수)
  const totalPoints = done.reduce(
    (sum, s) => sum + pointsForParticipation(s, s.match?.match_date, pvMap),
    0,
  );

  // 시즌 순위 — 본인이 카테고리별 top 3 에 들면 통계 박스에 메달 표기.
  // "Dense ranking": 동률은 같은 순위, 다음 distinct 값이 그 다음 순위. (예: 5,5,4 → 5=1위, 4=2위)
  const seasonParts = (seasonPartsRaw ?? []) as unknown as SeasonPartRow[];
  const seasonAggregated = aggregateSeason(seasonParts, statDefs);
  const seasonStatsMap = new Map<string, PlayerSeasonStat>(
    seasonAggregated.map((s) => [s.player_id, s]),
  );
  const rankInCategory = (
    getter: (s: PlayerSeasonStat) => number,
  ): number | null => {
    const myStat = seasonStatsMap.get(profile.id);
    if (!myStat) return null;
    return seasonRank(
      getter(myStat),
      Array.from(seasonStatsMap.values(), getter),
    );
  };
  const goalRank = rankInCategory((s) => s.goals ?? 0);
  const assistRank = rankInCategory((s) => s.assists ?? 0);
  const cleanSheetRank = rankInCategory(
    (s) => s.custom?.clean_sheets ?? 0,
  );
  const refereeRank = rankInCategory(
    (s) => s.custom?.referee_count ?? 0,
  );
  const attendanceRank = rankInCategory((s) => s.appearances ?? 0);

  // 포인트는 경기별 가중치 계산이라 별도 맵으로 집계 후 순위 산정
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
    seasonPointsByPlayer.get(profile.id) ?? 0,
    seasonPointsByPlayer.values(),
  );

  // 프로필 상단 통계 카드 6칸 순서 (요청):
  //   1줄: 출전 / 골 / 어시
  //   2줄: 클린시트 / 심판횟수 / 포인트   ← 포인트는 파란색 강조
  const customByKey: Record<string, { label: string; value: number }> = {};
  for (const d of statDefs) {
    if (BUILTIN_TOTAL_KEYS.has(d.key)) continue;
    customByKey[d.key] = { label: d.label, value: customAgg[d.key] ?? 0 };
  }
  const totals: {
    label: string;
    value: number;
    tone?: "primary";
    /** 시즌 순위 (있으면 정수). 1~3위는 메달, 그 외는 표기 안 함. */
    rank?: number | null;
    /** true 면 4위 이상도 "N위" 뱃지로 코너에 표기. 포인트 전용. */
    alwaysShowRank?: boolean;
  }[] = [
    { label: "출전", value: done.length, rank: attendanceRank },
    { label: "골", value: totalGoals, rank: goalRank },
    { label: "어시", value: totalAssists, rank: assistRank },
    {
      ...(customByKey.clean_sheets ?? { label: "클린시트", value: 0 }),
      rank: cleanSheetRank,
    },
    {
      ...(customByKey.referee_count ?? { label: "심판횟수", value: 0 }),
      rank: refereeRank,
    },
    {
      label: "포인트",
      value: totalPoints,
      tone: "primary",
      rank: pointsRank,
      // 포인트는 중요한 지표라 4위 이상도 "N위" 뱃지로 항상 표기.
      alwaysShowRank: true,
    },
  ];

  const avatarSrc = profile.avatar_url ?? null;

  // 아바타·통계 그리드는 보기 카드와 편집 폼(상단 카드)에서 공용으로 사용.
  const avatarNode = (
    <AvatarUpload
      profileId={profile.id}
      src={avatarSrc}
      name={profile.name}
      canEdit={canEdit}
      setupMode={isProfileSetup}
      titleBadges={[]}
      awardBadges={getMemberBadges({ title, role: profile.role }).awardBadges}
    />
  );
  // 홈 화면과 동일한 한 줄(5칸) 레이아웃: 출전 | 골 | 어시 | 클린시트 | 포인트.
  // (심판횟수는 제외 — totals 의 0,1,2,3,5 번째)
  // 메달(시즌 1~3위)·순위 뱃지·포인트 강조 기능은 그대로 유지한다.
  const cardStats = [totals[0], totals[1], totals[2], totals[3], totals[5]];
  const statsGrid = (
    <div className="w-full flex flex-col gap-3">
      {/* 헤더: 막대 그래프 아이콘 + "시즌 기록" */}
      <div className="flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" className="w-[15px] h-[15px]" aria-hidden>
          <rect x="3" y="13" width="4.5" height="8" rx="1" fill="#33BD73" />
          <rect x="9.75" y="8" width="4.5" height="13" rx="1" fill="#338CF2" />
          <rect x="16.5" y="4" width="4.5" height="17" rx="1" fill="#FCC733" />
        </svg>
        <span className="text-sm font-bold text-suaza-ink">시즌 기록</span>
      </div>
      <div className="grid grid-cols-5">
        {cardStats.map((t) => (
          <Stat
            key={t.label}
            label={t.label}
            value={t.value}
            tone={t.tone}
            rank={t.rank ?? null}
            alwaysShowRank={t.alwaysShowRank}
          />
        ))}
      </div>
    </div>
  );

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 pt-0 pb-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
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

        <ProfileEditForm
          profileId={profile.id}
          readonly={!canEdit}
          email={profileEmail}
          avatar={avatarNode}
          stats={isProfileSetup ? undefined : statsGrid}
          hideStatus={isProfileSetup}
          setupMode={isProfileSetup}
          hasAvatar={avatarSrc != null}
          canEditStatus={canEditOthersStatus}
          initial={{
            name: profile.name,
            nickname: profile.nickname ?? null,
            positions,
            jersey_number: profile.jersey_number ?? null,
            birth_date: profile.birth_date ?? null,
            preferred_foot: (profile.preferred_foot ?? null) as PreferredFoot | null,
            is_injured: profile.is_injured ?? false,
            on_leave: profile.on_leave ?? false,
            title,
          }}
        />

        {/* 감독&코치 코멘트 — 가입 입력 단계에선 숨김 */}
        {!isProfileSetup && showCoachComments && (
          <CoachCommentSection
            memberId={profile.id}
            memberName={profile.name}
            comments={coachComments}
            matches={playedMatches}
            myUserId={user.id}
            myName={me?.name ?? null}
            myTitle={myTitle}
            myAvatarUrl={me?.avatar_url ?? null}
            canWrite={showCoachComments}
            isCoachingStaff={isCoachingStaff}
            viewerIsSelf={isSelf}
          />
        )}

        {!isProfileSetup && canAssignTitles && !isSelf && (
          <MemberTitleEditor
            profileId={profile.id}
            currentTitle={title}
            name={profile.name}
          />
        )}

        {!isProfileSetup && canDeleteMembers && !isSelf && (
          <DeleteMemberButton profileId={profile.id} name={profile.name} />
        )}
      </div>
    </main>
  );
}

// 기록 한 칸 — 홈 화면과 동일한 한 줄(5칸) 레이아웃.
// 시즌 카테고리 순위가 1~3위면 메달, 그 외 포인트는 "N위" 뱃지로 강조,
// 포인트는 tone="primary" 로 파란색 강조 표기.
function Stat({
  label,
  value,
  tone,
  rank,
  alwaysShowRank = false,
}: {
  label: string;
  value: number;
  tone?: "primary";
  /** 시즌 카테고리 순위 (있으면 정수). 1~3위는 "N위" 뱃지, 그 외는 alwaysShowRank 일 때만 표기. */
  rank?: number | null;
  /** true 면 4위 이상도 "N위" 뱃지로 표기 (포인트용). */
  alwaysShowRank?: boolean;
}) {
  const valueCls = tone === "primary" ? "text-blue-600" : "text-suaza-ink";
  const labelCls = tone === "primary" ? "text-blue-600" : "text-[#99A3B8]";
  // 1~3위는 모든 항목에서 "N위" 텍스트 뱃지로 표기. 포인트(alwaysShowRank)는 4위 이상도 표기.
  const showTextBadge = rank != null && (alwaysShowRank || rank <= 3);
  return (
    <div className="flex flex-col items-center justify-start gap-1">
      <span className={`text-2xl font-bold tabular-nums ${valueCls}`}>
        {value}
      </span>
      <span className={`text-xs font-medium whitespace-nowrap ${labelCls}`}>
        {label}
      </span>
      {showTextBadge && rank != null && (
        <span
          className="mt-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none text-white"
          style={{
            backgroundColor:
              rank === 1
                ? "#F5A623"
                : rank === 2
                  ? "#9AA4B2"
                  : rank === 3
                    ? "#C8743E"
                    : "#64748B",
          }}
          aria-label={`${label} 시즌 ${rank}위`}
          title={`${label} 시즌 ${rank}위`}
        >
          {rank}위
        </span>
      )}
    </div>
  );
}

