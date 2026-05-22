"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MatchStatus } from "./helpers";
import {
  DEFAULT_MATCH_DURATION_HOURS,
  MATCH_DURATION_OPTIONS,
  MATCH_STATUS,
  UNIFORM_COLORS,
  isMatchStarted,
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

// datetime-local 입력("YYYY-MM-DDTHH:mm")을 항상 서울(KST, +09:00) 기준으로
// 해석해 절대 UTC ISO 로 변환. 서버/단말 타임존과 무관하게 동작.
function kstLocalToISO(local: string): string {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return "";
  const [, y, mo, d, h, mi] = m;
  const utcMs =
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) -
    9 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

function parseForm(formData: FormData): MatchInput {
  const opponent = String(formData.get("opponent") ?? "").trim();
  const matchDateLocal = String(formData.get("match_date") ?? "");
  const match_date = matchDateLocal ? kstLocalToISO(matchDateLocal) : "";
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
    .select("our_score, opponent_score, status, match_date")
    .eq("id", matchId)
    .single();

  if (getErr || !existing) return;
  // 경기 시작 전에는 점수 수정 불가
  if (!isMatchStarted(existing)) return;

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

/**
 * 본인 출석 투표 (낙관적 UI용). status 를 인자로 받고 redirect 하지 않는다.
 * 같은 status 가 이미 선택돼 있으면 row 삭제(=미투표 토글).
 * 클라이언트가 즉시 화면을 갱신하고, 저장/revalidate 는 백그라운드로 처리.
 */
export async function voteAttendance(matchId: string, status: AttendanceStatus) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!ATTENDANCE_VALUES.includes(status)) return;

  const { data: existing } = await supabase
    .from("match_attendances")
    .select("status")
    .eq("match_id", matchId)
    .eq("player_id", user.id)
    .maybeSingle();

  if (existing?.status === status) {
    await supabase
      .from("match_attendances")
      .delete()
      .eq("match_id", matchId)
      .eq("player_id", user.id);
  } else {
    await supabase.from("match_attendances").upsert(
      {
        match_id: matchId,
        player_id: user.id,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "match_id,player_id" },
    );
  }

  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/");
}

// ─────────────────────────────────────────────────────────────
// 자체전 A/B 팀 편성 (match_attendances.team)
// ─────────────────────────────────────────────────────────────

type ServerClient = Awaited<ReturnType<typeof createClient>>;

type FormationPositions = {
  player_ids?: (string | null)[];
  quarters?: {
    id: string;
    shape: string;
    player_ids?: (string | null)[];
    teamB?: { shape: string; player_ids?: (string | null)[] };
  }[];
};

/**
 * 팀이 바뀐 선수의 포메이션 배치를 모든 쿼터(A·B 양 팀)에서 제거.
 * 변경 후 해당 선수는 새 팀 명단에 '미배치' 상태로 나타난다.
 */
async function resetPlayersInFormation(
  supabase: ServerClient,
  matchId: string,
  playerIds: string[],
) {
  if (playerIds.length === 0) return;
  const ids = new Set(playerIds);

  const { data: formation } = await supabase
    .from("formations")
    .select("positions")
    .eq("match_id", matchId)
    .maybeSingle();
  if (!formation) return;

  const positions = formation.positions as FormationPositions | null;
  if (!positions) return;

  let changed = false;
  const strip = (arr?: (string | null)[]) =>
    arr?.map((pid) => {
      if (pid && ids.has(pid)) {
        changed = true;
        return null;
      }
      return pid;
    });

  const next: FormationPositions = { ...positions };
  if (Array.isArray(positions.quarters)) {
    next.quarters = positions.quarters.map((q) => ({
      ...q,
      player_ids: strip(q.player_ids),
      teamB: q.teamB
        ? { ...q.teamB, player_ids: strip(q.teamB.player_ids) }
        : q.teamB,
    }));
  }
  if (Array.isArray(positions.player_ids)) {
    next.player_ids = strip(positions.player_ids);
  }

  if (!changed) return;
  await supabase
    .from("formations")
    .update({ positions: next })
    .eq("match_id", matchId);
}

/**
 * 한 선수의 팀 배정을 순환: null → 'A' → 'B' → null.
 * 참석(attending) 회원만 대상. 매니저/코치만 가능.
 */
export async function cycleMatchTeam(matchId: string, playerId: string) {
  const { supabase } = await requireStaff();

  const { data: row } = await supabase
    .from("match_attendances")
    .select("status, team")
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .maybeSingle();

  // 참석자만 편성
  if (!row || row.status !== "attending") return;

  const next = row.team === null ? "A" : row.team === "A" ? "B" : null;

  const { error } = await supabase
    .from("match_attendances")
    .update({ team: next, updated_at: new Date().toISOString() })
    .eq("match_id", matchId)
    .eq("player_id", playerId);

  if (error) return;
  // 팀이 바뀐 선수의 기존 포메이션 배치를 모든 쿼터에서 제거
  await resetPlayersInFormation(supabase, matchId, [playerId]);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/formation`);
}

/**
 * 참석자를 A/B 로 균등 자동 배분 (랜덤 셔플 후 반반).
 * 매니저/코치만 가능.
 */
export async function autoBalanceTeams(matchId: string) {
  const { supabase } = await requireStaff();

  const { data: attendees } = await supabase
    .from("match_attendances")
    .select("player_id, team")
    .eq("match_id", matchId)
    .eq("status", "attending");

  const oldTeam = new Map(
    (attendees ?? []).map((a) => [a.player_id, a.team as "A" | "B" | null]),
  );
  const ids = (attendees ?? []).map((a) => a.player_id);
  // Fisher-Yates 셔플
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  // 앞 절반 A, 뒤 절반 B
  const half = Math.ceil(ids.length / 2);
  const changed: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const team = i < half ? "A" : "B";
    if (oldTeam.get(ids[i]) !== team) changed.push(ids[i]);
    await supabase
      .from("match_attendances")
      .update({ team, updated_at: new Date().toISOString() })
      .eq("match_id", matchId)
      .eq("player_id", ids[i]);
  }

  // 팀이 바뀐 선수들의 포메이션 배치 제거
  await resetPlayersInFormation(supabase, matchId, changed);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/formation`);
}

/**
 * 한 선수의 팀을 직접 지정 (드래그앤드롭용): 'A' | 'B' | null.
 * 참석(attending) 회원만 대상. 매니저/코치만 가능.
 */
export async function setMatchTeam(
  matchId: string,
  playerId: string,
  team: "A" | "B" | null,
) {
  const { supabase } = await requireStaff();

  const { data: row } = await supabase
    .from("match_attendances")
    .select("status")
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (!row || row.status !== "attending") return;

  const { error } = await supabase
    .from("match_attendances")
    .update({ team, updated_at: new Date().toISOString() })
    .eq("match_id", matchId)
    .eq("player_id", playerId);

  if (error) return;
  // 팀이 바뀐 선수의 기존 포메이션 배치를 모든 쿼터에서 제거
  await resetPlayersInFormation(supabase, matchId, [playerId]);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/formation`);
}

/**
 * 본인 컨디션(1~5) 변경. 누구나 자기 것만 변경 가능.
 */
export async function setMyCondition(matchId: string, level: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  if (![1, 2, 3, 4, 5].includes(level)) return;

  await supabase
    .from("profiles")
    .update({ condition: level })
    .eq("id", user.id);

  revalidatePath(`/matches/${matchId}/formation`);
  revalidatePath(`/matches/${matchId}`);
}

/**
 * 자체전 팀 유니폼 색상 지정. 매니저/코치만 가능.
 */
export async function setTeamColor(
  matchId: string,
  team: "A" | "B",
  color: string,
) {
  const { supabase } = await requireStaff();
  if (!(UNIFORM_COLORS as readonly string[]).includes(color)) return;
  const col = team === "A" ? "team_a_color" : "team_b_color";
  const { error } = await supabase
    .from("matches")
    .update({ [col]: color })
    .eq("id", matchId);
  if (error) return;
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/formation`);
}

/**
 * 자체전 팀 편성 초기화: 참석자의 team 을 모두 null(미배정)로.
 * 매니저/코치만 가능.
 */
export async function resetMatchTeams(matchId: string) {
  const { supabase } = await requireStaff();

  const { data: attendees } = await supabase
    .from("match_attendances")
    .select("player_id")
    .eq("match_id", matchId)
    .eq("status", "attending");

  await supabase
    .from("match_attendances")
    .update({ team: null, updated_at: new Date().toISOString() })
    .eq("match_id", matchId)
    .eq("status", "attending");

  // 팀이 모두 해제되므로 참석자 전원의 포메이션 배치 제거
  await resetPlayersInFormation(
    supabase,
    matchId,
    (attendees ?? []).map((a) => a.player_id),
  );
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/formation`);
}
