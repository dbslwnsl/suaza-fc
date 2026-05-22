import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createPost } from "@/lib/board/actions";
import {
  CATEGORY_LABEL,
  DEFAULT_CATEGORY,
  POST_CATEGORIES,
  canUseCategory,
} from "@/lib/board/helpers";

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
  const isManager = me?.role === "manager";
  const myTitle = me?.title ?? "player";

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
          <label className="flex flex-col gap-2">
            <span className="text-suaza-ink text-base">카테고리</span>
            <select
              name="category"
              defaultValue={DEFAULT_CATEGORY}
              className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink bg-white focus:outline-none focus:border-suaza-button"
            >
              {POST_CATEGORIES.filter((c) => canUseCategory(c, myTitle)).map(
                (c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>

          {isManager && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="is_notice"
                className="w-4 h-4 rounded border-suaza-border accent-suaza-button"
              />
              <span className="text-sm text-suaza-ink">
                <span className="text-suaza-accent font-medium">공지</span>로
                등록 (홈에 노출됨)
              </span>
            </label>
          )}

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
