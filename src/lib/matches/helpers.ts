export const MATCH_STATUS = [
  "scheduled",
  "in_progress",
  "done",
  "canceled",
] as const;
export type MatchStatus = (typeof MATCH_STATUS)[number];

export type Match = {
  id: string;
  opponent: string;
  match_date: string;
  location: string | null;
  our_score: number | null;
  opponent_score: number | null;
  status: MatchStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  status_overridden_at: string | null;
  duration_hours: number;
  team_a_color: string | null;
  team_b_color: string | null;
  team_a_name: string | null;
  team_b_name: string | null;
  vote_deadline: string | null;
  total_quarters: number;
};

// 경기 총 쿼터 수 (1Q ~ NQ)
export const DEFAULT_TOTAL_QUARTERS = 4;
export const MIN_TOTAL_QUARTERS = 1;
export const MAX_TOTAL_QUARTERS = 6;

export function getTotalQuarters(m: {
  total_quarters?: number | null;
}): number {
  const v = m.total_quarters;
  if (typeof v !== "number") return DEFAULT_TOTAL_QUARTERS;
  if (v < MIN_TOTAL_QUARTERS) return MIN_TOTAL_QUARTERS;
  if (v > MAX_TOTAL_QUARTERS) return MAX_TOTAL_QUARTERS;
  return v;
}

// 자체전 유니폼 색상 팔레트 (선택지): 주황 · 검정 · 흰색
export const UNIFORM_COLORS = [
  "#F97316", // 주황
  "#1F2937", // 검정
  "#F9FAFB", // 흰색
] as const;

// 자체전 A/B 팀 기본 유니폼 색 (DB 값이 없을 때)
export const DEFAULT_TEAM_COLOR: Record<"A" | "B", string> = {
  A: "#F97316", // 주황
  B: "#1F2937", // 검정
};

// 상대전 기본 유니폼 색 (우리팀 = 주황, 상대팀 = 파랑)
export const DEFAULT_VS_COLOR: Record<"A" | "B", string> = {
  A: "#F97316", // 우리팀 — 주황
  B: "#3B82F6", // 상대팀 — 파랑
};

// 팀 기본 이름 (DB 값이 없을 때)
export const DEFAULT_TEAM_NAME: Record<"A" | "B", string> = {
  A: "A팀",
  B: "B팀",
};

// 매치의 A/B 팀 표시명 (저장된 이름 → "팀" 접미사 자동 부착)
// 비어 있으면 "A팀"/"B팀" 기본값, 이미 "팀" 으로 끝나면 그대로 사용.
export function getTeamName(
  m: { team_a_name?: string | null; team_b_name?: string | null },
  team: "A" | "B",
): string {
  const v = (team === "A" ? m.team_a_name : m.team_b_name) ?? "";
  const t = v.trim();
  if (!t) return DEFAULT_TEAM_NAME[team];
  return t.endsWith("팀") ? t : `${t}팀`;
}

export const DEFAULT_MATCH_DURATION_HOURS = 2;
export const MATCH_DURATION_OPTIONS = [1, 2, 3, 4] as const;
export type MatchDurationHours = (typeof MATCH_DURATION_OPTIONS)[number];

export function getMatchFinishTime(m: {
  match_date: string;
  duration_hours?: number | null;
}): Date {
  const hours = m.duration_hours ?? DEFAULT_MATCH_DURATION_HOURS;
  return new Date(new Date(m.match_date).getTime() + hours * 60 * 60 * 1000);
}

export function isMatchFinished(m: {
  match_date: string;
  duration_hours?: number | null;
}): boolean {
  return Date.now() >= getMatchFinishTime(m).getTime();
}

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  scheduled: "예정",
  in_progress: "진행중",
  done: "종료",
  canceled: "취소",
};

export const MATCH_STATUS_BADGE: Record<MatchStatus, string> = {
  scheduled: "bg-blue-50 text-blue-700",
  in_progress: "bg-amber-50 text-amber-700",
  done: "bg-gray-100 text-gray-700",
  canceled: "bg-red-50 text-red-700",
};

export const MATCH_STATUS_DOT_COLOR: Record<MatchStatus, string> = {
  scheduled: "#3B82F6",
  in_progress: "#F59E0B",
  done: "#22C55E",
  canceled: "#9CA3AF",
};

/**
 * 경기가 "시작됨" 상태인지.
 * - status 가 in_progress/done 이면 시작됨
 * - status 가 scheduled 라도 현재 시각이 match_date 를 지났으면 시작된 것으로 간주
 */
export function isMatchStarted(m: Pick<Match, "status" | "match_date">): boolean {
  if (m.status === "in_progress" || m.status === "done") return true;
  if (m.status === "scheduled" && new Date(m.match_date) <= new Date())
    return true;
  return false;
}

export type Result = "win" | "draw" | "lose";

export const RESULT_LABEL: Record<Result, string> = {
  win: "승",
  draw: "무",
  lose: "패",
};

export const RESULT_BADGE: Record<Result, string> = {
  win: "bg-green-100 text-green-700",
  draw: "bg-gray-100 text-gray-700",
  lose: "bg-red-100 text-red-700",
};

export function getResult(
  ourScore: number | null,
  oppScore: number | null,
): Result | null {
  if (ourScore == null || oppScore == null) return null;
  if (ourScore > oppScore) return "win";
  if (ourScore < oppScore) return "lose";
  return "draw";
}

export function formatMatchDate(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

// ISO → <input type="datetime-local"> value (yyyy-MM-ddTHH:mm)
export function isoToLocalDatetime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
