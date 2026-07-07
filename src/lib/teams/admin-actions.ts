"use server";

// 팀 가입 신청 승인/거절 — 그 팀 매니저(회장·감독) 전용.
// 승인 시 신규 가입자의 전역 승인(approved_at)도 함께 처리해
// 미들웨어의 승인 대기 격리를 해제한다.
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyJoinApproved } from "@/lib/push/triggers";

/** 호출자가 해당 팀의 매니저인지 검증. 아니면 에러 메시지 반환. */
async function requireTeamManager(
  teamId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다" };

  const { data } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (data?.role !== "manager")
    return { ok: false, error: "이 팀의 회장·감독만 처리할 수 있습니다" };
  return { ok: true };
}

export async function approveJoinRequest(
  teamId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireTeamManager(teamId);
  if (!gate.ok) return gate;

  const admin = createAdminClient();
  const { error } = await admin
    .from("team_members")
    .update({ status: "active" })
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  // 신규 가입자의 전역 승인 대기(approved_at null)도 해제 — 미들웨어 격리 해제.
  await admin
    .from("profiles")
    .update({ approved_at: new Date().toISOString() })
    .eq("id", userId)
    .is("approved_at", null);

  const { data: team } = await admin
    .from("teams")
    .select("name")
    .eq("id", teamId)
    .maybeSingle();
  after(async () => {
    try {
      await notifyJoinApproved(
        {
          title: "가입 승인",
          body: `${team?.name ?? "팀"} 가입이 승인되었어요. 환영합니다!`,
          url: "/",
        },
        userId,
        teamId,
      );
    } catch (e) {
      console.error("[push] 가입 승인 알림 실패", e);
    }
  });

  revalidatePath("/admin/join-requests");
  return { ok: true };
}

export async function rejectJoinRequest(
  teamId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireTeamManager(teamId);
  if (!gate.ok) return gate;

  const admin = createAdminClient();
  const { error } = await admin
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/join-requests");
  return { ok: true };
}
