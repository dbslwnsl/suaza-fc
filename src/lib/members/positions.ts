export const POSITIONS = ["GK", "DF", "MF", "FW"] as const;
export type Position = (typeof POSITIONS)[number];

export const ROLE_LABEL: Record<string, string> = {
  manager: "감독",
  coach: "코치",
  player: "선수",
};

export const ROLE_BADGE: Record<string, string> = {
  manager: "bg-red-100 text-red-700",
  coach: "bg-blue-100 text-blue-700",
  player: "bg-gray-100 text-gray-700",
};
