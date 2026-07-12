"use server";

// 플랫폼 관리자 전용 — 팀 생성 신청 승인/거절.
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTeamDecision } from "@/lib/push/triggers";
import { isPlatformAdmin } from "./context";

type Result = { ok: boolean; error?: string };

/** 해당 팀의 창설자(회장) id 조회 — admin 클라이언트 사용 */
async function findTeamOwner(teamId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("role", "manager")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

export async function approveTeam(teamId: string): Promise<Result> {
  if (!(await isPlatformAdmin()))
    return { ok: false, error: "플랫폼 관리자만 처리할 수 있습니다" };

  const admin = createAdminClient();
  const { data: team, error } = await admin
    .from("teams")
    .update({ status: "active" })
    .eq("id", teamId)
    .eq("status", "pending")
    .select("name")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!team) return { ok: false, error: "이미 처리된 신청입니다" };

  const ownerId = await findTeamOwner(teamId);
  if (ownerId) {
    // 신규 가입 창설자의 전역 승인(approved_at)도 해제 — 승인 대기 화면에서 풀림
    await admin
      .from("profiles")
      .update({ approved_at: new Date().toISOString() })
      .eq("id", ownerId)
      .is("approved_at", null);

    after(async () => {
      try {
        await notifyTeamDecision(
          {
            title: "팀 승인 완료",
            body: `"${team.name}" 팀이 승인되었어요. 이제 팀을 시작할 수 있습니다!`,
            url: "/",
          },
          ownerId,
          teamId,
        );
      } catch (e) {
        console.error("[push] 팀 승인 알림 실패", e);
      }
    });
  }

  revalidatePath("/admin/teams");
  return { ok: true };
}

export async function rejectTeam(teamId: string): Promise<Result> {
  if (!(await isPlatformAdmin()))
    return { ok: false, error: "플랫폼 관리자만 처리할 수 있습니다" };

  const admin = createAdminClient();
  const { data: team } = await admin
    .from("teams")
    .select("name, status")
    .eq("id", teamId)
    .maybeSingle();
  if (!team) return { ok: false, error: "팀을 찾을 수 없습니다" };
  if (team.status !== "pending")
    return { ok: false, error: "승인 대기 상태의 팀만 거절할 수 있습니다" };

  const ownerId = await findTeamOwner(teamId);

  // 거절 알림은 팀 삭제 전에 발송 준비 (라벨은 기본 팀 폴백 — 팀이 사라지므로)
  if (ownerId) {
    after(async () => {
      try {
        await notifyTeamDecision(
          {
            title: "팀 생성 거절",
            body: `"${team.name}" 팀 생성 신청이 거절되었어요.`,
            url: "/onboarding/team",
          },
          ownerId,
        );
      } catch (e) {
        console.error("[push] 팀 거절 알림 실패", e);
      }
    });
  }

  // 이 팀을 참조하는 알림 먼저 정리(FK) → 팀 삭제(멤버십·기록항목은 cascade)
  await admin.from("notifications").delete().eq("team_id", teamId);
  await admin.from("stat_definitions").delete().eq("team_id", teamId);
  const { error } = await admin.from("teams").delete().eq("id", teamId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/teams");
  return { ok: true };
}
