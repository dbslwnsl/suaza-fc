import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/teams/context";
import TeamsAdminList, { type AdminTeam } from "./teams-list";

// 플랫폼 관리자 — 전체 팀 현황 + 팀 생성 신청 승인/거절.
export default async function PlatformTeamsPage() {
  if (!(await isPlatformAdmin())) {
    redirect(`/?error=${encodeURIComponent("플랫폼 관리자만 접근할 수 있습니다")}`);
  }

  // 관리자 검증 후 admin 클라이언트로 전체 팀 + 멤버 수 조회
  const admin = createAdminClient();
  const [{ data: teams }, { data: memberRows }] = await Promise.all([
    admin
      .from("teams")
      .select("id, name, status, region, description, invite_code, created_at")
      .order("status", { ascending: false }) // pending 먼저
      .order("created_at", { ascending: false }),
    admin
      .from("team_members")
      .select("team_id, status"),
  ]);

  const counts = new Map<string, number>();
  for (const r of (memberRows ?? []) as { team_id: string; status: string }[]) {
    if (r.status !== "active") continue;
    counts.set(r.team_id, (counts.get(r.team_id) ?? 0) + 1);
  }

  const list: AdminTeam[] = (
    (teams ?? []) as {
      id: string;
      name: string;
      status: string;
      region: string | null;
      description: string | null;
      created_at: string;
    }[]
  ).map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    region: t.region,
    description: t.description,
    createdAt: t.created_at,
    memberCount: counts.get(t.id) ?? 0,
  }));

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            팀 관리
          </h1>
          <p className="text-sm text-suaza-ink-muted">
            생성 신청을 승인·거절하고, 전체 팀 현황을 확인합니다. 팀 열람은 홈
            상단 팀 전환에서.
          </p>
        </header>

        <TeamsAdminList teams={list} />
      </div>
    </main>
  );
}
