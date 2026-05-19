"use client";

import { useState } from "react";
import { updatePassword } from "@/lib/auth/actions";
import { validatePassword } from "@/lib/auth/validation";

export default function ResetForm() {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const pwCheck = validatePassword(password);
  const pwMatch = password.length > 0 && password === passwordConfirm;
  const allValid = pwCheck.valid && pwMatch;

  return (
    <form action={updatePassword} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="text-suaza-ink text-base">새 비밀번호</span>
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
          <span className="text-xs text-red-600">
            비밀번호가 일치하지 않습니다
          </span>
        )}
      </label>

      <button
        type="submit"
        disabled={!allValid}
        className="h-[52px] rounded-lg bg-suaza-button text-white text-base font-medium hover:opacity-90 transition mt-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        비밀번호 변경
      </button>
    </form>
  );
}
