import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/page-header";
import { formatPostDate } from "@/lib/board/helpers";

type Post = {
  id: string;
  title: string;
  is_notice: boolean;
  created_at: string;
  author: { name: string } | null;
};

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  const supabase = await createClient();
  const { data: postsRaw } = await supabase
    .from("posts")
    .select("id, title, is_notice, created_at, author:profiles(name)")
    .order("is_notice", { ascending: false })
    .order("created_at", { ascending: false });

  const posts = (postsRaw ?? []) as unknown as Post[];

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <PageHeader
          title="게시판"
          right={
            <Link
              href="/board/new"
              className="text-sm bg-suaza-button text-white rounded-lg px-3.5 py-2 font-medium hover:opacity-90"
            >
              + 새 글
            </Link>
          }
        />

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
          <ul className="flex flex-col gap-2">
            {posts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/board/${p.id}`}
                  className="block p-4 border border-suaza-border rounded-lg hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {p.is_notice && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-suaza-accent text-white font-medium">
                        공지
                      </span>
                    )}
                    <span className="font-bold text-suaza-ink">{p.title}</span>
                  </div>
                  <div className="text-sm text-suaza-ink-muted flex gap-2">
                    <span>{p.author?.name ?? "(알 수 없음)"}</span>
                    <span>·</span>
                    <span>{formatPostDate(p.created_at)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
