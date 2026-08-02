"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  notifyTeamJoinRequest,
  notifyTeamCreateRequest,
} from "@/lib/push/triggers";
import { getMyTeams } from "./context";

type Result = { ok: boolean; error?: string };

/**
 * 팀 가입 신청 (pending).
 * - 다른 활성 소속이 없는 신규 회원 → 승인 대기 화면으로 리다이렉트
 * - 이미 소속이 있는 회원(추가 가입) → { ok: true } 반환 (화면에서 접수 안내)
 */
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

  // 다른 활성 소속이 없으면(신규) 승인 대기 화면으로, 있으면(추가 가입) 접수 안내.
  const myTeams = await getMyTeams();
  if (myTeams.length === 0) redirect("/pending-approval");
  return { ok: true };
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
    .eq("status", "active") // 승인 대기 팀은 코드 가입 불가
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

/**
 * 새 팀 생성 신청 — 팀은 pending 으로 만들어지고, 플랫폼 관리자 승인 후 시작.
 * 반환 { ok: true } = 신청 접수(기존 회원 — 화면에서 안내 표시).
 * 신규 가입자(다른 소속 없음)는 승인 대기 화면으로 리다이렉트.
 */
export async function createTeam(
  name: string,
  region: string,
  description: string,
): Promise<{ ok: boolean; error?: string } | never> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "팀 이름을 입력해 주세요" };
  if (trimmed.length > 20)
    return { ok: false, error: "팀 이름은 20자 이내로 입력해 주세요" };
  if (region.trim().length > 30)
    return { ok: false, error: "활동 지역은 30자 이내로 입력해 주세요" };
  if (description.trim().length > 100)
    return { ok: false, error: "팀 소개는 100자 이내로 입력해 주세요" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: teamId, error } = await supabase.rpc("create_team_with_owner", {
    p_name: trimmed,
    p_slug: slugify(trimmed),
    p_region: region.trim() || null,
    p_description: description.trim() || null,
  });
  if (error || !teamId) {
    return { ok: false, error: error?.message ?? "팀 생성 신청에 실패했습니다" };
  }

  // 플랫폼 관리자에게 승인 요청 알림
  const { data: me } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();
  const applicantName = me?.name ?? "회원";
  after(async () => {
    try {
      await notifyTeamCreateRequest({
        title: "새 팀 생성 신청",
        body: `${applicantName} 님이 "${trimmed}" 팀 생성을 신청했어요`,
        url: "/admin/teams",
      });
    } catch (e) {
      console.error("[push] 팀 생성 신청 알림 실패", e);
    }
  });

  // 다른 활성 소속이 없는 신규 가입자 → 승인 대기 화면으로.
  // (미들웨어: approved_at null + 멤버십 있음 → /pending-approval)
  const myTeams = await getMyTeams();
  if (myTeams.length === 0) redirect("/pending-approval");

  // 기존 회원 — 화면에서 "신청 접수" 안내 (승인 후 팀 전환에 나타남)
  return { ok: true };
}
