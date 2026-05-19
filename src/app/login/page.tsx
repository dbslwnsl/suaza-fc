import Image from "next/image";
import Link from "next/link";
import { login } from "@/lib/auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center bg-white sm:bg-suaza-bg px-6 py-8 sm:py-[120px]">
      <div className="w-full max-w-[440px] bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-8">
        {/* Brand */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden">
            <Image
              src="/suaza-emblem.png"
              alt="수아자FC"
              fill
              sizes="64px"
              priority
              className="object-cover"
            />
          </div>
          <p className="font-display font-bold text-suaza-ink text-2xl sm:text-[28px] tracking-[2px]">
            수아자FC
          </p>
          <p className="text-suaza-ink-muted text-xs sm:text-[13px] tracking-[1px]">
            수원센트럴아이파크자이
          </p>
        </div>

        {/* Title */}
        <div className="flex flex-col items-center gap-1.5">
          <h1 className="font-bold text-suaza-ink text-2xl sm:text-[28px]">
            로그인
          </h1>
          <p className="text-suaza-ink-muted text-[13px] sm:text-sm">
            환영합니다! 계정에 로그인해 주세요
          </p>
        </div>

        {/* Alerts */}
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

        {/* Form */}
        <form action={login} className="flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="text-suaza-ink text-base">이메일</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="your@email.com"
              className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink placeholder:text-suaza-placeholder focus:outline-none focus:border-suaza-button"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-suaza-ink text-base">비밀번호</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink placeholder:text-suaza-placeholder focus:outline-none focus:border-suaza-button"
            />
          </label>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="remember"
                className="w-4 h-4 rounded border-suaza-border accent-suaza-button"
              />
              <span className="text-suaza-ink text-base">로그인 상태 유지</span>
            </label>
            <Link
              href="/forgot-password"
              className="text-suaza-accent text-xs sm:text-[13px] font-medium hover:underline"
            >
              비밀번호 찾기
            </Link>
          </div>

          <button
            type="submit"
            className="h-[52px] rounded-lg bg-suaza-button text-white text-base font-medium hover:opacity-90 transition"
          >
            로그인
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-suaza-divider" />
          <span className="text-suaza-ink-faint text-xs">또는</span>
          <div className="flex-1 h-px bg-suaza-divider" />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1 text-[13px]">
          <span className="text-suaza-ink-muted">아직 회원이 아니신가요?</span>
          <Link href="/signup" className="text-suaza-accent font-bold">
            회원가입
          </Link>
        </div>
      </div>
    </main>
  );
}
