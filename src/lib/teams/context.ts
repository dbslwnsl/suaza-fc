// 현재 팀 컨텍스트 (서버 전용) — 멀티팀 Phase 3.
// URL 에 팀을 싣지 않고, 쿠키(CURRENT_TEAM_COOKIE)로 "지금 보고 있는 팀"을 정한다.
// 쿠키가 없거나 소속이 아니면 첫 번째 active 소속 팀으로 폴백.
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const CURRENT_TEAM_COOKIE = "current-team";

/** 수아자FC 고정 팀 id (0049 백필과 동일) — 소속 조회가 불가능한 예외 상황의 폴백. */
export const DEFAULT_TEAM_ID = "00000000-0000-4000-8000-000000000001";

export type MyTeam = {
  id: string;
  name: string;
  slug: string;
  emblem_url: string | null;
  /** 이 팀에서의 내 권한/직책 */
  role: string;
  title: string;
};

/** 플랫폼 관리자 여부 — 앱 전체 관장 계정 (부여는 SQL로만). */
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  // 컬럼 미적용(0054 전) 환경에선 undefined → false
  return (data as { is_platform_admin?: boolean } | null)
    ?.is_platform_admin === true;
}

/**
 * 내가 속한(active) 팀 목록 — 승인된(active) 팀만.
 * 플랫폼 관리자도 스위처에는 소속 팀만 표시 (타 팀 현황은 /admin/teams 에서).
 */
export async function getMyTeams(): Promise<MyTeam[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("team_members")
    .select("role, title, team:teams(id, name, slug, emblem_url, status)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true });

  const mine = ((data ?? []) as unknown as {
    role: string;
    title: string;
    team: {
      id: string;
      name: string;
      slug: string;
      emblem_url: string | null;
      status?: string | null;
    } | null;
  }[])
    // 승인 대기(pending) 팀은 목록/전환에 노출하지 않는다
    .filter((r) => r.team != null && (r.team.status ?? "active") === "active")
    .map((r) => ({
      id: r.team!.id,
      name: r.team!.name,
      slug: r.team!.slug,
      emblem_url: r.team!.emblem_url,
      role: r.role,
      title: r.title,
    }));

  return mine;
}

/**
 * 현재 팀에서의 내 권한/직책. 소속이 없으면 player 취급.
 * 전역 profiles.role 대신 이걸 쓰면 새 팀의 회장·코치도 올바르게 판정된다.
 */
export async function getMyTeamRole(): Promise<{
  role: string;
  title: string;
}> {
  const t = await getCurrentTeam();
  return { role: t?.role ?? "player", title: t?.title ?? "player" };
}

/**
 * 현재 팀 — 쿠키가 가리키는 팀(소속 확인됨) 또는 첫 소속 팀.
 * 플랫폼 관리자는 소속이 없어도 쿠키의 팀을 "열람 전용(player)"으로 해석한다.
 * 어느 쪽도 아니면 null (온보딩/관리자 화면으로 유도).
 */
export async function getCurrentTeam(): Promise<MyTeam | null> {
  const teams = await getMyTeams();
  const store = await cookies();
  const saved = store.get(CURRENT_TEAM_COOKIE)?.value;

  const mine = teams.find((t) => t.id === saved) ?? teams[0] ?? null;
  if (mine) return mine;

  // 소속 없음 — 플랫폼 관리자의 열람 컨텍스트(쿠키) 해석
  if (saved && (await isPlatformAdmin())) {
    const supabase = await createClient();
    const { data: team } = await supabase
      .from("teams")
      .select("id, name, slug, emblem_url")
      .eq("id", saved)
      .eq("status", "active")
      .maybeSingle();
    if (team) {
      return {
        ...(team as {
          id: string;
          name: string;
          slug: string;
          emblem_url: string | null;
        }),
        role: "player",
        title: "player",
      };
    }
  }
  return null;
}
