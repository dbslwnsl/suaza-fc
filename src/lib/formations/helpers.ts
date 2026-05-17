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

export type SavedQuarter = {
  id: string;
  shape: string;
  player_ids: (string | null)[];
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

export function buildSlots(shape: string): SlotDef[] {
  const parts = shape
    .split("-")
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (parts.length === 0) return [];
  // 첫 라인은 GK 1명, 그 다음부터 DF→MF→FW
  const lines = [1, ...parts];
  const totalLines = lines.length;
  const slots: SlotDef[] = [];
  let index = 0;
  for (let li = 0; li < totalLines; li++) {
    const count = lines[li];
    const y = totalLines === 1 ? 0.5 : 0.93 - (0.85 / (totalLines - 1)) * li;
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
