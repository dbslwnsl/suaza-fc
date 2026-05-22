import { TITLE_LABEL, type MemberTitle } from "./positions";

/** 아바타에 표시하는 뱃지 (여러 개 누적 가능) */
export type MemberBadge = {
  key: string;
  label: string;
  /** pill 스타일 (tailwind className) */
  className: string;
};

// 직책 뱃지(좌상단): 네이비 / 수상 뱃지(우하단): 골드
const TITLE_BADGE_CLASS = "bg-blue-900 text-white ring-1 ring-blue-950/30";
const AWARD_BADGE_CLASS =
  "bg-gradient-to-b from-amber-400 to-amber-600 text-white ring-1 ring-amber-700/30";

// 아바타에 직책 뱃지를 표시할 직책 (일반 회원=player 제외)
const TITLE_BADGE_TITLES: MemberTitle[] = [
  "president",
  "vice_president",
  "treasurer",
  "auditor",
  "head_coach",
  "coach",
];

export type MemberBadgeInput = {
  title?: MemberTitle | null;
  role?: string | null;
};

/**
 * 아바타에 표시할 뱃지를 직책(좌상단)/수상(우하단)으로 나눠 반환.
 * 직책 뱃지는 권한(role)이 아니라 직책(title) 기준이다.
 */
export function getMemberBadges(input: MemberBadgeInput): {
  titleBadges: MemberBadge[];
  awardBadges: MemberBadge[];
} {
  const titleBadges: MemberBadge[] = [];
  const awardBadges: MemberBadge[] = [];

  // 직책 뱃지 (title 기반)
  if (input.title && TITLE_BADGE_TITLES.includes(input.title)) {
    titleBadges.push({
      key: `title-${input.title}`,
      label: TITLE_LABEL[input.title],
      className: TITLE_BADGE_CLASS,
    });
  }

  // ── 우선(임시): 회장에게만 득점왕 데모 ──
  // TODO: 시즌 최다 득점 자동 산출로 대체
  if (input.title === "president") {
    awardBadges.push({
      key: "top-scorer",
      label: "득점왕",
      className: AWARD_BADGE_CLASS,
    });
  }

  return { titleBadges, awardBadges };
}
