export const MATCH_STATUS = ["scheduled", "done", "canceled"] as const;
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
  done: "종료",
  canceled: "취소",
};

export const MATCH_STATUS_BADGE: Record<MatchStatus, string> = {
  scheduled: "bg-blue-50 text-blue-700",
  done: "bg-gray-100 text-gray-700",
  canceled: "bg-red-50 text-red-700",
};

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
