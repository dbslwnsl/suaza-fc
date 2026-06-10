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
    <main className="flex-1 bg-suaza-bg min-h-[100dvh]">
      <NewsInbox initial={(data ?? []) as NewsItem[]} />
    </main>
  );
}
