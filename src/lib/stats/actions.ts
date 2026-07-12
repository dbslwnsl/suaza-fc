"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeam, DEFAULT_TEAM_ID } from "@/lib/teams/context";

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
  // 멀티팀 2단계 — 기록 항목 조작은 현재 팀 범위로 제한 (복합 PK 대응).
  const teamId = (await getCurrentTeam())?.id ?? DEFAULT_TEAM_ID;
  return { supabase, teamId };
}

/** 라벨에 영향받지 않는 안정적인 식별자 자동 생성. */
function generateStatKey(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `stat_${Date.now().toString(36)}${rnd}`;
}

export async function addStatDefinition(formData: FormData) {
  const { supabase, teamId } = await requireManager();
  const label = String(formData.get("label") ?? "").trim();

  if (!label) {
    redirect(
      `/settings/stats?error=${encodeURIComponent("이름을 입력해 주세요")}`,
    );
  }

  // 항목 수 제한 — 총 8개(기본 4개 + 추가 4개)까지만 허용. 숨김(소프트 삭제) 제외.
  const MAX_TOTAL = 8;
  const { count } = await supabase
    .from("stat_definitions")
    .select("key", { head: true, count: "exact" })
    .eq("team_id", teamId)
    .is("hidden_at", null);
  if ((count ?? 0) >= MAX_TOTAL) {
    redirect(
      `/settings/stats?error=${encodeURIComponent(
        "최대 4개까지만 추가할 수 있어요",
      )}`,
    );
  }

  // 새 항목은 항상 맨 마지막에 배치 — 기존 최대 sort_order + 1.
  const { data: lastRow } = await supabase
    .from("stat_definitions")
    .select("sort_order")
    .eq("team_id", teamId)
    .is("hidden_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (lastRow?.sort_order ?? -1) + 1;

  // 중복 확률은 매우 낮지만 안전하게 한 번 더 시도.
  let key = generateStatKey();
  let { error } = await supabase.from("stat_definitions").insert({
    team_id: teamId,
    key,
    label,
    sort_order: nextOrder,
  });
  if (error?.code === "23505") {
    key = generateStatKey();
    ({ error } = await supabase.from("stat_definitions").insert({
      team_id: teamId,
      key,
      label,
      sort_order: nextOrder,
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
  const { supabase, teamId } = await requireManager();
  for (let i = 0; i < orderedKeys.length; i++) {
    await supabase
      .from("stat_definitions")
      .update({ sort_order: i })
      .eq("team_id", teamId)
      .eq("key", orderedKeys[i]);
  }
  revalidatePath("/settings/stats");
}

/** 항목별 포인트 기준점수 설정 (0~10). 회장/감독(manager)만 가능. */
export async function setStatPointValue(key: string, value: number) {
  const { supabase, teamId } = await requireManager();
  // points(합계) 는 기준점수를 갖지 않음
  if (key === "points") return;
  const v = Math.max(0, Math.min(10, Math.round(value)));
  await supabase
    .from("stat_definitions")
    .update({ point_value: v })
    .eq("team_id", teamId)
    .eq("key", key);
  revalidatePath("/settings/stats");
}

export async function removeStatDefinition(key: string) {
  const { supabase, teamId } = await requireManager();

  if (PROTECTED_STAT_KEYS.has(key)) {
    redirect(
      `/settings/stats?error=${encodeURIComponent("포인트 항목은 삭제할 수 없습니다")}`,
    );
  }
  // 라벨이 "포인트" 인 항목도 보호 (키가 다르게 저장돼 있더라도).
  const { data: row } = await supabase
    .from("stat_definitions")
    .select("label")
    .eq("team_id", teamId)
    .eq("key", key)
    .maybeSingle();
  if (row?.label === "포인트") {
    redirect(
      `/settings/stats?error=${encodeURIComponent("포인트 항목은 삭제할 수 없습니다")}`,
    );
  }

  // 소프트 삭제 — row 와 누적된 custom_stats 값은 보존, 화면에서만 숨김.
  // 향후 복구가 필요하면 hidden_at = NULL 로 되돌리면 됨.
  const { error } = await supabase
    .from("stat_definitions")
    .update({ hidden_at: new Date().toISOString() })
    .eq("team_id", teamId)
    .eq("key", key);
  if (error) {
    redirect(`/settings/stats?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/settings/stats");
  redirect("/settings/stats");
}
