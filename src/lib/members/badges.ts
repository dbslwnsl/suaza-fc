import type { MemberTitle } from "./positions";

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

// 직책 → 뱃지 라벨 (현재는 회장만, 추후 부회장 등 확장)
const TITLE_BADGE_LABEL: Partial<Record<MemberTitle, string>> = {
  president: "회장",
};

function titleBadge(title: MemberTitle, label: string): MemberBadge {
  return { key: `title-${title}`, label, className: TITLE_BADGE_CLASS };
}

export type MemberBadgeInput = {
  title?: MemberTitle | null;
  role?: string | null;
};

/**
 * 아바타에 표시할 뱃지를 직책(좌상단)/수상(우하단)으로 나눠 반환.
 * 우선순위 높은 것부터.
 */
export function getMemberBadges(input: MemberBadgeInput): {
  titleBadges: MemberBadge[];
  awardBadges: MemberBadge[];
} {
  const titleBadges: MemberBadge[] = [];
  const awardBadges: MemberBadge[] = [];

  // 직책 뱃지 (title 기반)
  const label = input.title ? TITLE_BADGE_LABEL[input.title] : undefined;
  if (label && input.title) titleBadges.push(titleBadge(input.title, label));

  // ── 우선(임시): 매니저 계정에 회장 + 득점왕 데모 ──
  // TODO: 회장은 title=president 로 일원화, 득점왕은 시즌 최다 득점 산출로 대체
  if (input.role === "manager") {
    if (titleBadges.length === 0) titleBadges.push(titleBadge("president", "회장"));
    awardBadges.push({
      key: "top-scorer",
      label: "득점왕",
      className: AWARD_BADGE_CLASS,
    });
  }

  return { titleBadges, awardBadges };
}
