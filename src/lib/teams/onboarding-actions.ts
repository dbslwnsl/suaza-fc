"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyTeamJoinRequest } from "@/lib/push/triggers";
import { CURRENT_TEAM_COOKIE } from "./context";

type Result = { ok: false; error: string };

/** 팀 목록에서 선택해 가입 신청 (pending) → 승인 대기 화면으로 */
export async function requestJoinTeam(teamId: string): Promise<Result | never> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing } = await supabase
    .from("team_members")
    .select("status")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing?.status === "active")
    return { ok: false, error: "이미 소속된 팀입니다" };
  if (existing?.status === "pending")
    return { ok: false, error: "이미 가입 신청한 팀입니다 (승인 대기 중)" };

  const { error } = await supabase.from("team_members").insert({
    team_id: teamId,
    user_id: user.id,
    status: "pending",
  });
  if (error) return { ok: false, error: error.message };

  // 그 팀 매니저(회장·감독)들에게 가입 신청 알림
  const { data: me } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();
  const applicantName = me?.name ?? "새 회원";
  after(async () => {
    try {
      await notifyTeamJoinRequest(
        {
          title: "팀 가입 신청",
          body: `${applicantName} 님이 가입을 신청했어요`,
          url: "/admin/join-requests",
        },
        teamId,
      );
    } catch (e) {
      console.error("[push] 팀 가입 신청 알림 실패", e);
    }
  });

  redirect("/pending-approval");
}

/** 초대코드로 팀을 찾아 가입 신청 */
export async function requestJoinByCode(code: string): Promise<Result | never> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { ok: false, error: "초대코드를 입력해 주세요" };

  const supabase = await createClient();
  const { data: team } = await supabase
    .from("teams")
    .select("id")
    .eq("invite_code", trimmed)
    .maybeSingle();
  if (!team) return { ok: false, error: "초대코드에 해당하는 팀이 없습니다" };

  return requestJoinTeam(team.id);
}

/** 이름 → URL 슬러그 (한글 등 비영문은 제거되므로 랜덤 접미사로 유일성 보장) */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const rand = Math.random().toString(36).slice(2, 6);
  return base ? `${base}-${rand}` : `team-${rand}`;
}

/** 새 팀 생성 — 생성자가 회장으로 즉시 시작 (RPC: 멤버 등록 + 기본 기록항목 시딩) */
export async function createTeam(name: string): Promise<Result | never> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "팀 이름을 입력해 주세요" };
  if (trimmed.length > 20)
    return { ok: false, error: "팀 이름은 20자 이내로 입력해 주세요" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: teamId, error } = await supabase.rpc("create_team_with_owner", {
    p_name: trimmed,
    p_slug: slugify(trimmed),
  });
  if (error || !teamId) {
    return { ok: false, error: error?.message ?? "팀 생성에 실패했습니다" };
  }

  // 새 팀을 현재 팀으로 설정
  const store = await cookies();
  store.set(CURRENT_TEAM_COOKIE, teamId as string, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/");
}
