import { createClient } from "@/lib/supabase/server";
import NewsInbox, { type NewsItem } from "./news-inbox";

// 받은 알림은 자주 바뀌므로 항상 fresh 로드
export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, url, created_at, read_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[800px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <NewsInbox initial={(data ?? []) as NewsItem[]} />
      </div>
    </main>
  );
}
