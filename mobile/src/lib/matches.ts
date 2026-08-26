import { supabase } from "./supabase";

export type Match = {
  id: string;
  opponent: string;
  match_date: string;
  location: string | null;
  our_score: number | null;
  opponent_score: number | null;
  status: string;
};

/** 팀의 경기 목록 — 최신순. RLS 가 팀 스코프를 강제하므로 별도 API 없이 직접 조회한다. */
export async function getMatches(teamId: string): Promise<Match[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("id, opponent, match_date, location, our_score, opponent_score, status")
    .eq("team_id", teamId)
    .order("match_date", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Match[];
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function formatMatchDate(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekday = WEEKDAYS[d.getDay()];
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${month}월 ${day}일 (${weekday}) ${hours}:${minutes}`;
}

export const STATUS_LABEL: Record<string, string> = {
  scheduled: "예정",
  in_progress: "진행중",
  done: "종료",
  canceled: "취소",
};
