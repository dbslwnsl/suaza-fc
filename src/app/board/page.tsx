import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PostList, { type ListPost } from "./post-list";
import { type Comment } from "./[id]/comment-section";
import { type PostCategory } from "@/lib/board/helpers";

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
  author: { name: string; avatar_url: string | null } | null;
};

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: postsRaw }, { data: commentsRaw }, { data: me }] =
    await Promise.all([
      supabase
        .from("posts")
        .select(
          "id, title, content, is_notice, category, created_at, author_id, author:profiles(name, avatar_url)",
        )
        .order("is_notice", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("post_comments")
        .select(
          "id, post_id, content, created_at, updated_at, author_id, parent_id, author:profiles(name, avatar_url)",
        )
        .order("created_at", { ascending: true }),
      supabase.from("profiles").select("role").eq("id", user.id).single(),
    ]);

  const postRows = (postsRaw ?? []) as unknown as PostRow[];
  const commentRows = (commentsRaw ?? []) as unknown as CommentRow[];
  const isManager = me?.role === "manager";

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
  }));

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[800px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <svg
              className="w-9 h-9 text-suaza-ink shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="8" y1="13" x2="16" y2="13" />
              <line x1="8" y1="17" x2="16" y2="17" />
            </svg>
            <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
              게시판
            </h1>
          </div>
          <Link
            href="/board/new"
            className="text-xs desktop:text-sm bg-suaza-ink text-white rounded-lg px-2.5 desktop:px-4 py-1 desktop:py-2.5 font-medium hover:opacity-90 transition shrink-0 whitespace-nowrap self-center"
          >
            + 새 글
          </Link>
        </header>

        {message && (
          <p className="-mt-2 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
            {message}
          </p>
        )}
        {error && (
          <p className="-mt-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </p>
        )}

        {posts.length === 0 ? (
          <p className="text-suaza-ink-muted text-sm">
            아직 작성된 글이 없습니다.
          </p>
        ) : (
          <PostList
            posts={posts}
            myUserId={user.id}
            isManager={isManager}
          />
        )}
      </div>
    </main>
  );
}
