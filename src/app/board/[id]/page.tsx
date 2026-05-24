import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deletePost, updatePost } from "@/lib/board/actions";
import {
  CATEGORY_LABEL,
  DEFAULT_CATEGORY,
  categoryBadgeClass,
  formatPostDate,
  type PostCategory,
} from "@/lib/board/helpers";
import CommentSection, { type Comment } from "./comment-section";
import PostFields from "../post-fields";

type Post = {
  id: string;
  title: string;
  content: string;
  is_notice: boolean;
  category: PostCategory;
  author_id: string;
  created_at: string;
  updated_at: string;
  author: { name: string } | null;
};

export default async function PostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string; edit?: string }>;
}) {
  const { id } = await params;
  const { error, message, edit } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: post }, { data: me }, { data: commentsRaw }] =
    await Promise.all([
      supabase
        .from("posts")
        .select(
          "id, title, content, is_notice, category, author_id, created_at, updated_at, author:profiles(name)",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("profiles")
        .select("role, title")
        .eq("id", user.id)
        .single(),
      supabase
        .from("post_comments")
        .select(
          "id, content, created_at, updated_at, author_id, parent_id, author:profiles(name, avatar_url)",
        )
        .eq("post_id", id)
        .order("created_at", { ascending: true }),
    ]);

  if (!post) notFound();
  const p = post as unknown as Post;
  const isAuthor = p.author_id === user.id;
  const myRole = me?.role ?? "player";
  const isManager = myRole === "manager";
  const myTitle = me?.title ?? "player";
  const canEdit = isAuthor || isManager;
  const editing = edit === "1" && canEdit;
  const comments = (commentsRaw ?? []) as unknown as Comment[];

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex items-center gap-3">
          <Link
            href="/board"
            className="text-sm text-suaza-ink-muted hover:underline"
          >
            ← 목록
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

        {editing ? (
          <form action={updatePost.bind(null, p.id)} className="flex flex-col gap-4">
            <PostFields
              role={myRole}
              title={myTitle}
              defaultCategory={p.category ?? DEFAULT_CATEGORY}
              defaultIsNotice={p.is_notice}
            />

            <label className="flex flex-col gap-2">
              <span className="text-suaza-ink text-base">제목</span>
              <input
                type="text"
                name="title"
                defaultValue={p.title}
                required
                maxLength={120}
                className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-suaza-ink text-base">내용</span>
              <textarea
                name="content"
                required
                rows={10}
                defaultValue={p.content}
                className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button resize-none"
              />
            </label>

            <div className="flex gap-2">
              <Link
                href={`/board/${p.id}`}
                className="flex-1 h-[52px] rounded-lg border border-suaza-border text-suaza-ink text-base font-medium flex items-center justify-center hover:bg-gray-50"
              >
                취소
              </Link>
              <button
                type="submit"
                className="flex-1 h-[52px] rounded-lg bg-suaza-button text-white text-base font-medium hover:opacity-90"
              >
                저장
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {/* 공지 카테고리는 카테고리 뱃지가 "공지"를 표시하므로 중복 방지 */}
                {p.is_notice && p.category !== "notice" && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-suaza-accent text-white font-medium">
                    공지
                  </span>
                )}
                {p.category && (
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded font-medium ${categoryBadgeClass(p.category, p.is_notice)}`}
                  >
                    {CATEGORY_LABEL[p.category]}
                  </span>
                )}
                <h1 className="text-xl sm:text-2xl font-bold text-suaza-ink">
                  {p.title}
                </h1>
              </div>
              <div className="text-sm text-suaza-ink-muted flex items-center justify-between gap-2">
                <div className="flex gap-2 min-w-0">
                  <span className="truncate">
                    {p.author?.name ?? "(알 수 없음)"}
                  </span>
                  <span>·</span>
                  <span className="shrink-0">{formatPostDate(p.created_at)}</span>
                </div>
                {canEdit && (
                  <div className="flex gap-1.5 shrink-0">
                    <Link
                      href={`/board/${p.id}?edit=1`}
                      className="inline-flex items-center text-xs px-2.5 py-1 rounded-md border border-suaza-border text-suaza-ink hover:bg-gray-50 transition"
                    >
                      수정
                    </Link>
                    <form action={deletePost.bind(null, p.id)}>
                      <button
                        type="submit"
                        className="inline-flex items-center text-xs px-2.5 py-1 rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition"
                      >
                        삭제
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>

            <div className="text-suaza-ink whitespace-pre-wrap leading-relaxed">
              {p.content}
            </div>

            <CommentSection
              postId={p.id}
              comments={comments}
              myUserId={user.id}
              isManager={isManager}
            />
          </>
        )}
      </div>
    </main>
  );
}
