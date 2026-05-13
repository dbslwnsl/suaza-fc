import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ROLE_BADGE, ROLE_LABEL } from "@/lib/members/positions";

export default async function MembersPage() {
  const supabase = await createClient();

  // role 정렬: manager → coach → player
  const { data: members } = await supabase
    .from("profiles")
    .select("id, name, nickname, role, positions, jersey_number")
    .order("role", { ascending: true })
    .order("name", { ascending: true });

  return (
    <main className="p-8 font-sans max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-gray-500 hover:underline">
            ← 홈
          </Link>
          <h1 className="text-2xl font-bold">회원 명단</h1>
        </div>
        <span className="text-sm text-gray-500">
          총 {members?.length ?? 0}명
        </span>
      </header>

      {!members || members.length === 0 ? (
        <p className="text-gray-500">등록된 회원이 없습니다.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {members.map((m) => (
            <li key={m.id}>
              <Link
                href={`/members/${m.id}`}
                className="block p-4 border rounded-lg hover:bg-gray-50 transition"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{m.name}</span>
                    {m.nickname && (
                      <span className="text-sm text-gray-500">
                        ({m.nickname})
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${ROLE_BADGE[m.role] ?? ROLE_BADGE.player}`}
                  >
                    {ROLE_LABEL[m.role] ?? m.role}
                  </span>
                </div>
                <div className="text-sm text-gray-600 flex gap-3">
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
    </main>
  );
}
