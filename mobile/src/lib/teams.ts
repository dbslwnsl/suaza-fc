import { supabase } from "./supabase";

export type MyTeam = {
  id: string;
  name: string;
  slug: string;
  emblem_url: string | null;
  role: string;
  title: string;
};

/**
 * 내가 속한 active 팀 목록.
 * 웹의 src/lib/teams/context.ts getMyTeams() 와 같은 쿼리다.
 * 웹은 쿠키로 "현재 팀"을 기억하지만, 앱에서는 아직 첫 번째 팀을 쓴다.
 * (팀 전환 UI 를 붙일 때 SecureStore 나 별도 저장소로 옮길 것)
 */
export async function getMyTeams(): Promise<MyTeam[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await supabase
    .from("team_members")
    .select("role, title, team:teams(id, name, slug, emblem_url, status)")
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as {
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
    .filter((r) => r.team != null && (r.team.status ?? "active") === "active")
    .map((r) => ({
      id: r.team!.id,
      name: r.team!.name,
      slug: r.team!.slug,
      emblem_url: r.team!.emblem_url,
      role: r.role,
      title: r.title,
    }));
}
