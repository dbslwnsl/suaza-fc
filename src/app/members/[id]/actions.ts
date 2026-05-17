"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  MEMBER_TITLES,
  POSITIONS,
  type MemberTitle,
  type Position,
} from "@/lib/members/positions";

type UpdateInput = {
  name: string;
  nickname: string | null;
  positions: Position[];
  jersey_number: number | null;
  birth_date: string | null;
  title?: MemberTitle;
  profile_completed: boolean;
};

export async function updateProfile(profileId: string, formData: FormData) {
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

  const isSelf = user.id === profileId;
  const isManager = me?.role === "manager";
  if (!isSelf && !isManager) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("수정 권한이 없습니다")}`,
    );
  }

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
    profile_completed: true,
  };

  if (!update.name) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("이름은 필수입니다")}`,
    );
  }

  // manager 만 title(직책) 변경 가능.
  // 매니저 권한(role) 부여는 UI에 노출하지 않으며, 앱 운영자가 Supabase SQL 로 직접 처리.
  //   예) update public.profiles set role='manager' where id='<uuid>';
  if (isManager) {
    const titleRaw = String(formData.get("title") ?? "");
    if ((MEMBER_TITLES as readonly string[]).includes(titleRaw)) {
      update.title = titleRaw as MemberTitle;
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
  revalidatePath("/");
  redirect(
    `/members/${profileId}?message=${encodeURIComponent("저장되었습니다")}`,
  );
}
