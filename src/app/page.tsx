import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/auth/actions";
import { ROLE_BADGE, ROLE_LABEL } from "@/lib/members/positions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy 가 비로그인 사용자를 /login 으로 보내므로 여기서는 user 가 항상 존재.
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, nickname, role, positions")
    .eq("id", user!.id)
    .single();

  return (
    <main className="p-8 font-sans max-w-2xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">SUAZA FC ⚽</h1>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm border rounded px-3 py-1.5 hover:bg-gray-100"
          >
            로그아웃
          </button>
        </form>
      </header>

      <section className="p-4 bg-gray-100 rounded space-y-1 mb-6">
        {profile ? (
          <>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-lg">{profile.name}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded ${ROLE_BADGE[profile.role] ?? ROLE_BADGE.player}`}
              >
                {ROLE_LABEL[profile.role] ?? profile.role}
              </span>
            </div>
            <p className="text-sm text-gray-600">{user!.email}</p>
            {profile.positions && profile.positions.length > 0 && (
              <p className="text-sm">
                <span className="text-gray-600">포지션:</span>{" "}
                {profile.positions.join(" / ")}
              </p>
            )}
            <Link
              href={`/members/${user!.id}`}
              className="inline-block mt-2 text-sm text-blue-600 hover:underline"
            >
              내 프로필 수정 →
            </Link>
          </>
        ) : (
          <p className="text-amber-700">
            ⚠️ 프로필 정보가 없습니다. Supabase 마이그레이션 SQL이 적용되었는지
            확인해 주세요.
          </p>
        )}
      </section>

      <nav className="grid sm:grid-cols-2 gap-3">
        <Link
          href="/members"
          className="p-4 border rounded-lg hover:bg-gray-50 transition"
        >
          <h2 className="font-semibold">회원 명단</h2>
          <p className="text-sm text-gray-600">선수·코치·감독 목록</p>
        </Link>
      </nav>
    </main>
  );
}
