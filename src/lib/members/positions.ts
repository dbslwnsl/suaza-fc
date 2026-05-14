// 축구 필드 포지션
export const POSITIONS = ["GK", "DF", "MF", "FW"] as const;
export type Position = (typeof POSITIONS)[number];

// 동호회 직책 (enum public.member_title 순서와 일치)
export const MEMBER_TITLES = [
  "president",
  "vice_president",
  "treasurer",
  "auditor",
  "head_coach",
  "coach",
  "player",
] as const;
export type MemberTitle = (typeof MEMBER_TITLES)[number];

export const TITLE_LABEL: Record<MemberTitle, string> = {
  president: "회장",
  vice_president: "부회장",
  treasurer: "총무",
  auditor: "감사",
  head_coach: "감독",
  coach: "코치",
  player: "선수",
};

export const TITLE_BADGE: Record<MemberTitle, string> = {
  president: "bg-purple-100 text-purple-700",
  vice_president: "bg-purple-50 text-purple-600",
  treasurer: "bg-blue-100 text-blue-700",
  auditor: "bg-amber-100 text-amber-700",
  head_coach: "bg-red-100 text-red-700",
  coach: "bg-orange-100 text-orange-700",
  player: "bg-gray-100 text-gray-700",
};

// 시스템 권한 (manager / player) — 화면 표기 거의 안 함, 권한 분기용
export const ROLE_LABEL: Record<string, string> = {
  manager: "매니저",
  player: "회원",
  coach: "회원", // legacy
};

export const ROLE_BADGE: Record<string, string> = {
  manager: "bg-red-100 text-red-700",
  player: "bg-gray-100 text-gray-700",
  coach: "bg-gray-100 text-gray-700",
};
