import Image from "next/image";
import Link from "next/link";
import SignupForm from "./signup-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center bg-white sm:bg-suaza-bg px-6 py-8 sm:py-[80px]">
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
            회원가입
          </h1>
          <p className="text-suaza-ink-muted text-[13px] sm:text-sm">
            수아자FC에 함께해주세요
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

        <SignupForm />

        {/* Footer */}
        <div className="flex items-center justify-center gap-1 text-[13px]">
          <span className="text-suaza-ink-muted">이미 회원이신가요?</span>
          <Link href="/login" className="text-suaza-accent font-bold">
            로그인
          </Link>
        </div>
      </div>
    </main>
  );
}
