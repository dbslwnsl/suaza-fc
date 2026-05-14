"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MatchStatus } from "./helpers";
import { MATCH_STATUS } from "./helpers";

type MatchInput = {
  opponent: string;
  match_date: string;
  location: string | null;
  our_score: number | null;
  opponent_score: number | null;
  status: MatchStatus;
  notes: string | null;
};

function parseForm(formData: FormData): MatchInput {
  const opponent = String(formData.get("opponent") ?? "").trim();
  const matchDateLocal = String(formData.get("match_date") ?? "");
  const match_date = matchDateLocal
    ? new Date(matchDateLocal).toISOString()
    : "";
  const location = String(formData.get("location") ?? "").trim() || null;
  const ourScoreRaw = String(formData.get("our_score") ?? "").trim();
  const oppScoreRaw = String(formData.get("opponent_score") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "scheduled");
  const status: MatchStatus = (MATCH_STATUS as readonly string[]).includes(
    statusRaw,
  )
    ? (statusRaw as MatchStatus)
    : "scheduled";
  const notes = String(formData.get("notes") ?? "").trim() || null;

  return {
    opponent,
    match_date,
    location,
    our_score: ourScoreRaw ? Number(ourScoreRaw) : null,
    opponent_score: oppScoreRaw ? Number(oppScoreRaw) : null,
    status,
    notes,
  };
}

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (me?.role !== "manager" && me?.role !== "coach") {
    redirect(
      `/matches?error=${encodeURIComponent("경기 관리 권한이 없습니다")}`,
    );
  }
  return { supabase, userId: user.id };
}

export async function createMatch(formData: FormData) {
  const { supabase, userId } = await requireStaff();
  const input = parseForm(formData);

  if (!input.opponent) {
    redirect(`/matches/new?error=${encodeURIComponent("상대팀을 입력해 주세요")}`);
  }
  if (!input.match_date) {
    redirect(`/matches/new?error=${encodeURIComponent("경기 날짜를 선택해 주세요")}`);
  }

  const { data, error } = await supabase
    .from("matches")
    .insert({ ...input, created_by: userId })
    .select("id")
    .single();

  if (error) {
    redirect(`/matches/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/matches");
  redirect(`/matches/${data!.id}`);
}

export async function updateMatch(matchId: string, formData: FormData) {
  const { supabase } = await requireStaff();
  const input = parseForm(formData);

  if (!input.opponent) {
    redirect(`/matches/${matchId}?error=${encodeURIComponent("상대팀을 입력해 주세요")}`);
  }
  if (!input.match_date) {
    redirect(`/matches/${matchId}?error=${encodeURIComponent("경기 날짜를 선택해 주세요")}`);
  }

  const { error } = await supabase
    .from("matches")
    .update(input)
    .eq("id", matchId);

  if (error) {
    redirect(`/matches/${matchId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/matches");
  revalidatePath(`/matches/${matchId}`);
  redirect(`/matches/${matchId}?message=${encodeURIComponent("저장되었습니다")}`);
}

export async function deleteMatch(matchId: string) {
  const { supabase } = await requireStaff();
  const { error } = await supabase.from("matches").delete().eq("id", matchId);
  if (error) {
    redirect(`/matches/${matchId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/matches");
  redirect(`/matches?message=${encodeURIComponent("경기가 삭제되었습니다")}`);
}

// ─────────────────────────────────────────────────────────────
// 선수별 경기 기록 (match_participations)
// ─────────────────────────────────────────────────────────────

export async function addParticipant(matchId: string, formData: FormData) {
  const { supabase } = await requireStaff();
  const playerId = String(formData.get("player_id") ?? "");
  if (!playerId) {
    redirect(`/matches/${matchId}?error=${encodeURIComponent("선수를 선택해 주세요")}`);
  }

  const { error } = await supabase
    .from("match_participations")
    .insert({ match_id: matchId, player_id: playerId });

  if (error) {
    redirect(`/matches/${matchId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/matches/${matchId}`);
  redirect(`/matches/${matchId}`);
}

export async function updateParticipant(
  participationId: string,
  matchId: string,
  formData: FormData,
) {
  const { supabase } = await requireStaff();
  const n = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v ? Number(v) : 0;
  };

  // custom_stats 는 `custom__<key>` 폼 필드명으로 전달
  const custom_stats: Record<string, number> = {};
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith("custom__")) continue;
    const key = name.slice("custom__".length);
    const v = String(value ?? "").trim();
    custom_stats[key] = v ? Number(v) : 0;
  }

  const { error } = await supabase
    .from("match_participations")
    .update({
      goals: n("goals"),
      assists: n("assists"),
      custom_stats,
    })
    .eq("id", participationId);

  if (error) {
    redirect(`/matches/${matchId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/matches/${matchId}`);
  redirect(`/matches/${matchId}?message=${encodeURIComponent("기록이 저장되었습니다")}`);
}

export async function removeParticipant(
  participationId: string,
  matchId: string,
) {
  const { supabase } = await requireStaff();
  const { error } = await supabase
    .from("match_participations")
    .delete()
    .eq("id", participationId);

  if (error) {
    redirect(`/matches/${matchId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/matches/${matchId}`);
  redirect(`/matches/${matchId}`);
}

// ─────────────────────────────────────────────────────────────
// 출석 투표 (match_attendances)
// ─────────────────────────────────────────────────────────────

const ATTENDANCE_VALUES = ["attending", "absent", "undecided"] as const;
type AttendanceStatus = (typeof ATTENDANCE_VALUES)[number];

export async function setAttendance(
  matchId: string,
  redirectTo: string,
  formData: FormData,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const raw = String(formData.get("status") ?? "");
  if (!ATTENDANCE_VALUES.includes(raw as AttendanceStatus)) {
    redirect(`${redirectTo}?error=${encodeURIComponent("올바르지 않은 값입니다")}`);
  }

  const { error } = await supabase.from("match_attendances").upsert(
    {
      match_id: matchId,
      player_id: user.id,
      status: raw,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "match_id,player_id" },
  );

  if (error) {
    redirect(`${redirectTo}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/");
  redirect(redirectTo);
}
