import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  TITLE_BADGE,
  TITLE_LABEL,
  type MemberTitle,
} from "@/lib/members/positions";

type MemberRow = {
  id: string;
  name: string;
  nickname: string | null;
  title: MemberTitle;
  positions: string[] | null;
  jersey_number: number | null;
};

export default async function MembersPage() {
  const supabase = await createClient();

  // title enum 순서대로 자동 정렬
  const { data: members } = await supabase
    .from("profiles")
    .select("id, name, nickname, title, positions, jersey_number")
    .order("title", { ascending: true })
    .order("name", { ascending: true });

  const list = (members ?? []) as MemberRow[];

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[800px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            회원 명단
          </h1>
          <span className="text-sm text-suaza-ink-muted">
            총 {list.length}명
          </span>
        </header>

        {list.length === 0 ? (
          <p className="text-suaza-ink-muted text-sm">
            등록된 회원이 없습니다.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/members/${m.id}`}
                  className="block p-4 border border-suaza-border rounded-lg hover:bg-gray-50 transition"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-suaza-ink">{m.name}</span>
                      {m.nickname && (
                        <span className="text-sm text-suaza-ink-muted">
                          ({m.nickname})
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${TITLE_BADGE[m.title] ?? TITLE_BADGE.player}`}
                    >
                      {TITLE_LABEL[m.title] ?? m.title}
                    </span>
                  </div>
                  <div className="text-sm text-suaza-ink-muted flex gap-3">
                    {m.jersey_number != null && <span>#{m.jersey_number}</span>}
                    {m.positions && m.positions.length > 0 && (
                      <span>{m.positions.join(" / ")}</span>
                    )}
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
