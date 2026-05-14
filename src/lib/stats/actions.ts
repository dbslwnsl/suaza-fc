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

export async function addStatDefinition(formData: FormData) {
  const { supabase } = await requireManager();
  const key = String(formData.get("key") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const sortRaw = String(formData.get("sort_order") ?? "").trim();

  if (!key || !label) {
    redirect(
      `/settings/stats?error=${encodeURIComponent("key 와 label 을 모두 입력해 주세요")}`,
    );
  }
  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    redirect(
      `/settings/stats?error=${encodeURIComponent("key 는 영문 소문자/숫자/언더스코어만 가능합니다 (예: yellow_cards)")}`,
    );
  }

  const { error } = await supabase.from("stat_definitions").insert({
    key,
    label,
    sort_order: sortRaw ? Number(sortRaw) : 0,
  });

  if (error) {
    redirect(`/settings/stats?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/settings/stats");
  redirect("/settings/stats");
}

export async function removeStatDefinition(key: string) {
  const { supabase } = await requireManager();
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
