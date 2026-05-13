import Link from "next/link";
import { signup } from "@/lib/auth/actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="max-w-sm mx-auto p-8 font-sans">
      <h1 className="text-2xl font-bold mb-6">SUAZA FC 회원가입</h1>

      {error && (
        <p className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
          {error}
        </p>
      )}

      <form action={signup} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">이름</span>
          <input
            type="text"
            name="name"
            required
            autoComplete="name"
            className="border rounded px-3 py-2"
          />
        </label>
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
          <span className="text-sm font-medium">비밀번호 (8자 이상)</span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="border rounded px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="mt-2 bg-black text-white rounded py-2 font-medium hover:bg-gray-800"
        >
          가입하기
        </button>
      </form>

      <p className="mt-6 text-sm text-gray-600">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="text-blue-600 hover:underline">
          로그인
        </Link>
      </p>
    </main>
  );
}
