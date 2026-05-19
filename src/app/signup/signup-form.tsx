"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { checkEmailExists, signup } from "@/lib/auth/actions";
import { isValidEmail, validatePassword } from "@/lib/auth/validation";

export default function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const agreeAll = terms && privacy;

  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailChecking, startEmailCheck] = useTransition();

  const toggleAll = (checked: boolean) => {
    setTerms(checked);
    setPrivacy(checked);
  };

  const handleEmailBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value.trim();
    if (!v || !isValidEmail(v)) {
      setEmailError(null);
      return;
    }
    startEmailCheck(async () => {
      try {
        const exists = await checkEmailExists(v);
        setEmailError(exists ? "이미 가입된 이메일입니다" : null);
      } catch {
        setEmailError(null);
      }
    });
  };

  // 검증 상태
  const pwCheck = validatePassword(password);
  const pwMatch = password.length > 0 && password === passwordConfirm;
  const emailFormatValid = isValidEmail(email);

  const allValid =
    name.trim().length > 0 &&
    emailFormatValid &&
    !emailError &&
    !emailChecking &&
    pwCheck.valid &&
    pwMatch &&
    terms &&
    privacy;

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
          value={name}
          onChange={(e) => setName(e.target.value)}
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
          value={email}
          aria-invalid={!!emailError}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError(null);
          }}
          onBlur={handleEmailBlur}
          className={`w-full px-4 py-3 rounded-lg border text-base text-suaza-ink placeholder:text-suaza-placeholder focus:outline-none ${
            emailError
              ? "border-red-500 focus:border-red-500"
              : "border-suaza-border focus:border-suaza-button"
          }`}
        />
        {emailChecking && (
          <span className="text-xs text-suaza-ink-faint">확인 중...</span>
        )}
        {emailError && !emailChecking && (
          <span className="text-xs text-red-600">{emailError}</span>
        )}
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
          autoComplete="new-password"
          placeholder="8자 이상 입력해주세요"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink placeholder:text-suaza-placeholder focus:outline-none focus:border-suaza-button"
        />
        {password.length > 0 && (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            {pwCheck.rules.map((r) => (
              <li
                key={r.label}
                className={`flex items-center gap-1 ${
                  r.ok ? "text-green-600" : "text-suaza-ink-faint"
                }`}
              >
                <span>{r.ok ? "✓" : "○"}</span>
                <span>{r.label}</span>
              </li>
            ))}
          </ul>
        )}
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-suaza-ink text-base">비밀번호 확인</span>
        <input
          type="password"
          name="passwordConfirm"
          required
          autoComplete="new-password"
          placeholder="비밀번호를 다시 입력해주세요"
          value={passwordConfirm}
          aria-invalid={passwordConfirm.length > 0 && !pwMatch}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          className={`w-full px-4 py-3 rounded-lg border text-base text-suaza-ink placeholder:text-suaza-placeholder focus:outline-none ${
            passwordConfirm.length > 0 && !pwMatch
              ? "border-red-500 focus:border-red-500"
              : "border-suaza-border focus:border-suaza-button"
          }`}
        />
        {passwordConfirm.length > 0 && !pwMatch && (
          <span className="text-xs text-red-600">비밀번호가 일치하지 않습니다</span>
        )}
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
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
            <input
              type="checkbox"
              name="terms"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              className="w-4 h-4 rounded border-suaza-border accent-suaza-button shrink-0"
            />
            <span className="text-suaza-ink text-base truncate">
              <span className="text-suaza-accent font-medium">(필수)</span>{" "}
              이용약관 동의
            </span>
          </label>
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-suaza-ink-muted hover:text-suaza-ink underline shrink-0"
          >
            보기
          </Link>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
            <input
              type="checkbox"
              name="privacy"
              checked={privacy}
              onChange={(e) => setPrivacy(e.target.checked)}
              className="w-4 h-4 rounded border-suaza-border accent-suaza-button shrink-0"
            />
            <span className="text-suaza-ink text-base truncate">
              <span className="text-suaza-accent font-medium">(필수)</span>{" "}
              개인정보 수집·이용 동의
            </span>
          </label>
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-suaza-ink-muted hover:text-suaza-ink underline shrink-0"
          >
            보기
          </Link>
        </div>
      </div>

      <button
        type="submit"
        disabled={!allValid}
        className="h-[52px] rounded-lg bg-suaza-button text-white text-base font-medium hover:opacity-90 transition mt-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        회원가입
      </button>
    </form>
  );
}
