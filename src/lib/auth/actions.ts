"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail, validatePassword } from "./validation";

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

  const userId = data.user?.id;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("profile_completed, deleted_at")
      .eq("id", userId)
      .single();
    // 삭제(탈퇴 처리)된 계정은 로그인 차단 — 세션 즉시 해제 후 안내
    if (profile?.deleted_at) {
      await supabase.auth.signOut();
      redirect(
        `/login?error=${encodeURIComponent(
          "삭제된 계정입니다. 관리자에게 문의해 주세요.",
        )}`,
      );
    }
    // 프로필 미완성 시 본인 프로필 수정 페이지로 강제 이동
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
  const now = new Date().toISOString();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        terms_agreed_at: now,
        privacy_agreed_at: now,
      },
    },
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

  // 이메일 확인이 비활성화된 경우 signUp 응답에 세션이 함께 옴 → 즉시 로그인 상태.
  // 이때는 프로필 작성 페이지로 바로 보냄.
  if (data.session && data.user) {
    revalidatePath("/", "layout");
    redirect(
      `/members/${data.user.id}?message=${encodeURIComponent(
        "마지막 단계예요. 프로필을 완성하면 가입이 완료됩니다.",
      )}`,
    );
  }

  // 이메일 확인이 필요한 경우(기본값) — 메일 발송 안내 화면으로
  redirect(`/signup?completed=1&email=${encodeURIComponent(email)}`);
}

/**
 * 비밀번호 재설정 메일 발송.
 * 보안: 이메일 존재 여부와 무관하게 동일한 응답을 반환(계정 열거 공격 방지).
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || !isValidEmail(email)) {
    redirect(
      `/forgot-password?error=${encodeURIComponent(
        "올바른 이메일 형식이 아닙니다",
      )}`,
    );
  }

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });

  redirect(
    `/forgot-password?completed=1&email=${encodeURIComponent(email)}`,
  );
}

/**
 * 비밀번호 재설정 완료 — 이메일 링크 클릭 후 로그인된 상태에서 호출.
 */
export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (!validatePassword(password).valid) {
    redirect(
      `/reset-password?error=${encodeURIComponent(
        "비밀번호는 영문·숫자·특수문자 조합 8자 이상이어야 합니다",
      )}`,
    );
  }
  if (password !== passwordConfirm) {
    redirect(
      `/reset-password?error=${encodeURIComponent(
        "비밀번호가 일치하지 않습니다",
      )}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/forgot-password?error=${encodeURIComponent(
        "재설정 링크가 만료되었습니다. 다시 시도해 주세요.",
      )}`,
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  // 안전상 로그아웃 → 새 비밀번호로 다시 로그인
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(
    `/login?message=${encodeURIComponent(
      "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.",
    )}`,
  );
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
