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
import ProfileEditForm from "./profile-edit-form";
import AvatarUpload from "./avatar-upload";
import DeleteMemberButton from "./delete-member-button";
import CoachCommentSection, { type CoachComment } from "./coach-comments";

type StatDef = { key: string; label: string; sort_order: number };

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

  const [
    { data: profile },
    { data: me },
    { data: statsRaw },
    { data: defs },
    { data: coachCommentsRaw },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, name, nickname, role, title, positions, jersey_number, birth_date, avatar_url, preferred_foot",
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
      .select("key, label, sort_order")
      .order("sort_order", { ascending: true })
      .order("key", { ascending: true }),
    supabase
      .from("coach_comments")
      .select(
        "id, content, created_at, updated_at, author_id, match_id, match:matches(id, match_date, opponent), author:profiles!coach_comments_author_id_fkey(name, title, avatar_url)",
      )
      .eq("member_id", id)
      .order("created_at", { ascending: true }),
  ]);

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
  const totals: { label: string; value: number }[] = [
    { label: "출전", value: done.length },
    { label: "골", value: done.reduce((a, s) => a + (s.goals ?? 0), 0) },
    { label: "어시", value: done.reduce((a, s) => a + (s.assists ?? 0), 0) },
  ];
  for (const d of (defs ?? []) as StatDef[]) {
    totals.push({
      label: d.label,
      value: done.reduce((a, s) => a + (s.custom_stats?.[d.key] ?? 0), 0),
    });
  }

  const avatarSrc = profile.avatar_url ?? null;

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <Link
          href="/members"
          className="text-sm text-suaza-ink-muted hover:underline self-start"
        >
          ← 회원 명단
        </Link>
        <header className="flex items-center gap-3 flex-wrap">
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
            {profile.name}
          </h1>
          <span
            className={`text-xs px-2 py-0.5 rounded ${TITLE_BADGE[title] ?? TITLE_BADGE.player}`}
          >
            {TITLE_LABEL[title] ?? title}
          </span>
          {profileEmail && (
            <span className="ml-auto text-xs sm:text-sm text-suaza-ink-muted truncate max-w-[60%]">
              {profileEmail}
            </span>
          )}
        </header>

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

        <section className="flex items-center">
          <div className="flex-1 flex justify-start pointer-fine:justify-center">
            <AvatarUpload
              profileId={profile.id}
              src={avatarSrc}
              name={profile.name}
              canEdit={canEdit}
              {...getMemberBadges({ title, role: profile.role })}
            />
          </div>
          <div className="grid grid-cols-[repeat(3,auto)] gap-x-1 gap-y-2">
            {totals.slice(0, 6).map((t) => (
              <Stat key={t.label} label={t.label} value={t.value} />
            ))}
          </div>
        </section>

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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="w-[66px] h-[66px] pointer-fine:w-20 pointer-fine:h-20 flex flex-col items-center justify-center gap-1 px-1 py-2 border border-suaza-border rounded-lg">
      <span className="text-[11px] text-suaza-ink-muted whitespace-nowrap">
        {label}
      </span>
      <span className="text-lg font-bold text-suaza-ink">{value}</span>
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
