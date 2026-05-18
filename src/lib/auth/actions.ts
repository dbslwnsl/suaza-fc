"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validatePassword } from "./validation";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  // 프로필 미완성 시 본인 프로필 수정 페이지로 강제 이동
  const userId = data.user?.id;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("profile_completed")
      .eq("id", userId)
      .single();
    if (!profile?.profile_completed) {
      revalidatePath("/", "layout");
      redirect(
        `/members/${userId}?message=${encodeURIComponent(
          "프로필 정보를 채워 주세요",
        )}`,
      );
    }
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const terms = formData.get("terms") === "on";
  const privacy = formData.get("privacy") === "on";

  if (!name) {
    redirect(`/signup?error=${encodeURIComponent("이름을 입력해 주세요")}`);
  }
  if (!validatePassword(password).valid) {
    redirect(
      `/signup?error=${encodeURIComponent(
        "비밀번호는 영문·숫자·특수문자 조합 8자 이상이어야 합니다",
      )}`,
    );
  }
  if (password !== passwordConfirm) {
    redirect(`/signup?error=${encodeURIComponent("비밀번호가 일치하지 않습니다")}`);
  }
  if (!terms || !privacy) {
    redirect(`/signup?error=${encodeURIComponent("필수 약관에 동의해 주세요")}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) {
      redirect(
        `/signup?error=${encodeURIComponent("이미 가입된 이메일입니다")}`,
      );
    }
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // Supabase 는 보안상 중복 이메일이어도 성공으로 응답하지만
  // identities 배열이 비어있어서 식별 가능.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    redirect(
      `/signup?error=${encodeURIComponent("이미 가입된 이메일입니다")}`,
    );
  }

  redirect(`/signup?completed=1&email=${encodeURIComponent(email)}`);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * 이메일 중복 확인 (회원가입 폼의 onBlur 검증용).
 * 형식이 명백히 잘못된 경우 false 반환 (서버 라운드트립 회피).
 */
export async function checkEmailExists(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@") || normalized.length < 5) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("email_exists", {
    p_email: normalized,
  });
  if (error) return false;
  return Boolean(data);
}
