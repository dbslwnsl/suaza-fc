// 컨디션 표시 화살표 (1~5단계).
// 색: 1 빨강 → 5 파랑 / 화살표 각도: 3시(0°) 기준 12시(-90)→6시(+90)
// 양쪽 화면(포메이션 에디터, 팀 편성 결과 카드 등) 공통 사용.

const CONDITION_COLOR = [
  "#EF4444", // 1 빨강
  "#EAB308", // 2 노랑
  "#22C55E", // 3 초록 (기본)
  "#06B6D4", // 4 청록
  "#3B82F6", // 5 파랑
];
const CONDITION_DEG = [-90, -45, 0, 45, 90]; // 12시, 1:30, 3시, 4:30, 6시

export default function ConditionArrow({
  level,
  interactive = false,
  onCycle,
  size = 18,
}: {
  /** 1~5 단계, 또는 null = 미설정("?" 회색 원). */
  level: number | null;
  interactive?: boolean;
  onCycle?: () => void;
  /** 원형 칩의 한 변 길이(px). 기본 18. */
  size?: number;
}) {
  // 미설정 — 회색 원 안에 "?" (다른 단계와 명확히 구분)
  if (level == null) {
    const fontPx = Math.max(9, Math.round(size * 0.6));
    return (
      <span
        className="shrink-0 inline-flex items-center justify-center rounded-full bg-gray-200 text-gray-600 font-bold leading-none"
        style={{ width: size, height: size, fontSize: fontPx }}
        aria-label="컨디션 미설정"
        title="컨디션 미설정"
      >
        ?
      </span>
    );
  }
  const idx = Math.min(5, Math.max(1, level)) - 1;
  const color = CONDITION_COLOR[idx];
  const deg = CONDITION_DEG[idx];
  const svgPx = Math.round(size * (12 / 18));
  const inner = (
    <span
      className="inline-flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: `${color}26`,
      }}
    >
      <svg
        width={svgPx}
        height={svgPx}
        viewBox="0 0 24 24"
        style={{ transform: `rotate(${deg}deg)` }}
      >
        {/* 기본: 오른쪽(3시) 화살표 */}
        <path
          d="M4 12 H17 M12 7 L18 12 L12 17"
          fill="none"
          stroke={color}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
  if (interactive && onCycle) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCycle();
        }}
        aria-label={`내 컨디션 ${level}단계 (눌러서 변경)`}
        title="내 컨디션 변경"
        className="shrink-0 hover:scale-110 active:scale-95 transition"
      >
        {inner}
      </button>
    );
  }
  return (
    <span
      className="shrink-0"
      aria-label={`컨디션 ${level}단계`}
      title={`컨디션 ${level}단계`}
    >
      {inner}
    </span>
  );
}
