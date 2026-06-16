import { createClient } from "@/lib/supabase/server";
import { createPost } from "@/lib/board/actions";
import { DEFAULT_CATEGORY } from "@/lib/board/helpers";
import PostFields from "../post-fields";

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: me } = await supabase
    .from("profiles")
    .select("role, title")
    .eq("id", user.id)
    .single();
  const myRole = me?.role ?? "player";
  const myTitle = me?.title ?? "player";

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
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
            새 글 작성
          </h1>
        </header>

        {error && (
          <p className="-mt-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </p>
        )}

        <form action={createPost} className="flex flex-col gap-4">
          <PostFields
            role={myRole}
            title={myTitle}
            defaultCategory={DEFAULT_CATEGORY}
          />

          <label className="flex flex-col gap-2">
            <span className="text-suaza-ink text-base">제목</span>
            <input
              type="text"
              name="title"
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
              className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button resize-none"
            />
          </label>

          <button
            type="submit"
            className="h-[52px] rounded-lg bg-suaza-button text-white text-base font-medium hover:opacity-90 transition"
          >
            등록
          </button>
        </form>
      </div>
    </main>
  );
}
