import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyTeams } from "@/lib/teams/context";
import RequestsList, { type JoinRequest } from "./requests-list";

// 팀 가입 신청 승인 — 내가 매니저(회장·감독)인 팀들의 pending 신청 목록.
// 신청자 프로필은 아직 같은 팀이 아니어서 RLS 로 읽을 수 없으므로,
// 매니저 검증 후 서버(admin)로 조회해 표시한다.
export default async function JoinRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const managedTeams = (await getMyTeams()).filter(
    (t) => t.role === "manager",
  );
  if (managedTeams.length === 0) {
    redirect(`/?error=${encodeURIComponent("팀 회장·감독만 접근할 수 있습니다")}`);
  }
  const managedIds = managedTeams.map((t) => t.id);

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("team_members")
    .select(
      "team_id, user_id, joined_at, team:teams(name), profile:profiles(name, avatar_url, jersey_number)",
    )
    .in("team_id", managedIds)
    .eq("status", "pending")
    .order("joined_at", { ascending: true });

  const requests: JoinRequest[] = (
    (rows ?? []) as unknown as {
      team_id: string;
      user_id: string;
      joined_at: string;
      team: { name: string } | null;
      profile: {
        name: string;
        avatar_url: string | null;
        jersey_number: number | null;
      } | null;
    }[]
  ).map((r) => ({
    teamId: r.team_id,
    userId: r.user_id,
    requestedAt: r.joined_at,
    teamName: r.team?.name ?? "팀",
    name: r.profile?.name ?? "(알 수 없음)",
    avatarUrl: r.profile?.avatar_url ?? null,
  }));

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            가입 신청 관리
          </h1>
          <p className="text-sm text-suaza-ink-muted">
            내 팀에 들어온 가입 신청을 승인하거나 거절합니다.
          </p>
        </header>

        <RequestsList
          requests={requests}
          showTeamName={managedTeams.length > 1}
        />
      </div>
    </main>
  );
}
