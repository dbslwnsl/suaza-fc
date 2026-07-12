"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_TEAM_COOKIE } from "./context";

/** 현재 팀 전환 — active 소속인지 검증 후 쿠키 저장. */
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
  if (!membership) return { ok: false, error: "소속된 팀이 아닙니다" };

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
