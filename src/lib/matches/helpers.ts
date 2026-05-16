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
};

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
