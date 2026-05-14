export const FORMATION_SHAPES = [
  "4-4-2",
  "4-3-3",
  "4-2-3-1",
  "3-5-2",
  "3-4-3",
  "5-3-2",
] as const;

export type FormationShape = (typeof FORMATION_SHAPES)[number];

export type SlotDef = {
  index: number;
  line: number; // 0 = GK
  x: number; // 0~1, 0=좌, 1=우
  y: number; // 0~1, 0=상대골대 쪽(상단), 1=우리골대 쪽(하단)
  role: string; // GK / DF / MF / FW
};

export type FormationData = {
  player_ids: (string | null)[];
};

const ROLE_BY_LINE_INDEX_FROM_GK = (
  lineIndex: number,
  totalLines: number,
): string => {
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
