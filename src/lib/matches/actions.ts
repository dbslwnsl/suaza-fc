"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MatchStatus } from "./helpers";
import {
  DEFAULT_MATCH_DURATION_HOURS,
  MATCH_DURATION_OPTIONS,
  MATCH_STATUS,
} from "./helpers";

type MatchInput = {
  opponent: string;
  match_date: string;
  location: string | null;
  our_score: number | null;
  opponent_score: number | null;
  status: MatchStatus;
  notes: string | null;
  duration_hours: number;
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

  const durationRaw = Number(formData.get("duration_hours"));
  const duration_hours = (
    MATCH_DURATION_OPTIONS as readonly number[]
  ).includes(durationRaw)
    ? durationRaw
    : DEFAULT_MATCH_DURATION_HOURS;

  return {
    opponent,
    match_date,
    location,
    our_score: ourScoreRaw ? Number(ourScoreRaw) : null,
    opponent_score: oppScoreRaw ? Number(oppScoreRaw) : null,
    status,
    notes,
    duration_hours,
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

  // 기존 status 와 비교하여 명시적 변경이면 override 시각 기록
  const { data: existing } = await supabase
    .from("matches")
    .select("status")
    .eq("id", matchId)
    .single();

  const update: Record<string, unknown> = { ...input };
  if (existing && existing.status !== input.status) {
    update.status_overridden_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("matches")
    .update(update)
    .eq("id", matchId);

  if (error) {
    redirect(`/matches/${matchId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/matches");
  revalidatePath(`/matches/${matchId}`);
  redirect(`/matches/${matchId}?message=${encodeURIComponent("저장되었습니다")}`);
}

export async function startMatch(matchId: string) {
  const { supabase } = await requireStaff();
  const { error } = await supabase
    .from("matches")
    .update({ status: "in_progress" })
    .eq("id", matchId);
  if (error) {
    redirect(`/matches/${matchId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/matches/${matchId}`);
  redirect(`/matches/${matchId}`);
}

/**
 * 우리/상대 점수를 delta 만큼 증감. 매니저/코치만 가능.
 * 음수가 되지 않도록 0 에서 클램프.
 */
export async function incrementMatchScore(
  matchId: string,
  side: "our" | "opponent",
  delta: number,
) {
  const { supabase } = await requireStaff();

  const { data: existing, error: getErr } = await supabase
    .from("matches")
    .select("our_score, opponent_score")
    .eq("id", matchId)
    .single();

  if (getErr || !existing) return;

  const col = side === "our" ? "our_score" : "opponent_score";
  const current =
    side === "our" ? existing.our_score ?? 0 : existing.opponent_score ?? 0;
  const next = Math.max(0, current + delta);

  const { error } = await supabase
    .from("matches")
    .update({ [col]: next })
    .eq("id", matchId);

  if (error) return;

  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/matches");
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

  // 새로 추가 또는 이전에 archive 된 row 재활성화.
  // 통계는 0 으로 초기화 (이전 기록 복원 X).
  // 단, 출석은 자동으로 1 점 (참가 = 출석).
  const { error } = await supabase
    .from("match_participations")
    .upsert(
      {
        match_id: matchId,
        player_id: playerId,
        archived_at: null,
        goals: 0,
        assists: 0,
        custom_stats: { attendance: 1 },
      },
      { onConflict: "match_id,player_id" },
    );

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

/**
 * 단일 stat 키를 delta 만큼 증감. 실시간 자동 저장용.
 * - goals/assists 는 컬럼, 그 외(clean_sheets/referee_count 등)는 custom_stats jsonb 의 키.
 */
export async function incrementStat(
  participationId: string,
  matchId: string,
  key: "goals" | "assists" | "clean_sheets" | "referee_count",
  delta: number,
) {
  const { supabase } = await requireStaff();

  const { data: p, error: getErr } = await supabase
    .from("match_participations")
    .select("goals, assists, custom_stats")
    .eq("id", participationId)
    .single();

  if (getErr || !p) return;

  let goals = p.goals ?? 0;
  let assists = p.assists ?? 0;
  const custom_stats: Record<string, number> = {
    ...((p.custom_stats as Record<string, number> | null) ?? {}),
  };

  if (key === "goals") {
    goals = Math.max(0, goals + delta);
  } else if (key === "assists") {
    assists = Math.max(0, assists + delta);
  } else {
    custom_stats[key] = Math.max(0, (custom_stats[key] ?? 0) + delta);
  }

  await supabase
    .from("match_participations")
    .update({ goals, assists, custom_stats })
    .eq("id", participationId);

  revalidatePath(`/matches/${matchId}`);
}

export async function saveParticipations(
  matchId: string,
  edits: {
    id: string;
    goals: number;
    assists: number;
    custom_stats: Record<string, number>;
  }[],
) {
  const { supabase } = await requireStaff();

  for (const e of edits) {
    const { error } = await supabase
      .from("match_participations")
      .update({
        goals: e.goals,
        assists: e.assists,
        custom_stats: e.custom_stats,
      })
      .eq("id", e.id)
      .eq("match_id", matchId);
    if (error) {
      throw new Error(error.message);
    }
  }

  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/members");
}

export async function removeParticipant(
  participationId: string,
  matchId: string,
) {
  const { supabase } = await requireStaff();
  // soft-delete: archived_at 만 설정. 통계는 보존되어 재추가 시 복원됨.
  // 트리거가 attendance 도 'absent' 로 변경 (선수가 출석 카드에서도 제외됨).
  const { error } = await supabase
    .from("match_participations")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", participationId);

  if (error) {
    redirect(`/matches/${matchId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/matches/${matchId}`);
  redirect(`/matches/${matchId}`);
}

/**
 * 기록 중인 선수에서만 빼고 출석은 'attending' 으로 유지.
 * → 결과적으로 '+기록 시작' 후보 칩으로 돌아감.
 */
export async function unrecordParticipant(
  participationId: string,
  matchId: string,
) {
  const { supabase } = await requireStaff();

  const { data: p, error: getErr } = await supabase
    .from("match_participations")
    .select("player_id")
    .eq("id", participationId)
    .single();

  if (getErr || !p) {
    redirect(
      `/matches/${matchId}?error=${encodeURIComponent("참가자를 찾을 수 없습니다")}`,
    );
  }

  // 1. 참가 row archive + 통계 초기화 (재추가 시 0 으로 시작)
  // 트리거가 attendance 를 absent 로 변경하지만 아래에서 되돌림.
  const { error: archiveErr } = await supabase
    .from("match_participations")
    .update({
      archived_at: new Date().toISOString(),
      goals: 0,
      assists: 0,
      custom_stats: {},
    })
    .eq("id", participationId);

  if (archiveErr) {
    redirect(
      `/matches/${matchId}?error=${encodeURIComponent(archiveErr.message)}`,
    );
  }

  // 2. attendance 를 attending 으로 복원
  const { error: attErr } = await supabase
    .from("match_attendances")
    .upsert(
      {
        match_id: matchId,
        player_id: p.player_id,
        status: "attending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "match_id,player_id" },
    );

  if (attErr) {
    redirect(
      `/matches/${matchId}?error=${encodeURIComponent(attErr.message)}`,
    );
  }

  revalidatePath(`/matches/${matchId}`);
  redirect(`/matches/${matchId}`);
}

// ─────────────────────────────────────────────────────────────
// 출석 투표 (match_attendances)
// ─────────────────────────────────────────────────────────────

const ATTENDANCE_VALUES = ["attending", "absent", "undecided"] as const;
type AttendanceStatus = (typeof ATTENDANCE_VALUES)[number];

async function requireManager() {
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
  if (me?.role !== "manager") {
    throw new Error("매니저만 다른 회원의 출석을 변경할 수 있습니다");
  }
  return { supabase };
}

/**
 * 매니저가 다른 회원의 출석 상태를 변경 (Drag&Drop 용).
 * status === null 이면 row 삭제 (= 미투표).
 */
export async function setAttendanceFor(
  matchId: string,
  playerId: string,
  status: AttendanceStatus | null,
) {
  const { supabase } = await requireManager();

  if (status === null) {
    const { error } = await supabase
      .from("match_attendances")
      .delete()
      .eq("match_id", matchId)
      .eq("player_id", playerId);
    if (error) throw error;
  } else {
    if (!ATTENDANCE_VALUES.includes(status)) {
      throw new Error("올바르지 않은 status 입니다");
    }
    const { error } = await supabase.from("match_attendances").upsert(
      {
        match_id: matchId,
        player_id: playerId,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "match_id,player_id" },
    );
    if (error) throw error;
  }

  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/");
}

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

  // 토글 동작: 같은 status 가 이미 선택돼 있으면 row 삭제(=미투표)
  const { data: existing } = await supabase
    .from("match_attendances")
    .select("status")
    .eq("match_id", matchId)
    .eq("player_id", user.id)
    .maybeSingle();

  if (existing?.status === raw) {
    const { error } = await supabase
      .from("match_attendances")
      .delete()
      .eq("match_id", matchId)
      .eq("player_id", user.id);
    if (error) {
      redirect(`${redirectTo}?error=${encodeURIComponent(error.message)}`);
    }
  } else {
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
  }

  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/");
  redirect(redirectTo);
}
