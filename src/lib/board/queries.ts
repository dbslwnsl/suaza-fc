import { createClient } from "@/lib/supabase/server";
import { type PostCategory } from "@/lib/board/helpers";
import { getCurrentTeam, DEFAULT_TEAM_ID } from "@/lib/teams/context";
import type { ListPost } from "@/app/board/post-list";
import type { Comment } from "@/app/board/[id]/comment-section";

// 게시판 목록 페이지 크기 — 첫 렌더와 무한 스크롤 추가 로드에 공통 사용.
export const BOARD_PAGE_SIZE = 10;

type PostRow = {
  id: string;
  title: string;
  content: string;
  is_notice: boolean;
  category: PostCategory;
  created_at: string;
  author_id: string;
  author: { name: string; avatar_url: string | null } | null;
};

type CommentRow = {
  id: string;
  post_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  parent_id: string | null;
  author: {
    name: string;
    avatar_url: string | null;
    title: string | null;
  } | null;
};

/**
 * 게시판 목록 한 페이지(BOARD_PAGE_SIZE개) 조회.
 * 글이 늘어나도 로딩이 느려지지 않도록 해당 페이지 글들의 댓글·좋아요만 함께 가져온다.
 * - offset: 이미 로드된 글 수 (0 = 첫 페이지)
 * - category: null = 전체, 그 외 = 해당 카테고리만
 */
export async function fetchBoardPage(
  offset: number,
  category: PostCategory | null,
): Promise<{ posts: ListPost[]; hasMore: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { posts: [], hasMore: false };

  const teamId = (await getCurrentTeam())?.id ?? DEFAULT_TEAM_ID;

  // PAGE_SIZE+1 개를 가져와 다음 페이지 존재 여부(hasMore)를 판정한다.
  let query = supabase
    .from("posts")
    .select(
      "id, title, content, is_notice, category, created_at, author_id, author:profiles!posts_author_id_fkey(name, avatar_url)",
    )
    .eq("team_id", teamId)
    .order("is_notice", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }) // created_at 동률 시에도 페이지 경계가 안정되도록
    .range(offset, offset + BOARD_PAGE_SIZE);
  if (category) query = query.eq("category", category);
  const { data: postsRaw } = await query;

  const rows = (postsRaw ?? []) as unknown as PostRow[];
  const hasMore = rows.length > BOARD_PAGE_SIZE;
  const postRows = rows.slice(0, BOARD_PAGE_SIZE);
  const postIds = postRows.map((p) => p.id);
  if (postIds.length === 0) return { posts: [], hasMore: false };

  // 이 페이지 글들의 댓글만 조회
  const { data: commentsRaw } = await supabase
    .from("post_comments")
    .select(
      "id, post_id, content, created_at, updated_at, author_id, parent_id, author:profiles!post_comments_author_id_fkey(name, avatar_url, title)",
    )
    .in("post_id", postIds)
    .order("created_at", { ascending: true });
  const commentRows = (commentsRaw ?? []) as unknown as CommentRow[];

  // 인라인 확장 시에도 좋아요가 보이도록 댓글 좋아요 수·본인 여부를 집계한다.
  const commentIds = commentRows.map((c) => c.id);
  const likeCountByComment = new Map<string, number>();
  const likedCommentIds = new Set<string>();
  const commentLikersById = new Map<
    string,
    { id: string; name: string; avatar_url: string | null }[]
  >();
  if (commentIds.length > 0) {
    const { data: commentLikeRows } = await supabase
      .from("comment_likes")
      .select("comment_id, user_id, user:profiles(name, avatar_url)")
      .in("comment_id", commentIds);
    for (const r of (commentLikeRows ?? []) as unknown as {
      comment_id: string;
      user_id: string;
      user: { name: string; avatar_url: string | null } | null;
    }[]) {
      likeCountByComment.set(
        r.comment_id,
        (likeCountByComment.get(r.comment_id) ?? 0) + 1,
      );
      if (r.user_id === user.id) likedCommentIds.add(r.comment_id);
      const arr = commentLikersById.get(r.comment_id) ?? [];
      arr.push({
        id: r.user_id,
        name: r.user?.name ?? "(알 수 없음)",
        avatar_url: r.user?.avatar_url ?? null,
      });
      commentLikersById.set(r.comment_id, arr);
    }
  }

  // 게시글 좋아요 — 인라인 확장에서도 하트 수·본인 여부·누른 사람을 표시.
  const likeCountByPost = new Map<string, number>();
  const likedByMePosts = new Set<string>();
  const likersByPost = new Map<
    string,
    { id: string; name: string; avatar_url: string | null }[]
  >();
  const { data: postLikeRows } = await supabase
    .from("post_likes")
    .select("post_id, user_id, user:profiles(name, avatar_url)")
    .in("post_id", postIds);
  for (const r of (postLikeRows ?? []) as unknown as {
    post_id: string;
    user_id: string;
    user: { name: string; avatar_url: string | null } | null;
  }[]) {
    likeCountByPost.set(r.post_id, (likeCountByPost.get(r.post_id) ?? 0) + 1);
    if (r.user_id === user.id) likedByMePosts.add(r.post_id);
    const arr = likersByPost.get(r.post_id) ?? [];
    arr.push({
      id: r.user_id,
      name: r.user?.name ?? "(알 수 없음)",
      avatar_url: r.user?.avatar_url ?? null,
    });
    likersByPost.set(r.post_id, arr);
  }

  const commentsByPost = new Map<string, Comment[]>();
  for (const c of commentRows) {
    const list = commentsByPost.get(c.post_id) ?? [];
    list.push({
      id: c.id,
      content: c.content,
      created_at: c.created_at,
      updated_at: c.updated_at,
      author_id: c.author_id,
      parent_id: c.parent_id,
      author: c.author,
      like_count: likeCountByComment.get(c.id) ?? 0,
      liked_by_me: likedCommentIds.has(c.id),
      likers: commentLikersById.get(c.id) ?? [],
    });
    commentsByPost.set(c.post_id, list);
  }

  const posts: ListPost[] = postRows.map((p) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    is_notice: p.is_notice,
    category: p.category,
    created_at: p.created_at,
    author_id: p.author_id,
    author: p.author,
    comments: commentsByPost.get(p.id) ?? [],
    likeCount: likeCountByPost.get(p.id) ?? 0,
    likedByMe: likedByMePosts.has(p.id),
    likers: likersByPost.get(p.id) ?? [],
  }));

  return { posts, hasMore };
}
