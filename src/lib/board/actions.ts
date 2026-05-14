"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function getUserAndRole() {
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
  return { supabase, userId: user.id, role: me?.role ?? "player" };
}

export async function createPost(formData: FormData) {
  const { supabase, userId, role } = await getUserAndRole();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const isNotice = formData.get("is_notice") === "on" && role === "manager";

  if (!title) {
    redirect(`/board/new?error=${encodeURIComponent("제목을 입력해 주세요")}`);
  }
  if (!content) {
    redirect(`/board/new?error=${encodeURIComponent("내용을 입력해 주세요")}`);
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_id: userId,
      title,
      content,
      is_notice: isNotice,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/board/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/board");
  revalidatePath("/");
  redirect(`/board/${data!.id}`);
}

export async function updatePost(postId: string, formData: FormData) {
  const { supabase, role } = await getUserAndRole();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const isNotice = formData.get("is_notice") === "on" && role === "manager";

  if (!title) {
    redirect(`/board/${postId}?error=${encodeURIComponent("제목을 입력해 주세요")}`);
  }

  const patch: { title: string; content: string; updated_at: string; is_notice?: boolean } = {
    title,
    content,
    updated_at: new Date().toISOString(),
  };
  if (role === "manager") patch.is_notice = isNotice;

  const { error } = await supabase
    .from("posts")
    .update(patch)
    .eq("id", postId);

  if (error) {
    redirect(`/board/${postId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/board");
  revalidatePath(`/board/${postId}`);
  revalidatePath("/");
  redirect(`/board/${postId}?message=${encodeURIComponent("저장되었습니다")}`);
}

export async function deletePost(postId: string) {
  const { supabase } = await getUserAndRole();
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) {
    redirect(`/board/${postId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/board");
  revalidatePath("/");
  redirect(`/board?message=${encodeURIComponent("삭제되었습니다")}`);
}
