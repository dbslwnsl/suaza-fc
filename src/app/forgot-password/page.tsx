import Image from "next/image";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth/actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    completed?: string;
    email?: string;
  }>;
}) {
  const { error, completed, email } = await searchParams;
  const isCompleted = completed === "1";

  return (
    <main className="flex-1 flex items-center justify-center bg-white sm:bg-suaza-bg px-6 py-8 sm:py-[80px]">
      <div className="w-full max-w-[440px] bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-8">
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
        </div>

        {isCompleted ? (
          <CompletedView email={email} />
        ) : (
          <>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <h1 className="font-bold text-suaza-ink text-2xl sm:text-[28px]">
                비밀번호 찾기
              </h1>
              <p className="text-suaza-ink-muted text-[13px] sm:text-sm">
                가입한 이메일로 재설정 링크를 보내드려요
              </p>
            </div>

            {error && (
              <p className="-mt-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                {error}
              </p>
            )}

            <form
              action={requestPasswordReset}
              className="flex flex-col gap-5"
            >
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

              <button
                type="submit"
                className="h-[52px] rounded-lg bg-suaza-button text-white text-base font-medium hover:opacity-90 transition"
              >
                재설정 메일 보내기
              </button>
            </form>

            <div className="flex items-center justify-center gap-1 text-[13px]">
              <Link href="/login" className="text-suaza-accent font-bold">
                ← 로그인으로 돌아가기
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function CompletedView({ email }: { email?: string }) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center text-3xl">
        📧
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-bold text-suaza-ink text-2xl sm:text-[28px]">
          메일을 보냈어요
        </h1>
        <p className="text-suaza-ink-muted text-[13px] sm:text-sm leading-relaxed">
          {email ? (
            <>
              <span className="font-medium text-suaza-ink">{email}</span> 로
              <br />
              재설정 링크를 보냈어요.
            </>
          ) : (
            "입력하신 이메일로 재설정 링크를 보냈어요."
          )}
          <br />
          메일함의 링크를 클릭해 비밀번호를 새로 설정해 주세요.
        </p>
      </div>

      <div className="text-[12px] text-suaza-ink-faint text-center -mt-2">
        메일이 안 보이면 스팸함도 확인해 주세요.
      </div>

      <Link
        href="/login"
        className="w-full h-[52px] rounded-lg bg-suaza-button text-white text-base font-medium hover:opacity-90 transition flex items-center justify-center"
      >
        로그인 페이지로
      </Link>
    </div>
  );
}
