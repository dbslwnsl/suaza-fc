"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_TEAM_COOKIE, isPlatformAdmin } from "./context";

/** 현재 팀 전환 — active 소속(또는 플랫폼 관리자의 열람) 검증 후 쿠키 저장. */
export async function setCurrentTeam(
  teamId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다" };

  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) {
    // 플랫폼 관리자는 승인된(active) 팀을 열람용으로 선택할 수 있다.
    if (!(await isPlatformAdmin()))
      return { ok: false, error: "소속된 팀이 아닙니다" };
    const { data: team } = await supabase
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .eq("status", "active")
      .maybeSingle();
    if (!team) return { ok: false, error: "열람할 수 없는 팀입니다" };
  }

  const store = await cookies();
  store.set(CURRENT_TEAM_COOKIE, teamId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1년
  });
  // 팀 컨텍스트가 바뀌면 모든 화면 데이터가 달라진다.
  revalidatePath("/", "layout");
  return { ok: true };
}
