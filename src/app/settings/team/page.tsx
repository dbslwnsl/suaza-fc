import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeam } from "@/lib/teams/context";
import TeamSettingsForm from "./team-settings-form";

// 팀 설정 — 팀명·엠블럼·초대코드 관리. 현재 팀의 회장·감독(manager) 전용.
export default async function TeamSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const team = await getCurrentTeam();
  if (!team || team.role !== "manager") {
    redirect(
      `/settings?error=${encodeURIComponent("팀 회장·감독만 접근할 수 있습니다")}`,
    );
  }

  const { data: row } = await supabase
    .from("teams")
    .select("id, name, emblem_url, invite_code")
    .eq("id", team.id)
    .single();

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            팀 설정
          </h1>
          <p className="text-sm text-suaza-ink-muted">
            팀 이름·엠블럼을 바꾸고, 초대코드로 새 멤버를 받아보세요.
          </p>
        </header>

        <TeamSettingsForm
          initialName={row?.name ?? team.name}
          emblemUrl={row?.emblem_url ?? team.emblem_url}
          inviteCode={row?.invite_code ?? ""}
        />
      </div>
    </main>
  );
}
