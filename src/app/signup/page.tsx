import Link from "next/link";
import SignupForm from "./signup-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    message?: string;
    completed?: string;
    email?: string;
  }>;
}) {
  const { error, message, completed, email } = await searchParams;
  const isCompleted = completed === "1";

  return (
    <main className="flex-1 flex items-center justify-center bg-white sm:bg-suaza-bg px-6 py-8 sm:py-[80px]">
      <div className="w-full max-w-[440px] bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-8">
        {isCompleted ? (
          <CompletedView email={email} />
        ) : (
          <>
            {/* Title */}
            <div className="flex flex-col items-center gap-1.5">
              <h1 className="font-bold text-suaza-ink text-2xl sm:text-[28px]">
                회원가입
              </h1>
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
          가입이 거의 완료됐어요
        </h1>
        <p className="text-suaza-ink-muted text-[13px] sm:text-sm leading-relaxed">
          {email ? (
            <>
              <span className="font-medium text-suaza-ink">{email}</span> 로
              <br />
              확인 메일을 보냈어요.
            </>
          ) : (
            "입력하신 이메일로 확인 메일을 보냈어요."
          )}
          <br />
          메일함의 확인 링크를 클릭하면 최종 완료됩니다.
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
