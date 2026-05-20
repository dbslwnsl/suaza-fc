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

  // 새 글을 공지로 등록하면 기존의 다른 공지를 모두 일반 글로 전환 (단일 공지 제약)
  if (isNotice) {
    await supabase
      .from("posts")
      .update({ is_notice: false })
      .eq("is_notice", true);
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

  // 이 글을 공지로 전환하면 다른 모든 공지를 일반 글로 (단일 공지 제약)
  if (role === "manager" && isNotice) {
    await supabase
      .from("posts")
      .update({ is_notice: false })
      .eq("is_notice", true)
      .neq("id", postId);
  }

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

// ─────────────────────────────────────────────────────────────
// 게시글 댓글
// ─────────────────────────────────────────────────────────────

export async function createComment(postId: string, formData: FormData) {
  const { supabase, userId } = await getUserAndRole();
  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    redirect(`/board/${postId}?error=${encodeURIComponent("내용을 입력해 주세요")}`);
  }
  const { error } = await supabase.from("post_comments").insert({
    post_id: postId,
    author_id: userId,
    content,
  });
  if (error) {
    redirect(`/board/${postId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/board/${postId}`);
  redirect(`/board/${postId}`);
}

export async function updateComment(
  commentId: string,
  postId: string,
  formData: FormData,
) {
  const { supabase } = await getUserAndRole();
  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    redirect(`/board/${postId}?error=${encodeURIComponent("내용을 입력해 주세요")}`);
  }
  const { error } = await supabase
    .from("post_comments")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", commentId);
  if (error) {
    redirect(`/board/${postId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/board/${postId}`);
  redirect(`/board/${postId}`);
}

export async function deleteComment(commentId: string, postId: string) {
  const { supabase } = await getUserAndRole();
  const { error } = await supabase
    .from("post_comments")
    .delete()
    .eq("id", commentId);
  if (error) {
    redirect(`/board/${postId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/board/${postId}`);
  redirect(`/board/${postId}`);
}
