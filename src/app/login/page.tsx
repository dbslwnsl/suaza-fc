import Link from "next/link";
import LoginForm from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; intent?: string }>;
}) {
  const { error, message, intent } = await searchParams;
  // 팀 생성 의도로 온 방문 — 배너를 보여주고, 로그인/가입 후 팀 생성으로 이어간다.
  const wantsCreateTeam = intent === "create-team";

  return (
    <main className="flex-1 flex flex-col bg-white px-7 py-8">
      <div className="w-full max-w-[400px] mx-auto flex flex-1 flex-col">
        {/* Brand — 팀 플랫폼(OurMatch). 팀 브랜딩은 로그인 후 홈에서 팀별로 표시 */}
        <div className="flex flex-col items-center gap-2 mt-16 mb-12">
          <span className="text-4xl" aria-hidden>
            ⚽
          </span>
          <span className="font-display font-bold text-2xl text-suaza-ink tracking-tight">
            OurMatch
          </span>
        </div>

        {/* 팀 생성 의도 안내 */}
        {wantsCreateTeam && (
          <div className="mb-4 p-4 bg-[#F0F4FF] rounded-xl text-sm leading-relaxed">
            <p className="font-bold text-suaza-ink">
              <span className="text-[#2563EB]" aria-hidden>
                !
              </span>{" "}
              새 팀 만들기
            </p>
            <p className="text-[#5B6478] mt-0.5">
              로그인을 하면 팀 생성 신청으로 연결됩니다
            </p>
          </div>
        )}

        {/* Alerts */}
        {message && (
          <p className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
            {message}
          </p>
        )}
        {error && (
          <p className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </p>
        )}

        {/* Form */}
        <LoginForm intent={wantsCreateTeam ? "create-team" : undefined} />

        {/* Footer */}
        <div className="mt-auto flex flex-col items-center gap-2.5 pt-10 pb-2">
          <div className="flex items-center justify-center gap-1 text-[14px]">
            <span className="text-[#8E8E93]">계정이 없으신가요?</span>
            <Link
              href={wantsCreateTeam ? "/signup?intent=create-team" : "/signup"}
              className="text-[#2563EB] font-bold"
            >
              계정 만들기
            </Link>
          </div>
          {/* 팀 창단 진입점 — 이미 의도를 갖고 온 상태에서는 숨긴다 */}
          {!wantsCreateTeam && (
            <div className="flex items-center justify-center gap-1 text-[14px]">
              <span className="text-[#8E8E93]">우리 팀을 시작하시나요?</span>
              <Link
                href="/login?intent=create-team"
                className="text-[#2563EB] font-bold"
              >
                팀 만들기
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
