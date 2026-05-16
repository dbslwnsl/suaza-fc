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

export async function saveFormation(
  matchId: string,
  payload: SaveFormationPayload,
) {
  const { supabase, userId } = await requireStaff();
  const input = (payload?.quarters ?? []).filter(
    (q) => q && typeof q.shape === "string" && q.shape.trim(),
  );
  if (input.length === 0) {
    redirect(
      `/matches/${matchId}/formation?error=${encodeURIComponent("저장할 포메이션이 없습니다")}`,
    );
  }

  const cleaned: SavedQuarter[] = input.map((q) => {
    const slots = buildSlots(q.shape);
    const player_ids = slots.map((_, i) => q.player_ids?.[i] ?? null);
    return { id: q.id, shape: q.shape, player_ids };
  });
  const first = cleaned[0];

  const { error } = await supabase.from("formations").upsert(
    {
      match_id: matchId,
      shape: first.shape,
      positions: {
        quarters: cleaned,
        player_ids: first.player_ids, // 하위 호환
      },
      created_by: userId,
    },
    { onConflict: "match_id" },
  );

  if (error) {
    redirect(
      `/matches/${matchId}/formation?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/matches/${matchId}/formation`);
  revalidatePath(`/matches/${matchId}`);
  redirect(
    `/matches/${matchId}/formation?message=${encodeURIComponent("저장되었습니다")}`,
  );
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
