// 게시글 카테고리 (DB posts.category 값과 일치)
export const POST_CATEGORIES = [
  "notice",
  "free",
  "tactics",
  "qna",
  "suggestion",
] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

export const DEFAULT_CATEGORY: PostCategory = "free";

export const CATEGORY_LABEL: Record<PostCategory, string> = {
  notice: "공지",
  free: "자유게시판",
  tactics: "훈련",
  qna: "질문",
  suggestion: "건의",
};

// 직책자(일반회원이 아닌 사람)만 선택 가능한 카테고리
export const STAFF_ONLY_CATEGORIES: PostCategory[] = ["notice"];

// 일반회원(title=player) 이 아닌 직책자 여부
export function isStaffTitle(title?: string | null): boolean {
  return !!title && title !== "player";
}

// 해당 카테고리를 이 직책이 사용할 수 있는지
export function canUseCategory(
  category: PostCategory,
  title?: string | null,
): boolean {
  if (STAFF_ONLY_CATEGORIES.includes(category)) return isStaffTitle(title);
  return true;
}

// 홈 화면 노출(is_notice) 체크 가능 여부.
// - 매니저(회장·감독 등): 모든 카테고리
// - 감독/코치: '훈련(tactics)' 카테고리 글에 한해 가능
export function canHomeExpose(
  role: string | null | undefined,
  title: string | null | undefined,
  category: PostCategory,
): boolean {
  if (role === "manager") return true;
  return (title === "head_coach" || title === "coach") && category === "tactics";
}

// 목록/상세 뱃지 스타일 (pill)
export const CATEGORY_BADGE: Record<PostCategory, string> = {
  notice: "bg-red-100 text-red-700",
  free: "bg-gray-100 text-gray-700",
  tactics: "bg-blue-100 text-blue-700",
  qna: "bg-violet-100 text-violet-700",
  suggestion: "bg-amber-100 text-amber-700",
};

export function isPostCategory(v: string): v is PostCategory {
  return (POST_CATEGORIES as readonly string[]).includes(v);
}

// 홈에 노출되는 공지(딱지)이면서 카테고리도 공지인 경우,
// 일반 공지 카테고리와 구분되도록 배경색을 다르게.
const NOTICE_HOME_BADGE = "bg-amber-100 text-amber-800";

export function categoryBadgeClass(
  category: PostCategory,
  isNotice = false,
): string {
  if (category === "notice" && isNotice) return NOTICE_HOME_BADGE;
  return CATEGORY_BADGE[category];
}

export function formatPostDate(iso: string): string {
  // timeZone 을 명시하지 않으면 서버 로컬 타임존을 사용하므로
  // Vercel(UTC)과 로컬(KST) 표시가 어긋남. Asia/Seoul 고정.
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}
