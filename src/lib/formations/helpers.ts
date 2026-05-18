export const FORMATION_SHAPES = [
  "4-4-2",
  "4-4-1-1",
  "4-3-3",
  "4-3-2-1",
  "4-2-3-1",
  "4-1-4-1",
  "4-1-2-1-2",
  "4-5-1",
  "3-5-2",
  "3-4-3",
  "3-4-1-2",
  "5-3-2",
  "5-4-1",
] as const;

export type FormationShape = (typeof FORMATION_SHAPES)[number];

export type FormationMeta = {
  shape: FormationShape;
  name: string;
};

export const FORMATIONS: FormationMeta[] = [
  { shape: "4-4-2", name: "클래식" },
  { shape: "4-4-1-1", name: "세컨드 스트라이커" },
  { shape: "4-3-3", name: "공격형" },
  { shape: "4-3-2-1", name: "크리스마스 트리" },
  { shape: "4-2-3-1", name: "현대 균형" },
  { shape: "4-1-4-1", name: "단일 수비" },
  { shape: "4-1-2-1-2", name: "다이아몬드 미드" },
  { shape: "4-5-1", name: "수비 미드" },
  { shape: "3-5-2", name: "미드 중심" },
  { shape: "3-4-3", name: "윙백 공격" },
  { shape: "3-4-1-2", name: "다이아몬드 어택" },
  { shape: "5-3-2", name: "수비형" },
  { shape: "5-4-1", name: "강한 수비" },
];

export type SlotRole = "GK" | "DF" | "MF" | "FW";

export type SlotDef = {
  index: number;
  line: number; // 0 = GK
  x: number; // 0~1, 0=좌, 1=우
  y: number; // 0~1, 0=상대골대 쪽(상단), 1=우리골대 쪽(하단)
  role: SlotRole;
};

export type FormationData = {
  player_ids: (string | null)[];
};

export const DEFAULT_QUARTER_IDS = ["1Q", "2Q", "3Q", "4Q"] as const;
export const MAX_QUARTERS = 12;

export type Team = "A" | "B" | "single";

export type SavedQuarter = {
  id: string;
  shape: string;
  player_ids: (string | null)[];
  teamB?: {
    shape: string;
    player_ids: (string | null)[];
  };
};

export type SaveFormationPayload = {
  quarters: SavedQuarter[];
};

const ROLE_BY_LINE_INDEX_FROM_GK = (
  lineIndex: number,
  totalLines: number,
): SlotRole => {
  if (lineIndex === 0) return "GK";
  if (lineIndex === 1) return "DF";
  if (lineIndex === totalLines - 1) return "FW";
  return "MF";
};

// 단일 팀(상대전) — 전체 코트 사용, GK는 필드 안쪽
const Y_GK_BOTTOM = 0.90; // GK (필드 안쪽 골 박스 안)
const Y_FW_BOTTOM = 0.10; // FW (반대편 골 박스 근처, 안쪽)

export function buildSlots(shape: string): SlotDef[] {
  const parts = shape
    .split("-")
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (parts.length === 0) return [];
  // 첫 라인은 GK 1명, 그 다음부터 DF→MF→FW
  const lines = [1, ...parts];
  const totalLines = lines.length;
  const span = Y_GK_BOTTOM - Y_FW_BOTTOM;
  const slots: SlotDef[] = [];
  let index = 0;
  for (let li = 0; li < totalLines; li++) {
    const count = lines[li];
    const y =
      totalLines === 1 ? 0.5 : Y_GK_BOTTOM - (span / (totalLines - 1)) * li;
    const role = ROLE_BY_LINE_INDEX_FROM_GK(li, totalLines);
    for (let pi = 0; pi < count; pi++) {
      const x = count === 1 ? 0.5 : 0.08 + (0.84 / (count - 1)) * pi;
      slots.push({ index, line: li, x, y, role });
      index++;
    }
  }
  return slots;
}

export function emptyFormation(slotCount: number): FormationData {
  return { player_ids: Array(slotCount).fill(null) };
}

/**
 * 자체전 시 팀별로 y 위치를 절반에 매핑한 슬롯 반환.
 * GK는 필드 안쪽 (양 끝 가까이 but 골 박스 안), FW는 중앙선 근처(넘지 않음).
 * - team="single": 기존 buildSlots 그대로
 * - team="A": 상단 절반, GK가 상단(미러)
 * - team="B": 하단 절반, GK가 하단
 */
// 자체전 시 각 팀이 차지하는 y 범위 (GK는 골 박스 안, FW는 중앙선 근처)
const Y_GK_TOP_TEAM_A = 0.12; // A팀 GK (상단 골 박스 안)
const Y_FW_TOP_TEAM_A = 0.45; // A팀 FW (중앙선 약간 위)
const Y_FW_BOTTOM_TEAM_B = 0.55; // B팀 FW (중앙선 약간 아래)
const Y_GK_BOTTOM_TEAM_B = 0.88; // B팀 GK (하단 골 박스 안)

export function buildSlotsForTeam(shape: string, team: Team): SlotDef[] {
  const base = buildSlots(shape);
  if (team === "single") return base;
  const baseSpan = Y_GK_BOTTOM - Y_FW_BOTTOM;
  return base.map((s) => {
    // 원본 y(GK=Y_GK_BOTTOM, FW=Y_FW_BOTTOM)를 0~1로 정규화
    const yNorm = (s.y - Y_FW_BOTTOM) / baseSpan;
    // 0이면 FW 위치, 1이면 GK 위치
    const yTeam =
      team === "A"
        ? Y_FW_TOP_TEAM_A + yNorm * (Y_GK_TOP_TEAM_A - Y_FW_TOP_TEAM_A)
        : Y_FW_BOTTOM_TEAM_B +
          yNorm * (Y_GK_BOTTOM_TEAM_B - Y_FW_BOTTOM_TEAM_B);
    return { ...s, y: yTeam };
  });
}
