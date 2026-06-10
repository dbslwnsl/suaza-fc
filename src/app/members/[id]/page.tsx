import Link from "next/link";
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
  yearRange,
  type ParticipationRow as SeasonPartRow,
  type PlayerSeasonStat,
} from "@/lib/stats/helpers";
import ProfileEditForm from "./profile-edit-form";
import AvatarUpload from "./avatar-upload";
import DeleteMemberButton from "./delete-member-button";
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
        "id, name, nickname, role, title, positions, jersey_number, birth_date, avatar_url, preferred_foot, is_injured, on_leave",
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
        "id, content, created_at, updated_at, author_id, match_id, match:matches(id, match_date, opponent), author:profiles!coach_comments_author_id_fkey(name, title, avatar_url)",
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
  // 프로필 편집은 본인만 (회장의 타인 편집 권한은 추후 추가). 다른 회원은 동일 레이아웃의 읽기 전용.
  const canEdit = isSelf;
  const positions = (profile.positions ?? []) as Position[];
  const title = (profile.title ?? "player") as MemberTitle;

  // 감독&코치 코멘트: 작성은 감독/코치(title)만, 조회는 본인 또는 감독/코치만(RLS 강제)
  const myTitle = (me?.title ?? "player") as MemberTitle;
  const isCoachingStaff = myTitle === "head_coach" || myTitle === "coach";
  const coachComments = (coachCommentsRaw ?? []) as unknown as CoachComment[];
  const showCoachComments = isCoachingStaff || isSelf;

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
    const my = getter(myStat);
    if (my <= 0) return null;
    const distinct = Array.from(
      new Set(
        Array.from(seasonStatsMap.values())
          .map(getter)
          .filter((v) => v > 0),
      ),
    ).sort((a, b) => b - a);
    const idx = distinct.indexOf(my);
    return idx >= 0 ? idx + 1 : null;
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
  const rankFromMap = (map: Map<string, number>): number | null => {
    const my = map.get(profile.id) ?? 0;
    if (my <= 0) return null;
    const distinct = Array.from(
      new Set(Array.from(map.values()).filter((v) => v > 0)),
    ).sort((a, b) => b - a);
    const idx = distinct.indexOf(my);
    return idx >= 0 ? idx + 1 : null;
  };
  const pointsRank = rankFromMap(seasonPointsByPlayer);

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
      titleBadges={[]}
      awardBadges={getMemberBadges({ title, role: profile.role }).awardBadges}
    />
  );
  // 홈 화면과 동일한 한 줄(5칸) 레이아웃: 출전 | 골 | 어시 | 클린시트 | 포인트.
  // (심판횟수는 제외 — totals 의 0,1,2,3,5 번째)
  // 메달(시즌 1~3위)·순위 뱃지·포인트 강조 기능은 그대로 유지한다.
  const cardStats = [totals[0], totals[1], totals[2], totals[3], totals[5]];
  const statsGrid = (
    <div className="grid grid-cols-5">
      {cardStats.map((t, i) => (
        <Stat
          key={t.label}
          label={t.label}
          value={t.value}
          tone={t.tone}
          rank={t.rank ?? null}
          alwaysShowRank={t.alwaysShowRank}
          showDivider={i > 0}
        />
      ))}
    </div>
  );

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <Link
          href="/members"
          className="text-sm text-suaza-ink-muted hover:underline self-start"
        >
          ← 회원 명단
        </Link>

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
          stats={statsGrid}
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

        {/* 감독&코치 코멘트 — 주발 정보 아래 */}
        {showCoachComments && (
          <CoachCommentSection
            memberId={profile.id}
            memberName={profile.name}
            comments={coachComments}
            matches={playedMatches}
            myUserId={user.id}
            myName={me?.name ?? null}
            myTitle={myTitle}
            myAvatarUrl={me?.avatar_url ?? null}
            canWrite={isCoachingStaff}
            viewerIsSelf={isSelf}
          />
        )}

        {isManager && !isSelf && (
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
  showDivider = false,
}: {
  label: string;
  value: number;
  tone?: "primary";
  /** 시즌 카테고리 순위 (있으면 정수). 1~3위는 메달, 그 외는 alwaysShowRank 일 때만 표기. */
  rank?: number | null;
  /** true 면 4위 이상도 "N위" 뱃지로 표기 (포인트용). */
  alwaysShowRank?: boolean;
  /** 좌측 세로 구분선 (첫 칸 제외) */
  showDivider?: boolean;
}) {
  const valueCls = tone === "primary" ? "text-blue-700" : "text-suaza-ink";
  const labelCls = tone === "primary" ? "text-blue-600" : "text-suaza-ink-muted";
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  // 메달이 없는데 alwaysShowRank 이면 "N위" 텍스트 뱃지 (포인트 전용)
  const showTextBadge = !medal && alwaysShowRank && rank != null;
  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-1 py-1 ${
        showDivider ? "border-l border-suaza-border" : ""
      }`}
    >
      {medal && (
        <span
          className="absolute -top-3 right-0.5 text-sm leading-none"
          aria-label={`${label} 시즌 ${rank}위`}
          title={`${label} 시즌 ${rank}위`}
        >
          {medal}
        </span>
      )}
      {showTextBadge && (
        <span
          className={`absolute -top-3 right-0 px-1 py-0.5 rounded-full text-[9px] font-bold leading-none text-suaza-ink ${
            tone === "primary" ? "bg-blue-100" : "bg-gray-200"
          }`}
          aria-label={`${label} 시즌 ${rank}위`}
          title={`${label} 시즌 ${rank}위`}
        >
          {rank}위
        </span>
      )}
      <span className={`text-xl sm:text-2xl font-bold tabular-nums ${valueCls}`}>
        {value}
      </span>
      <span className={`text-[11px] sm:text-xs whitespace-nowrap ${labelCls}`}>
        {label}
      </span>
    </div>
  );
}

