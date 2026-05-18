import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  TITLE_BADGE,
  TITLE_LABEL,
  type MemberTitle,
} from "@/lib/members/positions";
import { displayMemberName } from "@/lib/members/name";

type MemberRow = {
  id: string;
  name: string;
  nickname: string | null;
  title: MemberTitle;
  positions: string[] | null;
  jersey_number: number | null;
};

export default async function RosterView() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myId = user?.id ?? null;

  const { data: members } = await supabase
    .from("profiles")
    .select("id, name, nickname, title, positions, jersey_number")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const raw = (members ?? []) as MemberRow[];
  // 본인을 항상 맨 위로
  const list = myId
    ? [
        ...raw.filter((m) => m.id === myId),
        ...raw.filter((m) => m.id !== myId),
      ]
    : raw;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <span className="text-sm text-suaza-ink-muted">총 {list.length}명</span>
      </div>

      {list.length === 0 ? (
        <p className="text-suaza-ink-muted text-sm">등록된 회원이 없습니다.</p>
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
                    <span className="font-bold text-suaza-ink">
                      {displayMemberName(m.name)}
                    </span>
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
    </section>
  );
}
