import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FOOT_LABEL,
  POSITIONS,
  POSITION_COLOR,
  POSITION_LABEL,
  PREFERRED_FEET,
  TITLE_BADGE,
  TITLE_LABEL,
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
    } catch {
      profileEmail = null;
    }
  }
  const isManager = me?.role === "manager";
  const canEdit = isSelf || isManager;
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

  const top3 = (r: number | null): number | null =>
    r != null && r <= 3 ? r : null;

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
    /** 시즌 1~3위면 메달 표기 (1=🥇 / 2=🥈 / 3=🥉) */
    rank?: number | null;
  }[] = [
    { label: "출전", value: done.length, rank: top3(attendanceRank) },
    { label: "골", value: totalGoals, rank: top3(goalRank) },
    { label: "어시", value: totalAssists, rank: top3(assistRank) },
    {
      ...(customByKey.clean_sheets ?? { label: "클린시트", value: 0 }),
      rank: top3(cleanSheetRank),
    },
    {
      ...(customByKey.referee_count ?? { label: "심판횟수", value: 0 }),
      rank: top3(refereeRank),
    },
    {
      label: "포인트",
      value: totalPoints,
      tone: "primary",
      rank: top3(pointsRank),
    },
  ];

  const avatarSrc = profile.avatar_url ?? null;

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Link
            href="/members"
            className="text-sm text-suaza-ink-muted hover:underline"
          >
            ← 회원 명단
          </Link>
          <Link
            href="/"
            aria-label="홈으로"
            className="relative w-9 h-9 rounded-full overflow-hidden block hover:opacity-80 transition shrink-0 ml-auto"
          >
            <Image
              src="/suaza-emblem.png"
              alt="홈"
              fill
              sizes="36px"
              className="object-cover"
            />
          </Link>
        </div>

        {/* 프로필 카드 — 아바타 + 이름/배지/이메일 + 통계 3×2 그리드 */}
        <section className="rounded-2xl border border-suaza-border p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {/* 아바타는 좌측 정렬 */}
            <div className="shrink-0">
              <AvatarUpload
                profileId={profile.id}
                src={avatarSrc}
                name={profile.name}
                canEdit={canEdit}
                {...getMemberBadges({ title, role: profile.role })}
              />
            </div>
            {/* 이름·직책·이메일을 하나의 덩어리로 묶어 가운데 정렬 */}
            <div className="flex-1 min-w-0 flex flex-col items-center text-center gap-1">
              <div className="flex items-center justify-center gap-2 flex-wrap max-w-full">
                <h1 className="text-xl sm:text-2xl font-bold text-suaza-ink truncate">
                  {profile.name}
                </h1>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${TITLE_BADGE[title] ?? TITLE_BADGE.player}`}
                >
                  {TITLE_LABEL[title] ?? title}
                </span>
              </div>
              {profileEmail && (
                <p className="text-xs sm:text-sm text-suaza-ink-muted truncate max-w-full">
                  {profileEmail}
                </p>
              )}
            </div>
          </div>

          <div className="h-px bg-suaza-border" />

          <div className="grid grid-cols-3 gap-2">
            {totals.slice(0, 6).map((t) => (
              <Stat
                key={t.label}
                label={t.label}
                value={t.value}
                tone={t.tone}
                rank={t.rank ?? null}
              />
            ))}
          </div>
        </section>

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

        {!canEdit ? (
          <ReadOnlyView profile={profile} positions={positions} />
        ) : (
          <ProfileEditForm
            profileId={profile.id}
            isManager={isManager}
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
        )}

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

function Stat({
  label,
  value,
  tone,
  rank,
}: {
  label: string;
  value: number;
  tone?: "primary";
  /** 시즌 카테고리 순위 (있으면 1~3 정수). 그 외는 표기 없음. */
  rank?: number | null;
}) {
  // tone="primary" 는 포인트 강조용 — 파란색 배경/텍스트
  const cls =
    tone === "primary"
      ? "bg-blue-50"
      : "bg-suaza-bg/60";
  const valueCls =
    tone === "primary"
      ? "text-blue-700"
      : "text-suaza-ink";
  const labelCls =
    tone === "primary"
      ? "text-blue-600"
      : "text-suaza-ink-muted";
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-1 py-3 sm:py-4 rounded-xl ${cls}`}
    >
      {medal && (
        <span
          className="absolute top-1 right-1 text-base leading-none"
          aria-label={`${label} 시즌 ${rank}위`}
          title={`${label} 시즌 ${rank}위`}
        >
          {medal}
        </span>
      )}
      <span
        className={`text-xl sm:text-2xl font-bold tabular-nums ${valueCls}`}
      >
        {value}
      </span>
      <span
        className={`text-[11px] sm:text-xs whitespace-nowrap ${labelCls}`}
      >
        {label}
      </span>
    </div>
  );
}

function ReadOnlyView({
  profile,
  positions,
}: {
  profile: {
    nickname: string | null;
    jersey_number: number | null;
    birth_date: string | null;
    preferred_foot: PreferredFoot | null;
  };
  positions: Position[];
}) {
  const dash = "—";
  return (
    <div className="flex flex-col gap-6">
      {/* 별명 */}
      <ReadField label="별명">
        <p className={profile.nickname ? "text-suaza-ink" : "text-suaza-ink-faint"}>
          {profile.nickname || dash}
        </p>
      </ReadField>

      {/* 등번호 / 생년월일 */}
      <div className="grid grid-cols-2 gap-3">
        <ReadField label="등번호">
          <p
            className={
              profile.jersey_number != null
                ? "text-suaza-ink font-medium"
                : "text-suaza-ink-faint"
            }
          >
            {profile.jersey_number != null
              ? `#${profile.jersey_number}`
              : dash}
          </p>
        </ReadField>
        <ReadField label="생년월일">
          <p className={profile.birth_date ? "text-suaza-ink" : "text-suaza-ink-faint"}>
            {profile.birth_date || dash}
          </p>
        </ReadField>
      </div>

      {/* 포지션 */}
      <div className="flex flex-col gap-2">
        <span className="text-suaza-ink text-base font-medium">포지션</span>
        <div className="grid grid-cols-4 gap-2">
          {POSITIONS.map((p) => {
            const on = positions.includes(p);
            const color = POSITION_COLOR[p];
            return (
              <div
                key={p}
                style={
                  on
                    ? {
                        borderColor: color,
                        backgroundColor: `${color}1A`,
                        color,
                      }
                    : undefined
                }
                className={`flex flex-col items-center justify-center gap-0.5 py-3 rounded-lg border-2 ${
                  on
                    ? ""
                    : "border-suaza-border bg-white text-suaza-ink-faint"
                }`}
              >
                <span className="text-lg font-bold">{p}</span>
                <span className="text-[11px]">{POSITION_LABEL[p]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 주발 */}
      <div className="flex flex-col gap-2">
        <span className="text-suaza-ink text-base font-medium">주발</span>
        <div className="grid grid-cols-3 gap-2">
          {PREFERRED_FEET.map((f) => {
            const on = profile.preferred_foot === f;
            return (
              <div
                key={f}
                className={`flex flex-col items-center gap-2 py-4 rounded-lg border-2 ${
                  on
                    ? "border-suaza-accent bg-red-50 text-suaza-accent"
                    : "border-suaza-border bg-white text-suaza-ink-faint"
                }`}
              >
                <ReadFootIcon variant={f} className="h-12" />
                <span className="text-sm font-medium">{FOOT_LABEL[f]}</span>
              </div>
            );
          })}
        </div>
        {!profile.preferred_foot && (
          <span className="text-xs text-suaza-ink-faint">선택된 주발이 없습니다</span>
        )}
      </div>
    </div>
  );
}

function ReadField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-suaza-ink text-base font-medium">{label}</span>
      <div className="w-full px-4 py-3 rounded-lg border border-suaza-border bg-suaza-bg/40 text-base min-h-[48px] flex items-center">
        {children}
      </div>
    </div>
  );
}

const READ_FOOT_IMAGE: Record<
  PreferredFoot,
  { src: string; ratio: string }
> = {
  left: { src: "/foot-left.png", ratio: "aspect-[3/4]" },
  right: { src: "/foot-right.png", ratio: "aspect-[3/4]" },
  both: { src: "/foot-both.png", ratio: "aspect-[3/2]" },
};

function ReadFootIcon({
  variant,
  className = "",
}: {
  variant: PreferredFoot;
  className?: string;
}) {
  const { src, ratio } = READ_FOOT_IMAGE[variant];
  return (
    <div className={`relative ${ratio} ${className}`}>
      <Image
        src={src}
        alt={FOOT_LABEL[variant]}
        fill
        sizes="80px"
        className="object-contain"
      />
    </div>
  );
}
