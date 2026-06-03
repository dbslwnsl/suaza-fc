import Image from "next/image";
import Link from "next/link";
import LoginForm from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="flex-1 flex flex-col bg-white px-7 py-8">
      <div className="w-full max-w-[400px] mx-auto flex flex-1 flex-col">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3 mt-16 mb-12">
          <span className="font-display font-bold text-2xl text-suaza-ink tracking-tight">
            수아자FC
          </span>
          <div className="relative w-11 h-11 rounded-full overflow-hidden">
            <Image
              src="/suaza-emblem.png"
              alt="수아자FC"
              fill
              sizes="44px"
              priority
              className="object-cover"
            />
          </div>
        </div>

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
        <LoginForm />

        {/* Footer */}
        <div className="mt-auto flex items-center justify-center gap-1 text-[14px] pt-10 pb-2">
          <span className="text-[#8E8E93]">계정이 없으신가요?</span>
          <Link href="/signup" className="text-[#2563EB] font-bold">
            계정 만들기
          </Link>
        </div>
      </div>
    </main>
  );
}
