"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  notifyNewPost,
  notifyNotice,
  notifyReply,
  notifyPostComment,
} from "@/lib/push/triggers";
import {
  DEFAULT_CATEGORY,
  canHomeExpose,
  canUseCategory,
  isPostCategory,
  type PostCategory,
} from "@/lib/board/helpers";

// 폼에서 받은 카테고리를 검증. 직책자 전용 카테고리(공지)는 권한 없으면 기본값으로.
function resolveCategory(raw: string, title: string | null): PostCategory {
  if (!isPostCategory(raw)) return DEFAULT_CATEGORY;
  if (!canUseCategory(raw, title)) return DEFAULT_CATEGORY;
  return raw;
}

async function getUserAndRole() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role, title")
    .eq("id", user.id)
    .single();
  return {
    supabase,
    userId: user.id,
    role: me?.role ?? "player",
    title: (me?.title ?? "player") as string,
  };
}

export async function createPost(formData: FormData) {
  const { supabase, userId, role, title: myTitle } = await getUserAndRole();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const category = resolveCategory(
    String(formData.get("category") ?? ""),
    myTitle,
  );
  const isNotice =
    formData.get("is_notice") === "on" &&
    canHomeExpose(role, myTitle, category);

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
      category,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/board/new?error=${encodeURIComponent(error.message)}`);
  }

  const postId = data!.id;
  // 응답(리다이렉트) 이후 알림 발송 — after() 는 redirect 시에도 실행됨.
  after(async () => {
    try {
      const payload = { body: title, url: `/board/${postId}` };
      // 공지는 전용 트리거(notifyNotice), 일반 글은 notifyNewPost 로 분리 발송.
      if (isNotice) {
        await notifyNotice({ title: "새 공지", ...payload }, userId);
      } else {
        await notifyNewPost({ title: "새 게시글", ...payload }, userId);
      }
    } catch (e) {
      console.error("[push] 새 게시글 알림 실패", e);
    }
  });

  revalidatePath("/board");
  revalidatePath("/");
  redirect(`/board/${postId}`);
}

export async function updatePost(postId: string, formData: FormData) {
  const { supabase, role, title: myTitle } = await getUserAndRole();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const category = resolveCategory(
    String(formData.get("category") ?? ""),
    myTitle,
  );
  const exposeAllowed = canHomeExpose(role, myTitle, category);
  const isNotice = formData.get("is_notice") === "on" && exposeAllowed;

  if (!title) {
    redirect(`/board/${postId}?error=${encodeURIComponent("제목을 입력해 주세요")}`);
  }

  const patch: {
    title: string;
    content: string;
    updated_at: string;
    category: PostCategory;
    is_notice?: boolean;
  } = {
    title,
    content,
    updated_at: new Date().toISOString(),
    category,
  };
  // 노출 권한이 있는 경우에만 is_notice 갱신 (권한 없으면 기존값 유지)
  if (exposeAllowed) patch.is_notice = isNotice;

  // 이 글을 공지로 전환하면 다른 모든 공지를 일반 글로 (단일 공지 제약)
  if (exposeAllowed && isNotice) {
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

export async function createComment(
  postId: string,
  parentId: string | null,
  formData: FormData,
) {
  const { supabase, userId } = await getUserAndRole();
  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    redirect(`/board/${postId}?error=${encodeURIComponent("내용을 입력해 주세요")}`);
  }

  // 1단계만 허용: parent_id 가 이미 답글이면 그 답글의 부모 댓글로 평탄화
  let effectiveParent: string | null = parentId;
  if (parentId) {
    const { data: parent } = await supabase
      .from("post_comments")
      .select("parent_id")
      .eq("id", parentId)
      .single();
    if (parent?.parent_id) effectiveParent = parent.parent_id;
  }

  const { error } = await supabase.from("post_comments").insert({
    post_id: postId,
    author_id: userId,
    content,
    parent_id: effectiveParent,
  });
  if (error) {
    redirect(`/board/${postId}?error=${encodeURIComponent(error.message)}`);
  }

  // 알림 대상: 원 글 작성자 + (답글이면) 부모 댓글 작성자. 본인 동작·중복은 제외.
  const notified = new Set<string>([userId]);

  // 1) 원 글 작성자에게 "새 댓글" 알림 (댓글/답글 모두)
  const { data: post } = await supabase
    .from("posts")
    .select("author_id")
    .eq("id", postId)
    .single();
  const postAuthorId = post?.author_id as string | undefined;
  if (postAuthorId && !notified.has(postAuthorId)) {
    notified.add(postAuthorId);
    after(async () => {
      try {
        await notifyPostComment(
          {
            title: "새 댓글",
            body: "회원님의 게시글에 새 댓글이 달렸어요",
            url: `/board/${postId}`,
          },
          postAuthorId,
        );
      } catch (e) {
        console.error("[push] 게시글 댓글 알림 실패", e);
      }
    });
  }

  // 2) 답글이면 부모 댓글 작성자에게 "새 답글" 알림 (이미 알림 간 사람은 제외)
  if (effectiveParent) {
    const { data: parent } = await supabase
      .from("post_comments")
      .select("author_id")
      .eq("id", effectiveParent)
      .single();
    const parentAuthorId = parent?.author_id as string | undefined;
    if (parentAuthorId && !notified.has(parentAuthorId)) {
      notified.add(parentAuthorId);
      after(async () => {
        try {
          await notifyReply(
            {
              title: "새 답글",
              body: "회원님의 게시판 댓글에 답글이 달렸어요",
              url: `/board/${postId}`,
            },
            parentAuthorId,
          );
        } catch (e) {
          console.error("[push] 게시판 답글 알림 실패", e);
        }
      });
    }
  }

  // 리스트 인라인/상세 모두 "제자리" 갱신 — 상세 페이지로 강제 이동하지 않는다.
  revalidatePath(`/board/${postId}`);
  revalidatePath("/board");
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
  revalidatePath("/board");
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
  revalidatePath("/board");
}
