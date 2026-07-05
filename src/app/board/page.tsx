import { createClient } from "@/lib/supabase/server";
import { fetchBoardPage } from "@/lib/board/queries";
import PostList from "./post-list";

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

  // 최신 글 한 페이지(10개)만 서버 렌더 — 이후는 PostList 가 스크롤 시 자동 로드.
  const { posts, hasMore } = await fetchBoardPage(0, null);

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[800px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex items-center gap-3">
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
          <PostList initialPosts={posts} initialHasMore={hasMore} />
        )}
      </div>
    </main>
  );
}
