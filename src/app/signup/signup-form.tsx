"use client";

import { useState } from "react";
import { signup } from "@/lib/auth/actions";

export default function SignupForm() {
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const agreeAll = terms && privacy;

  const toggleAll = (checked: boolean) => {
    setTerms(checked);
    setPrivacy(checked);
  };

  return (
    <form action={signup} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="text-suaza-ink text-base">이름</span>
        <input
          type="text"
          name="name"
          required
          autoComplete="name"
          placeholder="홍길동"
          className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink placeholder:text-suaza-placeholder focus:outline-none focus:border-suaza-button"
        />
      </label>

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
        <span className="text-suaza-ink-muted text-[13px] -mt-1">
          영문, 숫자, 특수문자 조합 8자 이상
        </span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="8자 이상 입력해주세요"
          className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink placeholder:text-suaza-placeholder focus:outline-none focus:border-suaza-button"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-suaza-ink text-base">비밀번호 확인</span>
        <input
          type="password"
          name="passwordConfirm"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="비밀번호를 다시 입력해주세요"
          className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink placeholder:text-suaza-placeholder focus:outline-none focus:border-suaza-button"
        />
      </label>

      <div className="flex flex-col gap-2.5 pt-1">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreeAll}
            onChange={(e) => toggleAll(e.target.checked)}
            className="w-4 h-4 rounded border-suaza-border accent-suaza-button"
          />
          <span className="text-suaza-ink text-base">전체 동의</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="terms"
            required
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="w-4 h-4 rounded border-suaza-border accent-suaza-button"
          />
          <span className="text-suaza-ink text-base">
            <span className="text-suaza-accent font-medium">(필수)</span> 이용약관 동의
          </span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="privacy"
            required
            checked={privacy}
            onChange={(e) => setPrivacy(e.target.checked)}
            className="w-4 h-4 rounded border-suaza-border accent-suaza-button"
          />
          <span className="text-suaza-ink text-base">
            <span className="text-suaza-accent font-medium">(필수)</span> 개인정보 처리방침 동의
          </span>
        </label>
      </div>

      <button
        type="submit"
        className="h-[52px] rounded-lg bg-suaza-button text-white text-base font-medium hover:opacity-90 transition mt-2"
      >
        회원가입
      </button>
    </form>
  );
}
