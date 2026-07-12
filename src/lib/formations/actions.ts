"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildSlots, type SaveFormationPayload, type SavedQuarter } from "./helpers";

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "manager" && me?.role !== "coach") {
    redirect(`/matches?error=${encodeURIComponent("포메이션 수정 권한이 없습니다")}`);
  }
  return { supabase, userId: user.id };
}

/**
 * 포메이션 편집 권한 해석.
 * - 감독/회장/코치 → "both" (양 팀 편집)
 * - 해당 경기의 자체전 팀 주장 → "A" | "B" (자기 팀만 편집)
 * - 그 외 → 권한 없음 (리다이렉트)
 */
async function requireFormationEditor(matchId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role, title")
    .eq("id", user.id)
    .single();
  // 회장·감독(또는 role=manager) → 양 팀 편집
  if (
    me?.role === "manager" ||
    me?.title === "president" ||
    me?.title === "head_coach"
  ) {
    return { supabase, userId: user.id, access: "both" as const };
  }
  const { data: mm } = await supabase
    .from("matches")
    .select("opponent, team_a_captain, team_b_captain")
    .eq("id", matchId)
    .maybeSingle();
  const isIntra = mm?.opponent === "자체전";
  // 코치 → 본인이 배정된 팀만 (상대전은 팀이 하나라 그 팀 전체)
  if (me?.role === "coach" || me?.title === "coach") {
    if (!isIntra) {
      return { supabase, userId: user.id, access: "both" as const };
    }
    const { data: att } = await supabase
      .from("match_attendances")
      .select("status, team")
      .eq("match_id", matchId)
      .eq("player_id", user.id)
      .maybeSingle();
    if (att?.status === "attending" && (att.team === "A" || att.team === "B")) {
      return { supabase, userId: user.id, access: att.team as "A" | "B" };
    }
    redirect(
      `/matches?error=${encodeURIComponent("배정된 팀이 없어 포메이션을 수정할 수 없습니다")}`,
    );
  }
  // 주장 → 본인 팀
  if (mm?.team_a_captain === user.id) {
    return { supabase, userId: user.id, access: "A" as const };
  }
  if (mm?.team_b_captain === user.id) {
    return { supabase, userId: user.id, access: "B" as const };
  }
  redirect(`/matches?error=${encodeURIComponent("포메이션 수정 권한이 없습니다")}`);
}

export async function saveFormation(
  matchId: string,
  payload: SaveFormationPayload,
): Promise<{ ok?: true; error?: string }> {
  const { supabase, userId, access } = await requireFormationEditor(matchId);
  const input = (payload?.quarters ?? []).filter(
    (q) => q && typeof q.shape === "string" && q.shape.trim(),
  );
  if (input.length === 0) {
    return { error: "저장할 포메이션이 없습니다" };
  }

  let cleaned: SavedQuarter[] = input.map((q) => {
    const slots = buildSlots(q.shape);
    const player_ids = slots.map((_, i) => q.player_ids?.[i] ?? null);
    const out: SavedQuarter = { id: q.id, shape: q.shape, player_ids };
    if (q.teamB && typeof q.teamB.shape === "string" && q.teamB.shape.trim()) {
      const bSlots = buildSlots(q.teamB.shape);
      out.teamB = {
        shape: q.teamB.shape,
        player_ids: bSlots.map((_, i) => q.teamB!.player_ids?.[i] ?? null),
      };
    }
    return out;
  });

  // 주장(access "A"/"B")은 자기 팀만 수정 가능 — 상대 팀 데이터는 저장된 값을 보존.
  if (access !== "both") {
    const { data: existing } = await supabase
      .from("formations")
      .select("positions")
      .eq("match_id", matchId)
      .maybeSingle();
    const prevQuarters: SavedQuarter[] =
      (existing?.positions as { quarters?: SavedQuarter[] } | null)?.quarters ??
      [];
    cleaned = cleaned.map((q) => {
      const prev = prevQuarters.find((e) => e.id === q.id);
      if (access === "A") {
        // A팀 주장: A(payload)만 반영, B는 기존값 유지
        return {
          id: q.id,
          shape: q.shape,
          player_ids: q.player_ids,
          teamB: prev?.teamB ?? q.teamB,
        };
      }
      // B팀 주장: B(payload)만 반영, A는 기존값 유지
      return {
        id: q.id,
        shape: prev?.shape ?? q.shape,
        player_ids: prev?.player_ids ?? q.player_ids,
        teamB: q.teamB,
      };
    });
  }
  const first = cleaned[0];

  const { error } = await supabase.from("formations").upsert(
    {
      match_id: matchId,
      shape: first.shape,
      positions: {
        quarters: cleaned,
        player_ids: first.player_ids,
      },
      created_by: userId,
    },
    { onConflict: "match_id" },
  );

  if (error) return { error: error.message };

  // 현재 페이지는 클라이언트 상태가 source of truth (자동저장).
  // 자기 자신 경로를 revalidate 하면 RSC payload 가 재요청되며 화면이 깜박이므로
  // 경기 상세 페이지만 무효화한다.
  revalidatePath(`/matches/${matchId}`);
  return { ok: true };
}

export async function deleteFormation(matchId: string) {
  const { supabase } = await requireStaff();
  const { error } = await supabase
    .from("formations")
    .delete()
    .eq("match_id", matchId);
  if (error) {
    redirect(
      `/matches/${matchId}/formation?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath(`/matches/${matchId}/formation`);
  revalidatePath(`/matches/${matchId}`);
  redirect(
    `/matches/${matchId}/formation?message=${encodeURIComponent("포메이션이 초기화되었습니다")}`,
  );
}
