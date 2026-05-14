// 시즌기록 페이지의 연도 버튼 / 월 드랍박스 박스 사이즈 통일용 토큰.
// 두 곳에서 import 하여 단일 source 로 동일성을 보장.

const TAG_BOX =
  "inline-flex items-center justify-center px-2.5 py-1 rounded text-xs border";

export const TAG_DEFAULT = `${TAG_BOX} border-suaza-border text-suaza-ink bg-white`;

export const TAG_ACTIVE = `${TAG_BOX} border-suaza-button bg-suaza-button text-white`;

export const TAG_HOVER = "hover:bg-gray-50";
