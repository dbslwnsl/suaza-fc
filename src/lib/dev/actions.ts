"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 직책(title) → 시스템 권한(role) 매핑 — 실제 운영 매핑과 동일하게.
const TITLE_ROLE: Record<string, "manager" | "coach" | "player"> = {
  president: "manager",
  head_coach: "manager",
  coach: "coach",
  vice_president: "player",
  treasurer: "player",
  auditor: "player",
  player: "player",
};

/**
 * 개발 전용 — 로그인한 본인 계정의 직책/권한을 즉시 바꿔 "그 직책 화면"을 테스트한다.
 * NEXT_PUBLIC_DEV_TOOLS=1 일 때만 동작 (프로덕션 환경엔 이 값이 없어 무력화).
 * profiles role 변경 트리거를 우회하기 위해 service_role(admin) 로 갱신한다.
 */
export async function devSetMyRoleTitle(
  title: string,
): Promise<{ ok: boolean; error?: string }> {
  if (process.env.NEXT_PUBLIC_DEV_TOOLS !== "1") {
    return { ok: false, error: "dev tools 비활성" };
  }
  const role = TITLE_ROLE[title];
  if (!role) return { ok: false, error: "잘못된 직책" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인 필요" };

  // createAdminClient 는 SUPABASE_SERVICE_ROLE_KEY 미설정 시 throw —
  // 스위처 UI 에 에러가 표시되도록 잡아서 반환한다.
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({ title, role })
      .eq("id", user.id);
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
