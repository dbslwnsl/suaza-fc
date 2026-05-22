"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MEMBER_TITLES,
  POSITIONS,
  PREFERRED_FEET,
  type MemberTitle,
  type Position,
  type PreferredFoot,
} from "@/lib/members/positions";

type UpdateInput = {
  name: string;
  nickname: string | null;
  positions: Position[];
  jersey_number: number | null;
  birth_date: string | null;
  preferred_foot: PreferredFoot | null;
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

  // 제출 순서 = [주포지션, 부포지션]. 순서 보존 + 중복 제거 + 최대 2개.
  const valid = new Set<string>(POSITIONS);
  const positions = formData
    .getAll("positions")
    .map(String)
    .filter((p) => valid.has(p))
    .filter((p, i, arr) => arr.indexOf(p) === i)
    .slice(0, 2) as Position[];

  const jerseyRaw = String(formData.get("jersey_number") ?? "").trim();
  const birthRaw = String(formData.get("birth_date") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim().slice(0, 6);
  const footRaw = String(formData.get("preferred_foot") ?? "");
  const preferred_foot = (PREFERRED_FEET as readonly string[]).includes(footRaw)
    ? (footRaw as PreferredFoot)
    : null;

  const update: UpdateInput = {
    name: String(formData.get("name") ?? "").trim(),
    nickname: nickname || null,
    positions,
    jersey_number: jerseyRaw ? Number(jerseyRaw) : null,
    birth_date: birthRaw || null,
    profile_completed: true,
    preferred_foot,
  };

  if (!update.name) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("이름은 필수입니다")}`,
    );
  }
  if (update.jersey_number == null) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("등번호는 필수입니다")}`,
    );
  }
  if (!update.birth_date) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("생년월일은 필수입니다")}`,
    );
  }
  if (update.positions.length === 0) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("포지션을 하나 이상 선택해 주세요")}`,
    );
  }
  if (!update.preferred_foot) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("주발을 선택해 주세요")}`,
    );
  }

  // 첫 프로필 작성인지 판별: 업데이트 전 profile_completed 값 확인
  const { data: before } = await supabase
    .from("profiles")
    .select("profile_completed")
    .eq("id", profileId)
    .single();
  const wasIncomplete = !before?.profile_completed;

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
    redirect(
      `/members/${profileId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/members/${profileId}`);
  revalidatePath("/members");
  revalidatePath("/");

  // 첫 프로필 작성 완료 시 본인이면 홈으로
  if (wasIncomplete && user.id === profileId) {
    redirect(
      `/?message=${encodeURIComponent("환영합니다! 프로필이 저장되었습니다")}`,
    );
  }

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

/**
 * 회원 Soft Delete.
 * - profiles.deleted_at 세팅 (과거 경기 기록은 그대로 보존)
 * - auth.users 도 함께 제거하여 동일 이메일 재가입 허용
 * - 매니저 권한자만 호출 가능, 본인 자신은 삭제 불가
 */
export async function softDeleteMember(profileId: string) {
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

  if (me?.role !== "manager") {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("매니저만 회원을 삭제할 수 있습니다")}`,
    );
  }
  if (user.id === profileId) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("본인은 삭제할 수 없습니다")}`,
    );
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", profileId);

  if (updateError) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent(updateError.message)}`,
    );
  }

  // auth.users 제거 → 동일 이메일 재가입 가능. service_role 필요.
  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.deleteUser(profileId);
  if (authError) {
    // profile 은 이미 soft-delete 됐으니 목록엔 안 보이지만, 인증 row 가 남아있는 상태.
    // 에러는 전달하되 멤버 목록으로는 보내자.
    redirect(
      `/members?error=${encodeURIComponent(`회원 비활성화는 완료됐지만 인증 제거 실패: ${authError.message}`)}`,
    );
  }

  revalidatePath("/members");
  revalidatePath("/");
  redirect(`/members?message=${encodeURIComponent("회원이 삭제되었습니다")}`);
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
  const { data: list } = await supabase.storage.from("avatars").list(profileId);
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
    redirect(
      `/members/${profileId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/members/${profileId}`);
  revalidatePath("/members");
  revalidatePath("/");
  redirect(
    `/members/${profileId}?message=${encodeURIComponent("기본 이미지로 변경되었습니다")}`,
  );
}
