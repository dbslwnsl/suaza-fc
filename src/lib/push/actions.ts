"use server";

import { createClient } from "@/lib/supabase/server";

// 브라우저 PushSubscription.toJSON() 형태 (필요한 필드만)
type SerializedSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type Result = { success: boolean; error?: string };

/**
 * 현재 로그인 회원의 푸시 구독을 저장(업서트)한다.
 * endpoint 가 고유 키 — 같은 기기/브라우저에서 다시 구독하면 갱신된다.
 */
export async function subscribeUser(
  sub: SerializedSubscription,
  userAgent?: string,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "로그인이 필요합니다" };

  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { success: false, error: "구독 정보가 올바르지 않습니다" };
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    // 원인 진단용 — RLS 위반/컬럼 문제 등이 그대로 찍힌다.
    console.error(
      "[push] 구독 저장 실패:",
      error.code ?? "",
      error.message,
      error.details ?? "",
      error.hint ?? "",
    );
    return { success: false, error: `${error.code ?? ""} ${error.message}`.trim() };
  }
  return { success: true };
}

/** 현재 회원의 해당 endpoint 구독을 삭제(알림 끄기). */
export async function unsubscribeUser(endpoint: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "로그인이 필요합니다" };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
