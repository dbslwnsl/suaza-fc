"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { checkEmailExists, signup } from "@/lib/auth/actions";
import { isValidEmail, validatePassword } from "@/lib/auth/validation";
import {
  FOOT_LABEL,
  POSITIONS,
  POSITION_COLOR,
  POSITION_LABEL,
  PREFERRED_FEET,
} from "@/lib/members/positions";
import DatePicker from "../matches/new/date-picker";
import Dropdown from "@/components/dot-dropdown";

export default function SignupForm() {
  // 1=계정 정보, 2=프로필 입력. "다음"은 화면 전환만(계정 생성 X),
  // 2단계의 "가입 완료"에서만 폼을 제출해 계정+프로필을 함께 생성한다.
  const [step, setStep] = useState<1 | 2>(1);

  // 1단계
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const agreeAll = terms && privacy;

  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailChecking, startEmailCheck] = useTransition();

  // 2단계 (프로필)
  const [jersey, setJersey] = useState("");
  const [birth, setBirth] = useState("");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [foot, setFoot] = useState("");
  const [nickname, setNickname] = useState("");

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

  // 검증
  const pwCheck = validatePassword(password);
  const pwMatch = password.length > 0 && password === passwordConfirm;
  const emailFormatValid = isValidEmail(email);

  const step1Valid =
    name.trim().length > 0 &&
    emailFormatValid &&
    !emailError &&
    !emailChecking &&
    pwCheck.valid &&
    pwMatch &&
    terms &&
    privacy;

  const step2Valid =
    jersey.trim().length > 0 &&
    birth.trim().length > 0 &&
    primary.length > 0 &&
    foot.length > 0;

  const inputBase =
    "peer w-full h-[52px] px-4 rounded-xl bg-white border text-[15px] text-suaza-ink placeholder:text-[#B0B0B5] focus:outline-none";
  const labelBase =
    "absolute left-3 top-0 -translate-y-1/2 z-10 bg-white px-1.5 text-[12px] text-[#8E8E93] transition-colors peer-focus:text-[#15224A]";
  const fieldLabel = "text-[13px] font-medium text-suaza-ink-muted";

  return (
    <form action={signup} className="flex flex-col gap-5">
      {/* ─────────── 1단계: 계정 정보 ─────────── */}
      <div className={step === 1 ? "flex flex-col gap-5" : "hidden"}>
        {/* 이름 */}
        <div className="relative">
          <input
            id="name"
            type="text"
            name="name"
            autoComplete="name"
            placeholder="홍길동"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputBase} border-[#E5E5EA] focus:border-[#15224A]`}
          />
          <label htmlFor="name" className={labelBase}>
            이름
          </label>
        </div>

        {/* 이메일 */}
        <div>
          <div className="relative">
            <input
              id="email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="your@email.com"
              value={email}
              aria-invalid={!!emailError}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              onBlur={handleEmailBlur}
              className={`${inputBase} ${
                emailError
                  ? "border-red-500 focus:border-red-500"
                  : "border-[#E5E5EA] focus:border-[#15224A]"
              }`}
            />
            <label htmlFor="email" className={labelBase}>
              이메일
            </label>
          </div>
          {emailChecking && (
            <span className="mt-1.5 block text-xs text-suaza-ink-faint">
              확인 중...
            </span>
          )}
          {emailError && !emailChecking && (
            <span className="mt-1.5 block text-xs text-red-600">
              {emailError}
            </span>
          )}
        </div>

        {/* 비밀번호 */}
        <div>
          <div className="relative">
            <input
              id="password"
              type="password"
              name="password"
              autoComplete="new-password"
              placeholder="8자 이상 입력해주세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputBase} border-[#E5E5EA] focus:border-[#15224A]`}
            />
            <label htmlFor="password" className={labelBase}>
              비밀번호
            </label>
          </div>
          {password.length > 0 ? (
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
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
          ) : (
            <span className="mt-2.5 block px-1 text-[11px] font-medium text-suaza-accent">
              영문, 숫자, 특수문자 조합 8자 이상
            </span>
          )}
        </div>

        {/* 비밀번호 확인 */}
        <div>
          <div className="relative">
            <input
              id="passwordConfirm"
              type="password"
              name="passwordConfirm"
              autoComplete="new-password"
              placeholder="비밀번호를 다시 입력해주세요"
              value={passwordConfirm}
              aria-invalid={passwordConfirm.length > 0 && !pwMatch}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className={`${inputBase} ${
                passwordConfirm.length > 0 && !pwMatch
                  ? "border-red-500 focus:border-red-500"
                  : "border-[#E5E5EA] focus:border-[#15224A]"
              }`}
            />
            <label htmlFor="passwordConfirm" className={labelBase}>
              비밀번호 확인
            </label>
          </div>
          {passwordConfirm.length > 0 && !pwMatch && (
            <span className="mt-1.5 block text-xs text-red-600">
              비밀번호가 일치하지 않습니다
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2.5 pt-1">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreeAll}
              onChange={(e) => toggleAll(e.target.checked)}
              className="w-4 h-4 rounded border-suaza-border accent-suaza-button"
            />
            <span className="text-suaza-ink text-sm">전체 동의</span>
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
              <span className="text-suaza-ink text-sm truncate">
                <span className="text-suaza-accent font-medium">(필수)</span>{" "}
                이용약관 동의
              </span>
            </label>
            <Link
              href="/terms"
              target="_blank"
              rel="noreferrer"
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
              <span className="text-suaza-ink text-sm truncate">
                <span className="text-suaza-accent font-medium">(필수)</span>{" "}
                개인정보 수집·이용 동의
              </span>
            </label>
            <Link
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-suaza-ink-muted hover:text-suaza-ink underline shrink-0"
            >
              보기
            </Link>
          </div>
        </div>

        <button
          type="button"
          disabled={!step1Valid}
          onClick={() => setStep(2)}
          className="h-[52px] rounded-xl bg-[#15224A] text-white text-[16px] font-semibold hover:brightness-125 transition mt-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
        >
          다음
        </button>
      </div>

      {/* ─────────── 2단계: 프로필 입력 ─────────── */}
      <div className={step === 2 ? "flex flex-col gap-5" : "hidden"}>
        {/* 생년월일 */}
        <div className="flex flex-col gap-1.5">
          <label className={fieldLabel}>
            생년월일 <span className="text-suaza-accent">*</span>
          </label>
          <DatePicker
            value={birth}
            onChange={setBirth}
            placeholder="생년월일 선택"
            defaultView="2000-01-01"
            rounded="rounded-xl"
            textSize="text-[15px]"
            padding="px-4 py-3.5"
          />
          <input type="hidden" name="birth_date" value={birth} />
        </div>

        {/* 등번호 */}
        <div className="flex flex-col gap-1.5">
          <label className={fieldLabel}>
            등번호 <span className="text-suaza-accent">*</span>
          </label>
          <Dropdown
            value={jersey || null}
            onChange={(v) => setJersey(v ?? "")}
            placeholder="선택"
            textSize="text-[15px]"
            padding="px-4 py-3.5"
            options={Array.from({ length: 100 }, (_, i) => ({
              value: String(i),
              label: String(i),
            }))}
          />
          <input type="hidden" name="jersey_number" value={jersey} />
        </div>

        {/* 포지션 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabel}>
              주포지션 <span className="text-suaza-accent">*</span>
            </label>
            <Dropdown
              value={primary || null}
              onChange={(v) => {
                const next = v ?? "";
                setPrimary(next);
                if (next && next === secondary) setSecondary("");
              }}
              placeholder="선택"
              textSize="text-[15px]"
              padding="px-4 py-3.5"
              options={POSITIONS.map((p) => ({
                value: p,
                label: `${p} · ${POSITION_LABEL[p]}`,
                color: POSITION_COLOR[p],
              }))}
            />
            <input type="hidden" name="positions" value={primary} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabel}>부포지션</label>
            <Dropdown
              value={secondary || null}
              onChange={(v) => setSecondary(v ?? "")}
              placeholder="없음"
              allowClear
              clearLabel="없음"
              textSize="text-[15px]"
              padding="px-4 py-3.5"
              options={POSITIONS.filter((p) => p !== primary).map((p) => ({
                value: p,
                label: `${p} · ${POSITION_LABEL[p]}`,
                color: POSITION_COLOR[p],
              }))}
            />
            <input type="hidden" name="positions" value={secondary} />
          </div>
        </div>

        {/* 주발 */}
        <div className="flex flex-col gap-1.5">
          <label className={fieldLabel}>
            주발 <span className="text-suaza-accent">*</span>
          </label>
          <Dropdown
            value={foot || null}
            onChange={(v) => setFoot(v ?? "")}
            placeholder="선택"
            textSize="text-[15px]"
            padding="px-4 py-3.5"
            options={PREFERRED_FEET.map((f) => ({
              value: f,
              label: FOOT_LABEL[f],
            }))}
          />
          <input type="hidden" name="preferred_foot" value={foot} />
        </div>

        {/* 별명 (선택) */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="nickname" className={fieldLabel}>
            별명 <span className="text-suaza-ink-faint">(선택)</span>
          </label>
          <input
            id="nickname"
            type="text"
            name="nickname"
            maxLength={6}
            placeholder="최대 6자"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className={`${inputBase} border-[#E5E5EA] focus:border-[#15224A]`}
          />
        </div>

        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="h-[52px] px-5 rounded-xl border border-[#E5E5EA] text-suaza-ink text-[16px] font-semibold hover:bg-gray-50 transition"
          >
            이전
          </button>
          <button
            type="submit"
            disabled={!step2Valid}
            className="flex-1 h-[52px] rounded-xl bg-[#15224A] text-white text-[16px] font-semibold hover:brightness-125 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
          >
            가입 완료
          </button>
        </div>
      </div>
    </form>
  );
}
