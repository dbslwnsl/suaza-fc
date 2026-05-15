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

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function uploadAvatar(profileId: string, formData: FormData) {
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

  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("파일을 선택해 주세요")}`,
    );
  }
  if (file.size > MAX_AVATAR_BYTES) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("5MB 이하 이미지만 업로드 가능합니다")}`,
    );
  }
  if (!ALLOWED_MIME.has(file.type)) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("JPG/PNG/WEBP/GIF 만 가능합니다")}`,
    );
  }

  const ext = EXT_BY_MIME[file.type] ?? "jpg";
  const path = `${profileId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent(uploadError.message)}`,
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", profileId);

  if (updateError) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent(updateError.message)}`,
    );
  }

  revalidatePath(`/members/${profileId}`);
  revalidatePath("/members");
  revalidatePath("/");
  redirect(
    `/members/${profileId}?message=${encodeURIComponent("프로필 이미지가 업데이트되었습니다")}`,
  );
}

export async function deleteAvatar(profileId: string) {
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

  // 저장된 객체도 함께 삭제 (해당 사용자 폴더 전체)
  const { data: list } = await supabase.storage
    .from("avatars")
    .list(profileId);
  if (list && list.length > 0) {
    await supabase.storage
      .from("avatars")
      .remove(list.map((f) => `${profileId}/${f.name}`));
  }

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", profileId);

  if (error) {
    redirect(`/members/${profileId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/members/${profileId}`);
  revalidatePath("/members");
  revalidatePath("/");
  redirect(
    `/members/${profileId}?message=${encodeURIComponent("기본 이미지로 변경되었습니다")}`,
  );
}
