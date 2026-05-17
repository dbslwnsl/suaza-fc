export type PasswordRule = { ok: boolean; label: string };

export type PasswordCheck = {
  valid: boolean;
  rules: PasswordRule[];
};

/**
 * 비밀번호 검증: 8자 이상 + 영문/숫자/특수문자 각 최소 1개.
 * client / server 양쪽에서 동일 규칙 적용.
 */
export function validatePassword(pw: string): PasswordCheck {
  const rules: PasswordRule[] = [
    { ok: pw.length >= 8, label: "8자 이상" },
    { ok: /[a-zA-Z]/.test(pw), label: "영문 포함" },
    { ok: /[0-9]/.test(pw), label: "숫자 포함" },
    { ok: /[^a-zA-Z0-9]/.test(pw), label: "특수문자 포함" },
  ];
  return {
    valid: rules.every((r) => r.ok),
    rules,
  };
}

export function isValidEmail(email: string): boolean {
  const v = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
