import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ResetForm from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/forgot-password?error=${encodeURIComponent(
        "재설정 링크가 만료되었습니다. 다시 시도해 주세요.",
      )}`,
    );
  }

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

        <div className="flex flex-col items-center gap-1.5 text-center">
          <h1 className="font-bold text-suaza-ink text-2xl sm:text-[28px]">
            새 비밀번호 설정
          </h1>
          <p className="text-suaza-ink-muted text-[13px] sm:text-sm">
            새로 사용할 비밀번호를 입력해 주세요
          </p>
        </div>

        {error && (
          <p className="-mt-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </p>
        )}

        <ResetForm />

        <div className="flex items-center justify-center gap-1 text-[13px]">
          <Link href="/login" className="text-suaza-accent font-bold">
            ← 로그인으로 돌아가기
          </Link>
        </div>
      </div>
    </main>
  );
}
