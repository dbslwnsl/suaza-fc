"use client";

import Link from "next/link";
import { useState } from "react";
import { login } from "@/lib/auth/actions";

function ClearIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M1 1L11 11M11 1L1 11"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={login} className="flex flex-col gap-5">
      {/* 이메일 */}
      <div className="relative">
        <input
          id="email"
          type="email"
          name="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="login-input peer w-full h-[52px] pl-4 pr-11 rounded-xl bg-white border border-[#E5E5EA] text-[15px] text-suaza-ink placeholder:text-[#B0B0B5] focus:outline-none focus:border-[#15224A]"
        />
        <label
          htmlFor="email"
          className="absolute left-3 top-0 -translate-y-1/2 z-10 bg-white px-1.5 text-[12px] text-[#8E8E93] transition-colors peer-focus:text-[#15224A]"
        >
          이메일
        </label>
        {email && (
          <button
            type="button"
            onClick={() => setEmail("")}
            aria-label="이메일 지우기"
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#767B8C]"
          >
            <ClearIcon />
          </button>
        )}
      </div>

      {/* 비밀번호 */}
      <div className="relative">
        <input
          id="password"
          type="password"
          name="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="login-input peer w-full h-[52px] pl-4 pr-11 rounded-xl bg-white border border-[#E5E5EA] text-[15px] text-suaza-ink placeholder:text-[#B0B0B5] focus:outline-none focus:border-[#15224A]"
        />
        <label
          htmlFor="password"
          className="absolute left-3 top-0 -translate-y-1/2 z-10 bg-white px-1.5 text-[12px] text-[#8E8E93] transition-colors peer-focus:text-[#15224A]"
        >
          비밀번호
        </label>
        {password && (
          <button
            type="button"
            onClick={() => setPassword("")}
            aria-label="비밀번호 지우기"
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#767B8C]"
          >
            <ClearIcon />
          </button>
        )}
      </div>

      {/* 아이디 저장 / 비밀번호 찾기 */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="relative inline-flex h-4 w-4">
            <input
              type="checkbox"
              name="remember"
              className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-[#E5E5EA] bg-white checked:border-[#15224A] checked:bg-[#15224A]"
            />
            <svg
              aria-hidden
              viewBox="0 0 12 12"
              fill="none"
              className="pointer-events-none absolute inset-0 m-auto h-2.5 w-2.5 text-white opacity-0 peer-checked:opacity-100"
            >
              <path
                d="M2.5 6.5L5 9L9.5 3.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-[14px] text-[#8E8E93]">아이디 저장</span>
        </label>
        <Link
          href="/forgot-password"
          className="text-[14px] text-[#8E8E93] hover:underline"
        >
          비밀번호 찾기
        </Link>
      </div>

      {/* 로그인 버튼 */}
      <button
        type="submit"
        className="mt-1 h-[52px] rounded-xl bg-[#15224A] text-white text-[16px] font-semibold hover:brightness-125 transition"
      >
        로그인
      </button>
    </form>
  );
}
