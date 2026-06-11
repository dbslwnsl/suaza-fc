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
  is_injured: boolean;
  on_leave: boolean;
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
    is_injured: String(formData.get("is_injured") ?? "") === "1",
    on_leave: String(formData.get("on_leave") ?? "") === "1",
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

/**
 * 회원의 부상/장기불참 상태만 변경. 본인 외 타인 변경은 매니저·회장만 허용.
 * 회장(title=president, role=player)은 profiles RLS 로 타인 수정이 막혀 있어
 * 권한을 서버에서 확인한 뒤 service_role 로 두 필드만 갱신한다.
 */
export async function setMemberStatus(
  profileId: string,
  isInjured: boolean,
  onLeave: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다" };

  const { data: me } = await supabase
    .from("profiles")
    .select("role, title")
    .eq("id", user.id)
    .single();
  const canManage =
    me?.role === "manager" ||
    me?.title === "president" ||
    me?.title === "head_coach";
  if (!canManage && user.id !== profileId) {
    return { ok: false, error: "권한이 없습니다" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_injured: isInjured, on_leave: onLeave })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/members/${profileId}`);
  revalidatePath("/members");
  revalidatePath("/");
  return { ok: true };
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
 * - profiles.deleted_at 세팅 → 목록에선 숨겨지지만 row 자체는 남아 경기 기록(FK) 보존
 * - auth.users 는 삭제하지 않고(기록 cascade 방지), 이메일만 텀스톤으로 변경해
 *   원래 이메일을 풀어준다 → 같은 이메일로 재가입 가능. (재가입은 새 계정/프로필)
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

  // auth 계정의 이메일을 텀스톤으로 바꿔 원래 이메일을 해제(재가입 가능하게) 한다.
  // 계정 자체는 남겨 기록을 보존하고, 로그인은 deleted_at 으로 이미 차단됨.
  // email_confirm:true 로 즉시 반영(확인 메일 없이)해야 원래 이메일이 풀린다.
  try {
    const admin = createAdminClient();
    const tombstone = `deleted-${profileId}@deleted.invalid`;
    const { error: authError } = await admin.auth.admin.updateUserById(
      profileId,
      { email: tombstone, email_confirm: true },
    );
    if (authError) {
      console.error(
        "[member delete] auth 이메일 해제 실패 — 같은 이메일 재가입이 막힐 수 있습니다.",
        authError.message,
      );
    }
  } catch (e) {
    console.error(
      "[member delete] admin 이메일 해제 처리 실패 (SUPABASE_SERVICE_ROLE_KEY 확인)",
      e instanceof Error ? e.message : e,
    );
  }

  revalidatePath("/members");
  revalidatePath("/");
  redirect(`/members?message=${encodeURIComponent("회원이 삭제되었습니다")}`);
}

// ─────────────────────────────────────────────────────────────
// 감독&코치 코멘트 (coach_comments)
// 작성/수정/삭제는 감독·코치만 — 실제 권한은 RLS 가 강제한다.
// 낙관적 UI 용으로 redirect 없이 revalidate 만 수행.
// ─────────────────────────────────────────────────────────────

export async function createCoachComment(
  memberId: string,
  content: string,
  matchId: string | null = null,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const trimmed = content.trim();
  if (!trimmed) return;

  await supabase.from("coach_comments").insert({
    member_id: memberId,
    author_id: user.id,
    content: trimmed,
    match_id: matchId,
  });
  revalidatePath(`/members/${memberId}`);
}

export async function updateCoachComment(
  commentId: string,
  memberId: string,
  content: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const trimmed = content.trim();
  if (!trimmed) return;

  await supabase
    .from("coach_comments")
    .update({ content: trimmed, updated_at: new Date().toISOString() })
    .eq("id", commentId);
  revalidatePath(`/members/${memberId}`);
}

export async function deleteCoachComment(commentId: string, memberId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("coach_comments").delete().eq("id", commentId);
  revalidatePath(`/members/${memberId}`);
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
