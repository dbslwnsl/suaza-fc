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
  /** 시즌 카테고리별 1위(공동 1위 포함) */
  isGoalKing?: boolean;
  isAssistKing?: boolean;
  isCleanSheetKing?: boolean;
  isRefereeKing?: boolean;
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

  // 시즌 1위 수상 뱃지 (공동 1위면 여러 명에게 모두 부여)
  if (input.isGoalKing) {
    awardBadges.push({
      key: "goal-king",
      label: "득점왕",
      className: AWARD_BADGE_CLASS,
    });
  }
  if (input.isAssistKing) {
    awardBadges.push({
      key: "assist-king",
      label: "어시왕",
      className: AWARD_BADGE_CLASS,
    });
  }
  if (input.isCleanSheetKing) {
    awardBadges.push({
      key: "cs-king",
      label: "CS왕",
      className: AWARD_BADGE_CLASS,
    });
  }
  if (input.isRefereeKing) {
    awardBadges.push({
      key: "referee-king",
      label: "심판왕",
      className: AWARD_BADGE_CLASS,
    });
  }

  return { titleBadges, awardBadges };
}
