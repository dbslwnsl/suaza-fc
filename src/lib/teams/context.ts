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
 * 플랫폼 관리자는 모든 active 팀을 열람용으로 본다
 * (소속이 있으면 그 팀의 실제 role/title, 아니면 열람 전용 player).
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

  // 플랫폼 관리자 — 모든 active 팀을 열람용으로 추가 (기존 소속 role 은 유지)
  if (await isPlatformAdmin()) {
    const { data: all } = await supabase
      .from("teams")
      .select("id, name, slug, emblem_url")
      .eq("status", "active")
      .order("name", { ascending: true });
    const byId = new Map(mine.map((t) => [t.id, t]));
    return ((all ?? []) as {
      id: string;
      name: string;
      slug: string;
      emblem_url: string | null;
    }[]).map(
      (t) =>
        byId.get(t.id) ?? {
          ...t,
          role: "player",
          title: "player",
        },
    );
  }

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
 * 소속 팀이 없으면 null (Phase 3 온보딩에서 팀 선택/가입 유도).
 */
export async function getCurrentTeam(): Promise<MyTeam | null> {
  const teams = await getMyTeams();
  if (teams.length === 0) return null;
  const store = await cookies();
  const saved = store.get(CURRENT_TEAM_COOKIE)?.value;
  return teams.find((t) => t.id === saved) ?? teams[0];
}
