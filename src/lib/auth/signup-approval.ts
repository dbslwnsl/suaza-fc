"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * 신규 가입자 승인 + (선택) 옛 프로필 머지.
 * - 폼 input: new_id, old_id (옛 프로필 id; 빈 문자열이면 머지 없음)
 * - DB 의 security definer 함수 approve_and_merge_profile 호출
 *   (회장 권한 확인 + FK 이관 + 옛 프로필 삭제 + approved_at 세팅).
 */
export async function approveSignup(formData: FormData) {
  const newId = String(formData.get("new_id") ?? "").trim();
  const oldIdRaw = String(formData.get("old_id") ?? "").trim();
  const oldId = oldIdRaw || null;

  if (!newId) {
    redirect(`/admin/signups?error=${encodeURIComponent("가입자 ID 가 비어있습니다")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_and_merge_profile", {
    p_new_id: newId,
    p_old_id: oldId,
  });

  if (error) {
    redirect(`/admin/signups?error=${encodeURIComponent(error.message)}`);
  }

  // 처리한 알림은 읽음 처리 (회장 본인의 signup_pending 중 해당 가입자 관련)
  // url 매칭으로 거칠게 처리: 추후 메타데이터 컬럼 추가 시 정확히 매칭 가능.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("type", "signup_pending")
      .is("read_at", null);
  }

  revalidatePath("/admin/signups");
  revalidatePath("/", "layout");
  redirect(
    `/admin/signups?message=${encodeURIComponent(oldId ? "승인 + 옛 기록 이관 완료" : "승인 완료")}`,
  );
}
