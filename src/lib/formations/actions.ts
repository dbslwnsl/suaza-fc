"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildSlots } from "./helpers";

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

export async function saveFormation(matchId: string, formData: FormData) {
  const { supabase, userId } = await requireStaff();
  const shape = String(formData.get("shape") ?? "").trim();
  if (!shape) {
    redirect(
      `/matches/${matchId}/formation?error=${encodeURIComponent("포메이션을 선택해 주세요")}`,
    );
  }

  const slots = buildSlots(shape);
  const player_ids: (string | null)[] = slots.map((s) => {
    const v = String(formData.get(`slot__${s.index}`) ?? "").trim();
    return v || null;
  });

  const { error } = await supabase
    .from("formations")
    .upsert(
      {
        match_id: matchId,
        shape,
        positions: { player_ids },
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
