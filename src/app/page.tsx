import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/auth/actions";
import { ROLE_BADGE, ROLE_LABEL } from "@/lib/members/positions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, nickname, role, positions")
    .eq("id", user!.id)
    .single();

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[960px] mx-auto flex flex-col gap-6">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative w-9 h-9 rounded-full overflow-hidden">
              <Image
                src="/suaza-emblem.png"
                alt="수아자FC"
                fill
                sizes="36px"
                priority
                className="object-cover"
              />
            </div>
            <span className="font-bold text-suaza-ink text-xl">수아자FC</span>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="text-[13px] border border-suaza-border rounded-md px-3 py-1.5 text-suaza-ink hover:bg-gray-50 transition"
            >
              로그아웃
            </button>
          </form>
        </header>

        {/* User Profile Card */}
        <section className="bg-white sm:rounded-2xl sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-4 sm:p-6 rounded-xl border sm:border-0 border-suaza-border flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="relative w-14 h-14 rounded-full overflow-hidden shrink-0">
              <Image
                src="/suaza-emblem.png"
                alt={profile?.name ?? "프로필"}
                fill
                sizes="56px"
                className="object-cover"
              />
            </div>
            <div className="flex flex-col gap-1">
              {profile ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-suaza-ink text-lg">
                      {profile.name}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${ROLE_BADGE[profile.role] ?? ROLE_BADGE.player}`}
                    >
                      {ROLE_LABEL[profile.role] ?? profile.role}
                    </span>
                  </div>
                  <span className="text-suaza-ink-muted text-[13px]">
                    {user!.email}
                  </span>
                  {profile.positions && profile.positions.length > 0 && (
                    <span className="text-suaza-ink-muted text-[13px]">
                      포지션: {profile.positions.join(", ")}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="font-bold text-suaza-ink text-lg">
                    {user!.email}
                  </span>
                  <span className="text-amber-700 text-[13px]">
                    ⚠️ 프로필 정보가 없습니다.
                  </span>
                </>
              )}
            </div>
          </div>
          {profile && (
            <Link
              href={`/members/${user!.id}`}
              className="text-[13px] font-bold text-suaza-accent hover:underline"
            >
              내 프로필 수정 →
            </Link>
          )}
        </section>

      </div>
    </main>
  );
}
