"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireManager() {
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
    redirect(`/settings/stats?error=${encodeURIComponent("감독만 변경할 수 있습니다")}`);
  }
  return { supabase };
}

/** 라벨에 영향받지 않는 안정적인 식별자 자동 생성. */
function generateStatKey(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `stat_${Date.now().toString(36)}${rnd}`;
}

export async function addStatDefinition(formData: FormData) {
  const { supabase } = await requireManager();
  const label = String(formData.get("label") ?? "").trim();
  const sortRaw = String(formData.get("sort_order") ?? "").trim();

  if (!label) {
    redirect(
      `/settings/stats?error=${encodeURIComponent("이름을 입력해 주세요")}`,
    );
  }

  // 중복 확률은 매우 낮지만 안전하게 한 번 더 시도.
  let key = generateStatKey();
  let { error } = await supabase.from("stat_definitions").insert({
    key,
    label,
    sort_order: sortRaw ? Number(sortRaw) : 0,
  });
  if (error?.code === "23505") {
    key = generateStatKey();
    ({ error } = await supabase.from("stat_definitions").insert({
      key,
      label,
      sort_order: sortRaw ? Number(sortRaw) : 0,
    }));
  }

  if (error) {
    redirect(`/settings/stats?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/settings/stats");
  redirect("/settings/stats");
}

// 시스템 항목 — 사용자가 삭제할 수 없음.
// points: 합계 / goals·assists·attendance: 기본 항목
const PROTECTED_STAT_KEYS = new Set([
  "points",
  "goals",
  "assists",
  "attendance",
]);

/** 받은 키 순서대로 sort_order 를 0, 1, 2... 로 재부여. */
export async function reorderStatDefinitions(orderedKeys: string[]) {
  const { supabase } = await requireManager();
  for (let i = 0; i < orderedKeys.length; i++) {
    await supabase
      .from("stat_definitions")
      .update({ sort_order: i })
      .eq("key", orderedKeys[i]);
  }
  revalidatePath("/settings/stats");
}

/** 항목별 포인트 기준점수 설정 (0~10). 회장/감독(manager)만 가능. */
export async function setStatPointValue(key: string, value: number) {
  const { supabase } = await requireManager();
  // points(합계) 는 기준점수를 갖지 않음
  if (key === "points") return;
  const v = Math.max(0, Math.min(10, Math.round(value)));
  await supabase
    .from("stat_definitions")
    .update({ point_value: v })
    .eq("key", key);
  revalidatePath("/settings/stats");
}

export async function removeStatDefinition(key: string) {
  const { supabase } = await requireManager();

  if (PROTECTED_STAT_KEYS.has(key)) {
    redirect(
      `/settings/stats?error=${encodeURIComponent("포인트 항목은 삭제할 수 없습니다")}`,
    );
  }
  // 라벨이 "포인트" 인 항목도 보호 (키가 다르게 저장돼 있더라도).
  const { data: row } = await supabase
    .from("stat_definitions")
    .select("label")
    .eq("key", key)
    .maybeSingle();
  if (row?.label === "포인트") {
    redirect(
      `/settings/stats?error=${encodeURIComponent("포인트 항목은 삭제할 수 없습니다")}`,
    );
  }

  const { error } = await supabase
    .from("stat_definitions")
    .delete()
    .eq("key", key);
  if (error) {
    redirect(`/settings/stats?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/settings/stats");
  redirect("/settings/stats");
}
