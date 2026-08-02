import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/teams/context";
import TeamAdminDetail, { type AdminMember } from "./team-admin-detail";

// 플랫폼 관리자 — 팀 관리 상세: 팀 화면 열람, 회원 탈퇴, 팀 삭제.
export default async function TeamAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await isPlatformAdmin())) {
    redirect(`/?error=${encodeURIComponent("플랫폼 관리자만 접근할 수 있습니다")}`);
  }

  const admin = createAdminClient();
  const [{ data: team }, { data: memberRows }] = await Promise.all([
    admin
      .from("teams")
      .select("id, name, status, region, description, created_at")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("team_members")
      .select(
        "user_id, role, title, status, joined_at, profile:profiles(name, avatar_url, jersey_number)",
      )
      .eq("team_id", id)
      .order("joined_at", { ascending: true }),
  ]);
  if (!team) notFound();

  const members: AdminMember[] = (
    (memberRows ?? []) as unknown as {
      user_id: string;
      role: string;
      title: string;
      status: string;
      joined_at: string;
      profile: { name: string; avatar_url: string | null } | null;
    }[]
  ).map((m) => ({
    userId: m.user_id,
    role: m.role,
    title: m.title,
    status: m.status,
    joinedAt: m.joined_at,
    name: m.profile?.name ?? "(알 수 없음)",
    avatarUrl: m.profile?.avatar_url ?? null,
  }));

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Link
            href="/admin/teams"
            className="inline-flex w-fit items-center gap-1 text-sm text-suaza-ink-muted transition hover:text-suaza-ink"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
            팀 관리
          </Link>
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            {team.name}
          </h1>
          <p className="text-sm text-suaza-ink-muted">
            {team.status === "pending" ? "승인 대기" : "운영 중"}
            {team.region && <span> · {team.region}</span>}
            <span> · 멤버 {members.filter((m) => m.status === "active").length}명</span>
          </p>
          {team.description && (
            <p className="text-sm text-suaza-ink-muted leading-relaxed">
              {team.description}
            </p>
          )}
        </header>

        <TeamAdminDetail
          teamId={team.id}
          teamName={team.name}
          members={members}
        />
      </div>
    </main>
  );
}
