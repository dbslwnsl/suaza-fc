import Link from "next/link";
import { login } from "@/lib/auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="max-w-sm mx-auto p-8 font-sans">
      <h1 className="text-2xl font-bold mb-6">SUAZA FC 로그인</h1>

      {message && (
        <p className="mb-4 p-3 bg-green-50 text-green-700 rounded text-sm">
          {message}
        </p>
      )}
      {error && (
        <p className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
          {error}
        </p>
      )}

      <form action={login} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">이메일</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="border rounded px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">비밀번호</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="border rounded px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="mt-2 bg-black text-white rounded py-2 font-medium hover:bg-gray-800"
        >
          로그인
        </button>
      </form>

      <p className="mt-6 text-sm text-gray-600">
        계정이 없으신가요?{" "}
        <Link href="/signup" className="text-blue-600 hover:underline">
          회원가입
        </Link>
      </p>
    </main>
  );
}
