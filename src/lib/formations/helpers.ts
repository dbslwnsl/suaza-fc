export const FORMATION_SHAPES = [
  "4-4-2",
  "4-4-1-1",
  "4-3-3",
  "4-3-2-1",
  "4-2-3-1",
  "4-1-4-1",
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
  { shape: "4-2-3-1", name: "현대 균형" },
  { shape: "4-1-4-1", name: "단일 수비" },
  { shape: "4-4-2", name: "클래식" },
  { shape: "4-4-1-1", name: "세컨드 스트라이커" },
  { shape: "4-3-3", name: "공격형" },
  { shape: "4-3-2-1", name: "크리스마스 트리" },
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
  role: SlotRole; // 색/자동배치 매칭용 대분류
  label?: string; // 화면 표기용 세부 포지션 (없으면 role 표기)
};

// 세부 포지션 → 대분류(role) 매핑
//  GK
//  DF: CB,LCB,RCB,LB,RB,LWB,RWB
//  MF: CDM,CM,AM,LM,RM,LCM,RCM,LDM,RDM,LAM,RAM (수비/중앙/측면/공격형 미드)
//  FW: ST,LW,RW
export function detailToRole(detail: string): SlotRole {
  if (detail === "GK") return "GK";
  if (["CB", "LCB", "RCB", "LB", "RB", "LWB", "RWB"].includes(detail))
    return "DF";
  if (
    [
      "CDM", "CM", "AM", "LM", "RM", "LCM", "RCM",
      "LDM", "RDM", "LAM", "RAM",
    ].includes(detail)
  )
    return "MF";
  return "FW"; // ST, LW, RW
}

export type FormationData = {
  player_ids: (string | null)[];
};

export const DEFAULT_QUARTER_IDS = ["1Q", "2Q", "3Q", "4Q"] as const;
export const MAX_QUARTERS = 6;

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

// 특정 포메이션의 슬롯별 (x, y) 커스텀 좌표.
// 슬롯 순서는 buildSlotsAuto 와 동일: GK → DF → MF... → FW.
// 정의된 shape 는 자동 계산 대신 이 좌표를 사용한다.
const CUSTOM_SLOT_LAYOUT: Record<
  string,
  { x: number; y: number; label: string }[]
> = {
  // 4-2-3-1: CDM 2명 중앙, 공격형 3명 넓게. 세부 포지션 라벨 적용.
  "4-2-3-1": [
    { x: 0.5, y: 0.95, label: "GK" },
    { x: 0.12, y: 0.8, label: "RB" },
    { x: 0.38, y: 0.8, label: "RCB" },
    { x: 0.62, y: 0.8, label: "LCB" },
    { x: 0.88, y: 0.8, label: "LB" },
    { x: 0.35, y: 0.60, label: "CDM" },
    { x: 0.65, y: 0.60, label: "CDM" },
    { x: 0.12, y: 0.35, label: "RW" },
    { x: 0.5, y: 0.35, label: "AM" },
    { x: 0.88, y: 0.35, label: "LW" },
    { x: 0.5, y: 0.17, label: "ST" },
  ],
  // 4-1-4-1: DF4 / CDM1 / MF4 / ST1 (이미지 기준, 좌측 L → 우측 R)
  "4-1-4-1": [
    { x: 0.5, y: 0.95, label: "GK" },
    { x: 0.12, y: 0.8, label: "LB" },
    { x: 0.37, y: 0.8, label: "LCB" },
    { x: 0.63, y: 0.8, label: "RCB" },
    { x: 0.88, y: 0.8, label: "RB" },
    { x: 0.5, y: 0.65, label: "CDM" },
    { x: 0.12, y: 0.38, label: "LM" },
    { x: 0.37, y: 0.40, label: "LCM" },
    { x: 0.63, y: 0.40, label: "RCM" },
    { x: 0.88, y: 0.38, label: "RM" },
    { x: 0.5, y: 0.17, label: "ST" },
  ],
  // 4-4-2: DF4 / MF4(측면 LM·RM 앞, 중앙 LCM·RCM 뒤) / ST2 (좌측 R → 우측 L)
  "4-4-2": [
    { x: 0.5, y: 0.95, label: "GK" },
    { x: 0.12, y: 0.8, label: "RB" },
    { x: 0.38, y: 0.8, label: "RCB" },
    { x: 0.62, y: 0.8, label: "LCB" },
    { x: 0.88, y: 0.8, label: "LB" },
    { x: 0.12, y: 0.5, label: "RM" },
    { x: 0.38, y: 0.58, label: "RCM" },
    { x: 0.62, y: 0.58, label: "LCM" },
    { x: 0.88, y: 0.5, label: "LM" },
    { x: 0.37, y: 0.25, label: "ST" },
    { x: 0.63, y: 0.25, label: "ST" },
  ],
  // 4-4-1-1: DF4 / MF4(측면 앞, 중앙 뒤) / AM1 / ST1 (좌측 R → 우측 L)
  "4-4-1-1": [
    { x: 0.5, y: 0.95, label: "GK" },
    { x: 0.12, y: 0.8, label: "RB" },
    { x: 0.38, y: 0.8, label: "RCB" },
    { x: 0.62, y: 0.8, label: "LCB" },
    { x: 0.88, y: 0.8, label: "LB" },
    { x: 0.12, y: 0.55, label: "RM" },
    { x: 0.38, y: 0.55, label: "RCM" },
    { x: 0.62, y: 0.55, label: "LCM" },
    { x: 0.88, y: 0.55, label: "LM" },
    { x: 0.5, y: 0.38, label: "AM" },
    { x: 0.5, y: 0.18, label: "ST" },
  ],
  // 4-3-3: DF4 / MF3(RM·CM·LM) / FW3(RW·ST·LW) (좌측 R → 우측 L)
  "4-3-3": [
    { x: 0.5, y: 0.95, label: "GK" },
    { x: 0.12, y: 0.8, label: "RB" },
    { x: 0.38, y: 0.8, label: "RCB" },
    { x: 0.62, y: 0.8, label: "LCB" },
    { x: 0.88, y: 0.8, label: "LB" },
    { x: 0.25, y: 0.55, label: "RM" },
    { x: 0.5, y: 0.55, label: "CM" },
    { x: 0.75, y: 0.55, label: "LM" },
    { x: 0.12, y: 0.25, label: "RW" },
    { x: 0.5, y: 0.22, label: "ST" },
    { x: 0.88, y: 0.25, label: "LW" },
  ],
  // 4-3-2-1 (크리스마스 트리): DF4 / MF3(LDM·CM·RDM) / AM2(LAM·RAM) / ST1 (좌측 L)
  "4-3-2-1": [
    { x: 0.5, y: 0.95, label: "GK" },
    { x: 0.12, y: 0.8, label: "LB" },
    { x: 0.38, y: 0.8, label: "LCB" },
    { x: 0.62, y: 0.8, label: "RCB" },
    { x: 0.88, y: 0.8, label: "RB" },
    { x: 0.25, y: 0.6, label: "LDM" },
    { x: 0.5, y: 0.6, label: "CM" },
    { x: 0.75, y: 0.6, label: "RDM" },
    { x: 0.38, y: 0.4, label: "LAM" },
    { x: 0.62, y: 0.4, label: "RAM" },
    { x: 0.5, y: 0.18, label: "ST" },
  ],
  // 4-5-1: DF4 / MF5(측면 RM·LM 앞, 중앙 CM 3 뒤) / ST1 (좌측 R)
  "4-5-1": [
    { x: 0.5, y: 0.95, label: "GK" },
    { x: 0.12, y: 0.8, label: "RB" },
    { x: 0.38, y: 0.8, label: "RCB" },
    { x: 0.62, y: 0.8, label: "LCB" },
    { x: 0.88, y: 0.8, label: "LB" },
    { x: 0.12, y: 0.40, label: "RM" },
    { x: 0.27, y: 0.55, label: "CM" },
    { x: 0.5, y: 0.58, label: "CM" },
    { x: 0.73, y: 0.55, label: "CM" },
    { x: 0.88, y: 0.40, label: "LM" },
    { x: 0.5, y: 0.2, label: "ST" },
  ],
  // 3-5-2: DF3(LCB·CB·RCB) / MF5(윙백 LWB·RWB + CM·CM + AM) / ST2 (좌측 L)
  "3-5-2": [
    { x: 0.5, y: 0.95, label: "GK" },
    { x: 0.28, y: 0.8, label: "LCB" },
    { x: 0.5, y: 0.8, label: "CB" },
    { x: 0.72, y: 0.8, label: "RCB" },
    { x: 0.1, y: 0.65, label: "LWB" },
    { x: 0.32, y: 0.55, label: "CM" },
    { x: 0.5, y: 0.36, label: "AM" },
    { x: 0.68, y: 0.55, label: "CM" },
    { x: 0.9, y: 0.65, label: "RWB" },
    { x: 0.37, y: 0.2, label: "ST" },
    { x: 0.63, y: 0.2, label: "ST" },
  ],
  // 3-4-1-2: DF3 / MF4(측면 RM·LM 앞, 중앙 CM 뒤) / AM1 / ST2 (이미지 기준)
  "3-4-1-2": [
    { x: 0.5, y: 0.95, label: "GK" },
    { x: 0.28, y: 0.8, label: "LCB" },
    { x: 0.5, y: 0.8, label: "CB" },
    { x: 0.72, y: 0.8, label: "RCB" },
    { x: 0.12, y: 0.55, label: "RM" },
    { x: 0.37, y: 0.62, label: "CM" },
    { x: 0.63, y: 0.62, label: "CM" },
    { x: 0.88, y: 0.55, label: "LM" },
    { x: 0.5, y: 0.42, label: "AM" },
    { x: 0.37, y: 0.2, label: "ST" },
    { x: 0.63, y: 0.2, label: "ST" },
  ],
  // 3-4-3: DF3 / MF4(측면 LM·RM 앞, 중앙 LCM·RCM 뒤) / FW3(LW·ST·RW) (좌측 L)
  "3-4-3": [
    { x: 0.5, y: 0.95, label: "GK" },
    { x: 0.22, y: 0.8, label: "LCB" },
    { x: 0.5, y: 0.8, label: "CB" },
    { x: 0.78, y: 0.8, label: "RCB" },
    { x: 0.12, y: 0.52, label: "LM" },
    { x: 0.37, y: 0.58, label: "LCM" },
    { x: 0.63, y: 0.58, label: "RCM" },
    { x: 0.88, y: 0.52, label: "RM" },
    { x: 0.12, y: 0.22, label: "LW" },
    { x: 0.5, y: 0.22, label: "ST" },
    { x: 0.88, y: 0.22, label: "RW" },
  ],
  // 5-3-2: DF5(윙백 RWB·LWB 앞, 센터백 3 뒤) / MF3 / ST2 (좌측 R)
  "5-3-2": [
    { x: 0.5, y: 0.95, label: "GK" },
    { x: 0.1, y: 0.72, label: "RWB" },
    { x: 0.28, y: 0.8, label: "RCB" },
    { x: 0.5, y: 0.8, label: "CB" },
    { x: 0.72, y: 0.8, label: "LCB" },
    { x: 0.9, y: 0.72, label: "LWB" },
    { x: 0.3, y: 0.52, label: "RCM" },
    { x: 0.5, y: 0.52, label: "CM" },
    { x: 0.7, y: 0.52, label: "LCM" },
    { x: 0.37, y: 0.2, label: "ST" },
    { x: 0.63, y: 0.2, label: "ST" },
  ],
  // 5-4-1: DF5(윙백 앞, 센터백 3 뒤) / MF4(측면 LW·RW 앞, 중앙 LCM·RCM 뒤) / ST1 (좌측 L)
  "5-4-1": [
    { x: 0.5, y: 0.95, label: "GK" },
    { x: 0.12, y: 0.72, label: "LWB" },
    { x: 0.28, y: 0.8, label: "LCB" },
    { x: 0.5, y: 0.8, label: "CB" },
    { x: 0.72, y: 0.8, label: "RCB" },
    { x: 0.88, y: 0.72, label: "RWB" },
    { x: 0.12, y: 0.40, label: "LW" },
    { x: 0.37, y: 0.50, label: "LCM" },
    { x: 0.63, y: 0.50, label: "RCM" },
    { x: 0.88, y: 0.40, label: "RW" },
    { x: 0.5, y: 0.2, label: "ST" },
  ],
};

function buildSlotsAuto(shape: string): SlotDef[] {
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

export function buildSlots(shape: string): SlotDef[] {
  const slots = buildSlotsAuto(shape);
  const custom = CUSTOM_SLOT_LAYOUT[shape];
  if (custom && custom.length === slots.length) {
    // 좌표 + 세부 라벨 적용, 색/자동배치용 role 은 라벨 기준으로 재계산
    return slots.map((s, i) => ({
      ...s,
      x: custom[i].x,
      y: custom[i].y,
      label: custom[i].label,
      role: detailToRole(custom[i].label),
    }));
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
// 자체전 시 각 팀이 차지하는 y 범위
const Y_GK_TOP_TEAM_A = 0.08; // A팀 GK (상단 골 박스 안, 절대 위치)
const Y_DEF_TOP_TEAM_A = 0.17; // A팀 최후방 수비 (GK 바로 앞)
const Y_FW_TOP_TEAM_A = 0.45; // A팀 FW (중앙선 약간 위)
const Y_FW_BOTTOM_TEAM_B = 0.55; // B팀 FW (중앙선 약간 아래)
const Y_DEF_BOTTOM_TEAM_B = 0.83; // B팀 최후방 수비 (GK 바로 앞)
const Y_GK_BOTTOM_TEAM_B = 0.93; // B팀 GK (하단 골 박스 안, 절대 위치)

// 자체전에서 슬롯의 x 좌표를 기준으로 L/R 접두 라벨을 팀별로 맞춤.
//   A팀(위, 아래로 공격): 화면 왼쪽 = 선수의 오른쪽 → x < 0.5 = R, x ≥ 0.5 = L
//   B팀(아래, 위로 공격): 화면 왼쪽 = 선수의 왼쪽 → x < 0.5 = L, x ≥ 0.5 = R
// 베이스 포메이션 정의가 R-시작·L-시작 등 컨벤션이 섞여 있어 단순 swap 으론 부족.
// 좌표 기반으로 결정하면 모든 포메이션에서 일관됨.
function correctLabelForTeam(
  label: string | undefined,
  x: number,
  team: "A" | "B",
): string | undefined {
  if (!label) return label;
  const first = label[0];
  if (first !== "L" && first !== "R") return label;
  const expected: "L" | "R" =
    team === "A" ? (x < 0.5 ? "R" : "L") : x < 0.5 ? "L" : "R";
  if (first === expected) return label;
  return expected + label.slice(1);
}

// 자체전(전체뷰) 전용 좌표 — 각 팀 영역이 거의 "정사각형" 비율이라 단독(직사각형)뷰와
// 다른 배치가 필요하다. 기준은 B팀(하단, 위로 공격) 관점:
//   x: 0(좌)~1(우),  y: 0.5(중앙선)~0.95(자기 골문). GK 는 맨 아래.
// A팀은 이 좌표를 상하 미러(y → 1 - y)해서 상단에 자동 배치한다.
// 슬롯 순서는 buildSlots 와 동일(GK → DF → MF... → FW). label 은 base 것을 쓰고
// x 위치로 L/R 만 자동 보정한다.
// 여기 없는 포메이션은 단독뷰 좌표를 자동 정규화(아래 fallback)한다 — shape 를 추가해 직접 조정 가능.
const INTRA_SLOT_LAYOUT: Record<string, { x: number; y: number }[]> = {
  // 4-2-3-1 (GK / DF4 / CDM2 / RW·AM·LW / ST) — 적당히 배치. 자유롭게 조정하세요.
  "4-2-3-1": [
    { x: 0.5, y: 0.92 }, // GK
    { x: 0.12, y: 0.82 }, // DF
    { x: 0.38, y: 0.82 },
    { x: 0.62, y: 0.82 },
    { x: 0.88, y: 0.82 },
    { x: 0.35, y: 0.72 }, // CDM
    { x: 0.65, y: 0.72 },
    { x: 0.15, y: 0.62 }, // RW
    { x: 0.5, y: 0.65 }, // AM
    { x: 0.85, y: 0.62 }, // LW
    { x: 0.5, y: 0.55 }, // ST
  ],
  // 아래는 단독뷰(CUSTOM_SLOT_LAYOUT) y 를 하단 밴드(약 0.52~0.92)로 압축한 값.
  // (x 그대로, y ≈ 0.513·단독y + 0.433) 포메이션별로 자유롭게 조정하세요.
  // 4-1-4-1 (GK / DF4 / CDM1 / MF4 / ST1)
  "4-1-4-1": [
    { x: 0.5, y: 0.92 },
    { x: 0.12, y: 0.84 },
    { x: 0.37, y: 0.84 },
    { x: 0.63, y: 0.84 },
    { x: 0.88, y: 0.84 },
    { x: 0.5, y: 0.77 },
    { x: 0.12, y: 0.63 },
    { x: 0.37, y: 0.64 },
    { x: 0.63, y: 0.64 },
    { x: 0.88, y: 0.63 },
    { x: 0.5, y: 0.52 },
  ],
  // 4-4-2 (GK / DF4 / MF4 / ST2)
  "4-4-2": [
    { x: 0.5, y: 0.92 },
    { x: 0.12, y: 0.84 },
    { x: 0.38, y: 0.84 },
    { x: 0.62, y: 0.84 },
    { x: 0.88, y: 0.84 },
    { x: 0.12, y: 0.69 },
    { x: 0.38, y: 0.73 },
    { x: 0.62, y: 0.73 },
    { x: 0.88, y: 0.69 },
    { x: 0.37, y: 0.56 },
    { x: 0.63, y: 0.56 },
  ],
  // 4-4-1-1 (GK / DF4 / MF4 / AM1 / ST1)
  "4-4-1-1": [
    { x: 0.5, y: 0.92 },
    { x: 0.12, y: 0.84 },
    { x: 0.38, y: 0.84 },
    { x: 0.62, y: 0.84 },
    { x: 0.88, y: 0.84 },
    { x: 0.12, y: 0.72 },
    { x: 0.38, y: 0.72 },
    { x: 0.62, y: 0.72 },
    { x: 0.88, y: 0.72 },
    { x: 0.5, y: 0.63 },
    { x: 0.5, y: 0.53 },
  ],
  // 4-3-3 (GK / DF4 / MF3 / FW3)
  "4-3-3": [
    { x: 0.5, y: 0.92 },
    { x: 0.12, y: 0.84 },
    { x: 0.38, y: 0.84 },
    { x: 0.62, y: 0.84 },
    { x: 0.88, y: 0.84 },
    { x: 0.25, y: 0.72 },
    { x: 0.5, y: 0.72 },
    { x: 0.75, y: 0.72 },
    { x: 0.12, y: 0.56 },
    { x: 0.5, y: 0.55 },
    { x: 0.88, y: 0.56 },
  ],
  // 4-3-2-1 (GK / DF4 / MF3 / AM2 / ST1)
  "4-3-2-1": [
    { x: 0.5, y: 0.92 },
    { x: 0.12, y: 0.84 },
    { x: 0.38, y: 0.84 },
    { x: 0.62, y: 0.84 },
    { x: 0.88, y: 0.84 },
    { x: 0.25, y: 0.74 },
    { x: 0.5, y: 0.74 },
    { x: 0.75, y: 0.74 },
    { x: 0.38, y: 0.64 },
    { x: 0.62, y: 0.64 },
    { x: 0.5, y: 0.53 },
  ],
  // 4-5-1 (GK / DF4 / MF5 / ST1)
  "4-5-1": [
    { x: 0.5, y: 0.92 },
    { x: 0.12, y: 0.84 },
    { x: 0.38, y: 0.84 },
    { x: 0.62, y: 0.84 },
    { x: 0.88, y: 0.84 },
    { x: 0.12, y: 0.64 },
    { x: 0.31, y: 0.69 },
    { x: 0.5, y: 0.69 },
    { x: 0.69, y: 0.69 },
    { x: 0.88, y: 0.64 },
    { x: 0.5, y: 0.54 },
  ],
  // 3-5-2 (GK / DF3 / MF5 / ST2)
  "3-5-2": [
    { x: 0.5, y: 0.92 },
    { x: 0.28, y: 0.82 },
    { x: 0.5, y: 0.82 },
    { x: 0.72, y: 0.82 },
    { x: 0.1, y: 0.77 },
    { x: 0.32, y: 0.70 },
    { x: 0.5, y: 0.62 },
    { x: 0.68, y: 0.70 },
    { x: 0.9, y: 0.77 },
    { x: 0.37, y: 0.55 },
    { x: 0.63, y: 0.55 },
  ],
  // 3-4-1-2 (GK / DF3 / MF4 / AM1 / ST2)
  "3-4-1-2": [
    { x: 0.5, y: 0.92 },
    { x: 0.28, y: 0.82 },
    { x: 0.5, y: 0.82 },
    { x: 0.72, y: 0.82 },
    { x: 0.12, y: 0.72 },
    { x: 0.37, y: 0.75 },
    { x: 0.63, y: 0.75 },
    { x: 0.88, y: 0.72 },
    { x: 0.5, y: 0.65 },
    { x: 0.37, y: 0.55 },
    { x: 0.63, y: 0.55 },
  ],
  // 3-4-3 (GK / DF3 / MF4 / FW3)
  "3-4-3": [
    { x: 0.5, y: 0.92 },
    { x: 0.22, y: 0.82 },
    { x: 0.5, y: 0.82 },
    { x: 0.78, y: 0.82 },
    { x: 0.12, y: 0.7 },
    { x: 0.37, y: 0.73 },
    { x: 0.63, y: 0.73 },
    { x: 0.88, y: 0.7 },
    { x: 0.12, y: 0.55 },
    { x: 0.5, y: 0.55 },
    { x: 0.88, y: 0.55 },
  ],
  // 5-3-2 (GK / DF5 / MF3 / ST2)
  "5-3-2": [
    { x: 0.5, y: 0.92 },
    { x: 0.1, y: 0.8 },
    { x: 0.28, y: 0.82 },
    { x: 0.5, y: 0.82 },
    { x: 0.72, y: 0.82 },
    { x: 0.9, y: 0.8 },
    { x: 0.3, y: 0.7 },
    { x: 0.5, y: 0.7 },
    { x: 0.7, y: 0.7 },
    { x: 0.37, y: 0.55 },
    { x: 0.63, y: 0.55 },
  ],
  // 5-4-1 (GK / DF5 / MF4 / ST1)
  "5-4-1": [
    { x: 0.5, y: 0.92 },
    { x: 0.12, y: 0.8 },
    { x: 0.28, y: 0.82 },
    { x: 0.5, y: 0.82 },
    { x: 0.72, y: 0.82 },
    { x: 0.88, y: 0.8 },
    { x: 0.12, y: 0.64 },
    { x: 0.37, y: 0.69 },
    { x: 0.63, y: 0.69 },
    { x: 0.88, y: 0.64 },
    { x: 0.5, y: 0.55 },
  ],
};

export function buildSlotsForTeam(shape: string, team: Team): SlotDef[] {
  const base = buildSlots(shape);
  if (team === "single") {
    // 상대전(single)은 자체전 B팀과 동일한 방향(아래에서 위로 공격)이므로
    // 라벨 좌/우도 B팀 규칙(x<0.5 → L, x≥0.5 → R)에 맞춰 통일.
    return base.map((s) => ({
      ...s,
      label: correctLabelForTeam(s.label, s.x, "B"),
    }));
  }
  // 자체전 전용 좌표가 정의돼 있으면 각 팀 절반에 배치.
  // A팀은 상대 진영에서 마주보므로 180° 회전 = 상하(y) + 좌우(x) 모두 미러.
  // (가로까지 미러해야 선수의 좌/우가 보존되어 L/R 라벨이 단독뷰와 일치한다.)
  const intra = INTRA_SLOT_LAYOUT[shape];
  if (intra) {
    return base.map((s, i) => {
      const c = intra[i] ?? { x: s.x, y: s.y };
      const x = team === "A" ? 1 - c.x : c.x;
      const y = team === "A" ? 1 - c.y : c.y;
      return { ...s, x, y, label: correctLabelForTeam(s.label, x, team) };
    });
  }
  // (fallback) 자체전 좌표 미정의 — 단독뷰 좌표를 각 팀 절반에 정규화한다.
  // GK 는 좌표 변환에서 제외하고 각 팀 골 박스에 고정 (절대 위치).
  // 그 외 필드 플레이어만 정규화하므로, GK y 를 골대 끝까지 내려도 무방.
  // 정규화 기준 span 은 비-GK 최하단(수비라인)을 GK 위치(1.0)로 본다.
  const fieldYs = base
    .filter((s) => s.role !== "GK")
    .map((s) => s.y);
  const maxFieldY = fieldYs.length ? Math.max(...fieldYs) : Y_GK_BOTTOM;
  const minFieldY = fieldYs.length ? Math.min(...fieldYs) : Y_FW_BOTTOM;
  const span = maxFieldY - minFieldY || 1;
  return base.map((s) => {
    const label = correctLabelForTeam(s.label, s.x, team);
    if (s.role === "GK") {
      return {
        ...s,
        y: team === "A" ? Y_GK_TOP_TEAM_A : Y_GK_BOTTOM_TEAM_B,
        label,
      };
    }
    // 비-GK: 0(최전방 FW) ~ 1(최후방 수비) 정규화. GK 자리는 침범하지 않음.
    const yNorm = (s.y - minFieldY) / span;
    const yTeam =
      team === "A"
        ? Y_FW_TOP_TEAM_A + yNorm * (Y_DEF_TOP_TEAM_A - Y_FW_TOP_TEAM_A)
        : Y_FW_BOTTOM_TEAM_B +
          yNorm * (Y_DEF_BOTTOM_TEAM_B - Y_FW_BOTTOM_TEAM_B);
    return { ...s, y: yTeam, label };
  });
}
