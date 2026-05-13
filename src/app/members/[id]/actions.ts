"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { POSITIONS, type Position } from "@/lib/members/positions";

type UpdateInput = {
  name: string;
  nickname: string | null;
  positions: Position[];
  jersey_number: number | null;
  birth_date: string | null;
  role?: "manager" | "coach" | "player";
};

export async function updateProfile(profileId: string, formData: FormData) {
  const supabase = await createClient();

  // 권한 체크: 본인이거나 manager 여야 함
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSelf = user.id === profileId;
  const isManager = me?.role === "manager";
  if (!isSelf && !isManager) {
    redirect(`/members/${profileId}?error=${encodeURIComponent("수정 권한이 없습니다")}`);
  }

  // 폼 파싱
  const rawPositions = formData.getAll("positions").map(String);
  const positions = POSITIONS.filter((p) =>
    rawPositions.includes(p),
  ) as Position[];

  const jerseyRaw = String(formData.get("jersey_number") ?? "").trim();
  const birthRaw = String(formData.get("birth_date") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim();

  const update: UpdateInput = {
    name: String(formData.get("name") ?? "").trim(),
    nickname: nickname || null,
    positions,
    jersey_number: jerseyRaw ? Number(jerseyRaw) : null,
    birth_date: birthRaw || null,
  };

  if (!update.name) {
    redirect(`/members/${profileId}?error=${encodeURIComponent("이름은 필수입니다")}`);
  }

  // role 은 manager 만 변경 가능
  if (isManager) {
    const roleRaw = String(formData.get("role") ?? "");
    if (roleRaw === "manager" || roleRaw === "coach" || roleRaw === "player") {
      update.role = roleRaw;
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", profileId);

  if (error) {
    redirect(`/members/${profileId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/members/${profileId}`);
  revalidatePath("/members");
  redirect(`/members/${profileId}?message=${encodeURIComponent("저장되었습니다")}`);
}
