"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MatchStatus } from "./helpers";
import {
  DEFAULT_MATCH_DURATION_HOURS,
  DEFAULT_TOTAL_QUARTERS,
  MATCH_STATUS,
  MAX_TOTAL_QUARTERS,
  MIN_TOTAL_QUARTERS,
  UNIFORM_COLORS,
  isMatchStarted,
  isQuarterAction,
  maxQuartersForDuration,
  type QuarterAction,
} from "./helpers";
import type { SavedQuarter } from "@/lib/formations/helpers";

type MatchInput = {
  opponent: string;
  match_date: string;
  location: string | null;
  our_score: number | null;
  opponent_score: number | null;
  status: MatchStatus;
  notes: string | null;
  duration_hours: number;
  vote_deadline: string | null;
  team_a_name: string | null;
  team_b_name: string | null;
  team_a_color: string | null;
  team_b_color: string | null;
  total_quarters: number;
  quarter_actions: (QuarterAction | null)[];
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

  // 진행 쿼터 축소 시 실제 경기 시간(쿼터×30분)이 0.5h 단위로 저장될 수 있음.
  // 0.5 ~ 4시간 사이의 30분 배수만 허용.
  const durationRaw = Number(formData.get("duration_hours"));
  const duration_hours =
    Number.isFinite(durationRaw) &&
    durationRaw >= 0.5 &&
    durationRaw <= 4 &&
    Math.round(durationRaw * 2) === durationRaw * 2
      ? durationRaw
      : DEFAULT_MATCH_DURATION_HOURS;

  const deadlineLocal = String(formData.get("vote_deadline") ?? "");
  const vote_deadline = deadlineLocal ? kstLocalToISO(deadlineLocal) : null;

  // 자체전 A/B 팀 이름 (자체전 아닐 때는 null 유지)
  const isIntra = opponent === "자체전";
  const teamARaw = String(formData.get("team_a_name") ?? "").trim();
  const teamBRaw = String(formData.get("team_b_name") ?? "").trim();
  const team_a_name = isIntra && teamARaw ? teamARaw : null;
  const team_b_name = isIntra && teamBRaw ? teamBRaw : null;

  // 유니폼 색 — 6자리 hex 형식이면 허용 (#RRGGBB)
  const HEX6 = /^#[0-9A-Fa-f]{6}$/;
  const teamAColorRaw = String(formData.get("team_a_color") ?? "").trim();
  const teamBColorRaw = String(formData.get("team_b_color") ?? "").trim();
  const team_a_color = HEX6.test(teamAColorRaw) ? teamAColorRaw : null;
  const team_b_color = HEX6.test(teamBColorRaw) ? teamBColorRaw : null;

  // 쿼터 수 — duration_hours 별 상한으로 클램프
  const maxQ = maxQuartersForDuration(duration_hours);
  const totalRaw = Number(formData.get("total_quarters"));
  let total_quarters = Number.isFinite(totalRaw)
    ? Math.round(totalRaw)
    : DEFAULT_TOTAL_QUARTERS;
  if (total_quarters < MIN_TOTAL_QUARTERS) total_quarters = MIN_TOTAL_QUARTERS;
  if (total_quarters > MAX_TOTAL_QUARTERS) total_quarters = MAX_TOTAL_QUARTERS;
  if (total_quarters > maxQ) total_quarters = maxQ;

  // 쿼터별 활동 — quarter_action_0, quarter_action_1, ... 형태로 받음 (길이=total_quarters)
  const quarter_actions: (QuarterAction | null)[] = [];
  for (let i = 0; i < total_quarters; i++) {
    const raw = String(formData.get(`quarter_action_${i}`) ?? "").trim();
    quarter_actions.push(isQuarterAction(raw) ? (raw as QuarterAction) : null);
  }

  return {
    opponent,
    match_date,
    location,
    our_score: ourScoreRaw ? Number(ourScoreRaw) : null,
    opponent_score: oppScoreRaw ? Number(oppScoreRaw) : null,
    status,
    notes,
    duration_hours,
    vote_deadline,
    team_a_name,
    team_b_name,
    team_a_color,
    team_b_color,
    total_quarters,
    quarter_actions,
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
    .select("role, title")
    .eq("id", user.id)
    .single();

  // 권한: 매니저(role=manager) / 코치(role=coach) / 회장(title=president) / 감독(title=head_coach)
  const isStaff =
    me?.role === "manager" ||
    me?.role === "coach" ||
    me?.title === "president" ||
    me?.title === "head_coach";
  if (!isStaff) {
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

function actionsEqual(
  a: (QuarterAction | null)[],
  b: (QuarterAction | null)[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i] ?? null) !== (b[i] ?? null)) return false;
  }
  return true;
}

/**
 * 경기 수정으로 쿼터 구성(총 쿼터수/활동)이 바뀌면 출석 투표·포메이션을 보정한다.
 *
 * 모델: 끝나는 시간이 고정이라 쿼터 증감은 "앞쪽(시작쪽)"에서 일어난다.
 *   새 글로벌 인덱스 = 기존 인덱스 + (새 총쿼터수 − 기존 총쿼터수)
 *
 * - 출석 쿼터(attending_quarters: 글로벌 1-based 인덱스)는 위 식으로 시프트.
 *   범위(1..새총)를 벗어나면 제거. 모두 사라지면 그 회원은 불참 처리.
 *   null(전체 참여)은 그대로 전체 참여 유지.
 * - 포메이션 쿼터는 같은 시프트로 id 재지정. 범위 밖이거나 게임 쿼터(준비/훈련 제외)가
 *   아니게 되면 제거. 해당 쿼터에 더 이상 참석하지 않는 선수는 슬롯에서 비운다.
 */
async function migrateQuartersAfterEdit(
  supabase: Awaited<ReturnType<typeof requireStaff>>["supabase"],
  matchId: string,
  oldTotal: number,
  newTotal: number,
  newActions: (QuarterAction | null)[],
) {
  const shift = newTotal - oldTotal;
  const now = new Date().toISOString();

  // 1) 출석 보정 + 최종 참석맵 구성 (status=attending 인 회원만 맵에 포함)
  const { data: rows } = await supabase
    .from("match_attendances")
    .select("player_id, status, attending_quarters")
    .eq("match_id", matchId);

  const attendingMap = new Map<string, number[] | null>();
  for (const r of (rows ?? []) as {
    player_id: string;
    status: string;
    attending_quarters: number[] | null;
  }[]) {
    if (r.status !== "attending") continue;
    const aq = r.attending_quarters;
    if (aq == null) {
      attendingMap.set(r.player_id, null); // 전체 참여 유지
      continue;
    }
    if (shift === 0) {
      attendingMap.set(r.player_id, aq); // 쿼터수 변화 없음 → 인덱스 그대로
      continue;
    }
    const migrated = aq
      .map((i) => i + shift)
      .filter((i) => i >= 1 && i <= newTotal)
      .sort((x, y) => x - y);
    if (migrated.length === 0) {
      // 참석 쿼터가 모두 사라짐 → 불참
      await supabase
        .from("match_attendances")
        .update({ status: "absent", attending_quarters: null, updated_at: now })
        .eq("match_id", matchId)
        .eq("player_id", r.player_id);
      continue;
    }
    const finalAq = migrated.length === newTotal ? null : migrated;
    await supabase
      .from("match_attendances")
      .update({ attending_quarters: finalAq, updated_at: now })
      .eq("match_id", matchId)
      .eq("player_id", r.player_id);
    attendingMap.set(r.player_id, finalAq);
  }

  // 2) 포메이션 보정
  const { data: fRow } = await supabase
    .from("formations")
    .select("positions")
    .eq("match_id", matchId)
    .maybeSingle();
  const quarters = (fRow?.positions as { quarters?: SavedQuarter[] } | null)
    ?.quarters;
  if (!quarters || quarters.length === 0) return;

  const isGameQuarter = (gi: number) => {
    const a = newActions[gi - 1] ?? null;
    return a !== "warmup" && a !== "training";
  };
  const attendsQuarter = (pid: string, gi: number) => {
    if (!attendingMap.has(pid)) return false; // 불참·미투표 → 슬롯에서 제거
    const aq = attendingMap.get(pid)!;
    return aq == null || aq.includes(gi);
  };
  const cleanSlots = (ids: (string | null)[] | undefined, gi: number) =>
    (ids ?? []).map((pid) => (pid && attendsQuarter(pid, gi) ? pid : null));

  const migratedQuarters: SavedQuarter[] = [];
  for (const q of quarters) {
    const gi = parseInt(String(q.id), 10);
    if (!Number.isFinite(gi)) continue;
    const newGi = gi + shift;
    if (newGi < 1 || newGi > newTotal) continue; // 범위 밖 → 제거
    if (!isGameQuarter(newGi)) continue; // 준비/훈련이 됨 → 포메이션 없음
    const out: SavedQuarter = {
      id: `${newGi}Q`,
      shape: q.shape,
      player_ids: cleanSlots(q.player_ids, newGi),
    };
    if (q.teamB) {
      out.teamB = {
        shape: q.teamB.shape,
        player_ids: cleanSlots(q.teamB.player_ids, newGi),
      };
    }
    migratedQuarters.push(out);
  }
  migratedQuarters.sort(
    (a, b) => parseInt(a.id, 10) - parseInt(b.id, 10),
  );

  if (migratedQuarters.length === 0) {
    await supabase.from("formations").delete().eq("match_id", matchId);
    return;
  }
  const first = migratedQuarters[0];
  await supabase
    .from("formations")
    .update({
      shape: first.shape,
      positions: { quarters: migratedQuarters, player_ids: first.player_ids },
    })
    .eq("match_id", matchId);
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

  // 기존 status·쿼터 구성과 비교 (쿼터 변경 시 출석/포메이션 보정에 사용)
  const { data: existing } = await supabase
    .from("matches")
    .select("status, total_quarters, quarter_actions")
    .eq("id", matchId)
    .single();

  // 종료/취소된 경기는 정보 수정 불가 (조회 전용)
  if (existing?.status === "done" || existing?.status === "canceled") {
    redirect(
      `/matches/${matchId}?error=${encodeURIComponent(
        "종료된 경기는 정보를 수정할 수 없습니다",
      )}`,
    );
  }

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

  // 쿼터 구성(총 쿼터수/활동)이 바뀌었으면 이미 투표한 출석·포메이션을 보정
  const oldTotal =
    (existing?.total_quarters as number | null) ?? input.total_quarters;
  const oldActions = ((existing?.quarter_actions as
    | (QuarterAction | null)[]
    | null) ?? []) as (QuarterAction | null)[];
  if (
    oldTotal !== input.total_quarters ||
    !actionsEqual(oldActions, input.quarter_actions)
  ) {
    await migrateQuartersAfterEdit(
      supabase,
      matchId,
      oldTotal,
      input.total_quarters,
      input.quarter_actions,
    );
  }

  revalidatePath("/matches");
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/formation`);
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
 * 자체전 승리팀 토글. 회장·감독·매니저만 가능.
 *   nextWinner: "A" | "B" | null (=무승부).
 * 부수효과: 해당 경기의 모든 match_participations.custom_stats.win_points 를
 *   승리팀(=A or B) 선수만 1, 그 외(무승부 포함)는 0 으로 일괄 갱신.
 *   participation row 가 없는 출석 선수에게는 영향 없음 — 명단 표시 계산은
 *   embed.tsx 에서 winningTeam + match_attendances 기준으로 처리.
 */
export async function setIntraWinner(
  matchId: string,
  nextWinner: "A" | "B" | null,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role, title")
    .eq("id", user.id)
    .single();
  const isFullStaff =
    me?.role === "manager" ||
    me?.title === "president" ||
    me?.title === "head_coach";
  if (!isFullStaff) {
    return { error: "권한이 없습니다" };
  }

  // 1. matches.intra_winner 갱신
  const { error: updErr } = await supabase
    .from("matches")
    .update({ intra_winner: nextWinner })
    .eq("id", matchId);
  if (updErr) return { error: updErr.message };

  // 2. 출석한 player_id → team 매핑
  const { data: atts } = await supabase
    .from("match_attendances")
    .select("player_id, team")
    .eq("match_id", matchId)
    .eq("status", "attending");
  const teamByPlayer = new Map<string, "A" | "B" | null>();
  for (const a of (atts ?? []) as {
    player_id: string;
    team: "A" | "B" | null;
  }[]) {
    teamByPlayer.set(a.player_id, a.team);
  }

  // 3. 해당 경기 모든 participation 의 win_points 재계산
  const { data: parts } = await supabase
    .from("match_participations")
    .select("id, player_id, custom_stats")
    .eq("match_id", matchId)
    .is("archived_at", null);
  for (const p of (parts ?? []) as {
    id: string;
    player_id: string;
    custom_stats: Record<string, number> | null;
  }[]) {
    const team = teamByPlayer.get(p.player_id) ?? null;
    const shouldWin = nextWinner != null && team === nextWinner;
    const cs: Record<string, number> = {
      ...((p.custom_stats as Record<string, number> | null) ?? {}),
    };
    const cur = cs.win_points ?? 0;
    const next = shouldWin ? 1 : 0;
    if (cur === next) continue;
    cs.win_points = next;
    await supabase
      .from("match_participations")
      .update({ custom_stats: cs })
      .eq("id", p.id);
  }

  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/formation`);
  return { ok: true };
}

/**
 * MOM 토글. 회장·감독·매니저만 사용 가능.
 *   active=true 면 custom_stats.mom=1, false 면 0.
 * 한 경기에 여러 명이 MOM 일 수 있어 단일 선택은 아님.
 */
export async function setMomForPlayer(
  matchId: string,
  playerId: string,
  active: boolean,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role, title")
    .eq("id", user.id)
    .single();
  const isFullStaff =
    me?.role === "manager" ||
    me?.title === "president" ||
    me?.title === "head_coach";
  if (!isFullStaff) return { error: "권한이 없습니다" };

  const { data: existing } = await supabase
    .from("match_participations")
    .select("id, custom_stats")
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .maybeSingle();

  const next = active ? 1 : 0;
  const cs: Record<string, number> = {
    ...((existing?.custom_stats as Record<string, number> | null) ?? {}),
    attendance: 1,
    mom: next,
  };

  if (!existing) {
    // 새 row 생성 시 승리팀이면 win_points 도 함께 부여
    const [{ data: m }, { data: att }] = await Promise.all([
      supabase
        .from("matches")
        .select("opponent, intra_winner")
        .eq("id", matchId)
        .single(),
      supabase
        .from("match_attendances")
        .select("team")
        .eq("match_id", matchId)
        .eq("player_id", playerId)
        .maybeSingle(),
    ]);
    const isIntra = m?.opponent === "자체전";
    const winner =
      (m as { intra_winner?: "A" | "B" | null } | null)?.intra_winner ?? null;
    const playerTeam =
      (att as { team?: "A" | "B" | null } | null)?.team ?? null;
    if (isIntra && winner && playerTeam === winner) cs.win_points = 1;

    await supabase.from("match_participations").insert({
      match_id: matchId,
      player_id: playerId,
      goals: 0,
      assists: 0,
      custom_stats: cs,
    });
  } else {
    await supabase
      .from("match_participations")
      .update({ archived_at: null, custom_stats: cs })
      .eq("id", existing.id);
  }

  revalidatePath(`/matches/${matchId}`);
  return { ok: true };
}

/**
 * 포메이션 임베드(명단 카드)에서 사용 — playerId 기준으로 단일 stat 을 증감한다.
 * - 기존 match_participations row 가 없으면 자동 생성하고(출석=1pt 자동),
 *   있으면 archived 상태를 풀고 increment 적용.
 * - 권한: requireStaff (매니저/감독·회장/코치).
 */
export async function incrementStatForPlayer(
  matchId: string,
  playerId: string,
  key: "goals" | "assists" | "clean_sheets" | "referee_count" | "mom" | "win_points",
  delta: number,
) {
  const { supabase } = await requireStaff();

  const { data: existing } = await supabase
    .from("match_participations")
    .select("id, goals, assists, custom_stats, archived_at")
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .maybeSingle();

  let id = existing?.id as string | undefined;
  let goals = existing?.goals ?? 0;
  let assists = existing?.assists ?? 0;
  const custom_stats: Record<string, number> = {
    ...((existing?.custom_stats as Record<string, number> | null) ?? {}),
    attendance: 1,
  };

  // row 가 없으면(새로 생성하는 경우) 승리팀 자동 부여:
  // 자체전 종료 + matches.intra_winner === 본인 team 이면 win_points=1.
  if (!existing) {
    const [{ data: m }, { data: att }] = await Promise.all([
      supabase
        .from("matches")
        .select("opponent, intra_winner")
        .eq("id", matchId)
        .single(),
      supabase
        .from("match_attendances")
        .select("team")
        .eq("match_id", matchId)
        .eq("player_id", playerId)
        .maybeSingle(),
    ]);
    const isIntra = m?.opponent === "자체전";
    const winner = (m as { intra_winner?: "A" | "B" | null } | null)
      ?.intra_winner ?? null;
    const playerTeam = (att as { team?: "A" | "B" | null } | null)?.team ?? null;
    if (isIntra && winner && playerTeam === winner) {
      custom_stats.win_points = 1;
    }
  }

  if (key === "goals") goals = Math.max(0, goals + delta);
  else if (key === "assists") assists = Math.max(0, assists + delta);
  else custom_stats[key] = Math.max(0, (custom_stats[key] ?? 0) + delta);

  if (!id) {
    const { data: inserted, error } = await supabase
      .from("match_participations")
      .insert({
        match_id: matchId,
        player_id: playerId,
        goals,
        assists,
        custom_stats,
      })
      .select("id")
      .single();
    if (error) return;
    id = inserted?.id;
  } else {
    await supabase
      .from("match_participations")
      .update({
        archived_at: null,
        goals,
        assists,
        custom_stats,
      })
      .eq("id", id);
  }

  revalidatePath(`/matches/${matchId}`);
}

/**
 * 단일 stat 키를 delta 만큼 증감. 실시간 자동 저장용.
 * - goals/assists 는 컬럼, 그 외(clean_sheets/referee_count 등)는 custom_stats jsonb 의 키.
 */
export async function incrementStat(
  participationId: string,
  matchId: string,
  key: "goals" | "assists" | "clean_sheets" | "referee_count" | "mom" | "win_points",
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

/**
 * 본인 출석 투표가 허용되는지.
 * - 회장(manager)/감독(coach): 항상 허용
 * - 일반 회원: 경기 시작 전 + 투표 마감 전에만 허용
 */
async function memberVoteAllowed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matchId: string,
  userId: string,
): Promise<boolean> {
  const [{ data: me }, { data: match }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).single(),
    supabase
      .from("matches")
      .select("status, match_date, vote_deadline, vote_closed_at")
      .eq("id", matchId)
      .single(),
  ]);
  if (me?.role === "manager" || me?.role === "coach") return true;
  if (!match) return false;
  if (isMatchStarted(match)) return false;
  if (match.vote_closed_at) return false;
  if (
    match.vote_deadline &&
    Date.now() > new Date(match.vote_deadline).getTime()
  ) {
    return false;
  }
  return true;
}

/**
 * 출석 투표 종료/재개. 회장/감독만 가능.
 * 종료 시 vote_closed_at 설정 → 일반 회원 투표 잠금.
 */
export async function closeAttendanceVote(matchId: string) {
  const { supabase } = await requireStaff();
  const { error } = await supabase
    .from("matches")
    .update({ vote_closed_at: new Date().toISOString() })
    .eq("id", matchId);
  if (error) {
    redirect(`/matches/${matchId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/");
}

export async function reopenAttendanceVote(matchId: string) {
  const { supabase } = await requireStaff();
  const { error } = await supabase
    .from("matches")
    .update({ vote_closed_at: null })
    .eq("id", matchId);
  if (error) {
    redirect(`/matches/${matchId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/");
}

/**
 * 회장/감독이 다른 회원의 출석 상태를 변경 (Drag&Drop 용).
 * status === null 이면 row 삭제 (= 미투표).
 */
export async function setAttendanceFor(
  matchId: string,
  playerId: string,
  status: AttendanceStatus | null,
) {
  const { supabase } = await requireStaff();

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
    // 매니저가 참석으로 옮기면 항상 '전체 참여'(attending_quarters=null)로 설정.
    const { error } = await supabase.from("match_attendances").upsert(
      {
        match_id: matchId,
        player_id: playerId,
        status,
        attending_quarters: null,
        // 참석이 아닌 상태로 옮기면 팀 배정을 비운다 — 다시 참석해도 옛 팀으로 자동 배정 방지.
        ...(status !== "attending" ? { team: null } : {}),
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

  if (!(await memberVoteAllowed(supabase, matchId, user.id))) {
    redirect(
      `${redirectTo}?error=${encodeURIComponent("투표가 마감되어 변경할 수 없습니다")}`,
    );
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

  // 마감/시작 후엔 매니저·감독만 변경 가능
  if (!(await memberVoteAllowed(supabase, matchId, user.id))) {
    revalidatePath(`/matches/${matchId}`);
    return;
  }

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
    // 참석 선택 시 기본값 = 전체 쿼터(NULL). 트리거가 다른 status 에선 NULL 로 정리.
    // 참석이 아닌 상태로 바뀌면 팀 배정도 비운다 — 다시 참석해도 옛 팀으로 자동 배정되지 않도록.
    await supabase.from("match_attendances").upsert(
      {
        match_id: matchId,
        player_id: user.id,
        status,
        attending_quarters: null,
        ...(status !== "attending" ? { team: null } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "match_id,player_id" },
    );
  }

  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/");
}

/**
 * 본인 참여 쿼터 집합 지정. NULL = 전체 쿼터(기본).
 * 비-NULL = 참여하는 쿼터 번호 배열(1-indexed). 전체와 동일하면 NULL 로 정규화.
 * 참석(attending) 상태일 때만 의미가 있음 — 그 외에는 무시.
 */
export async function setMyAttendingQuarters(
  matchId: string,
  quarters: number[] | null,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await memberVoteAllowed(supabase, matchId, user.id))) {
    revalidatePath(`/matches/${matchId}`);
    return;
  }

  // 참석자만 의미 있음 + 경기 총 쿼터 수 조회
  const { data: existing } = await supabase
    .from("match_attendances")
    .select("status, match:matches(total_quarters)")
    .eq("match_id", matchId)
    .eq("player_id", user.id)
    .maybeSingle();

  if (existing?.status !== "attending") return;

  const total =
    (existing as { match?: { total_quarters?: number } | null } | null)?.match
      ?.total_quarters ?? 4;

  // 정규화: 1..total 범위 + 중복 제거 + 정렬. 전체면 NULL.
  let normalized: number[] | null = null;
  if (Array.isArray(quarters)) {
    const set = new Set(
      quarters.filter((q) => Number.isInteger(q) && q >= 1 && q <= total),
    );
    // 참여 쿼터를 모두 해제 → 출석 취소(미투표)로 처리: 행 삭제
    if (set.size === 0) {
      await supabase
        .from("match_attendances")
        .delete()
        .eq("match_id", matchId)
        .eq("player_id", user.id);
      revalidatePath(`/matches/${matchId}`);
      revalidatePath("/");
      return;
    }
    if (set.size < total) {
      normalized = Array.from(set).sort((a, b) => a - b);
    }
  }

  await supabase
    .from("match_attendances")
    .update({
      attending_quarters: normalized,
      updated_at: new Date().toISOString(),
    })
    .eq("match_id", matchId)
    .eq("player_id", user.id);

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
  // 떠난 팀의 주장이었다면 주장 해제
  await clearCaptainIfLeft(supabase, matchId, playerId, next);
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
  // 팀이 새로 섞였으므로 주장 초기화
  await supabase
    .from("matches")
    .update({ team_a_captain: null, team_b_captain: null })
    .eq("id", matchId);
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
  // 떠난 팀의 주장이었다면 주장 해제
  await clearCaptainIfLeft(supabase, matchId, playerId, team);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/formation`);
}

/**
 * 한 팀(A/B)의 주장을 지정/해제. playerId=null 이면 해제.
 * 지정 시 해당 선수가 그 팀에 편성된 참석자여야 한다. 매니저/코치만 가능.
 */
export async function setMatchCaptain(
  matchId: string,
  team: "A" | "B",
  playerId: string | null,
) {
  const { supabase } = await requireStaff();
  if (team !== "A" && team !== "B") return;
  const col = team === "A" ? "team_a_captain" : "team_b_captain";

  if (playerId) {
    const { data: row } = await supabase
      .from("match_attendances")
      .select("status, team")
      .eq("match_id", matchId)
      .eq("player_id", playerId)
      .maybeSingle();
    // 그 팀에 편성된 참석자만 주장이 될 수 있음
    if (!row || row.status !== "attending" || row.team !== team) return;
  }

  const { error } = await supabase
    .from("matches")
    .update({ [col]: playerId })
    .eq("id", matchId);
  if (error) return;
  revalidatePath(`/matches/${matchId}`);
}

/**
 * 선수가 팀을 떠나면(다른 팀/미배정) 해당 팀의 주장이었을 경우 주장을 해제한다.
 * newTeam=null 이면 양쪽 주장에서 모두 해제 검사.
 */
async function clearCaptainIfLeft(
  supabase: Awaited<ReturnType<typeof requireStaff>>["supabase"],
  matchId: string,
  playerId: string,
  newTeam: "A" | "B" | null,
) {
  const { data: mm } = await supabase
    .from("matches")
    .select("team_a_captain, team_b_captain")
    .eq("id", matchId)
    .maybeSingle();
  if (!mm) return;
  const patch: Record<string, null> = {};
  if (mm.team_a_captain === playerId && newTeam !== "A")
    patch.team_a_captain = null;
  if (mm.team_b_captain === playerId && newTeam !== "B")
    patch.team_b_captain = null;
  if (Object.keys(patch).length > 0) {
    await supabase.from("matches").update(patch).eq("id", matchId);
  }
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
  // 팀이 모두 해제되므로 주장도 초기화
  await supabase
    .from("matches")
    .update({ team_a_captain: null, team_b_captain: null })
    .eq("id", matchId);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/formation`);
}

// ============================================================
// 경기 댓글 (match_comments)
// ============================================================

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

/**
 * 댓글 작성/수정/삭제 — 클라이언트가 자체 상태로 즉시 반영하므로 무거운 전체 페이지
 * revalidate 를 하지 않는다. 작성은 생성된 행(id·시각)을 반환해 클라이언트가 임시 항목을
 * 실제 항목으로 교체한다. (경기 상세는 동적 페이지라 재방문 시 서버에서 최신 목록을 다시 읽는다.)
 */
export type CreatedMatchComment = {
  id: string;
  created_at: string;
  updated_at: string;
  parent_id: string | null;
};

export async function createMatchComment(
  matchId: string,
  parentId: string | null,
  content: string,
): Promise<CreatedMatchComment | null> {
  const { supabase, userId } = await requireUser();
  const trimmed = content.trim();
  if (!trimmed) return null;

  // 1단계만 허용: 답글의 답글이면 부모 댓글로 평탄화
  let effectiveParent: string | null = parentId;
  if (parentId) {
    const { data: parent } = await supabase
      .from("match_comments")
      .select("parent_id")
      .eq("id", parentId)
      .single();
    if (parent?.parent_id) effectiveParent = parent.parent_id;
  }

  const { data } = await supabase
    .from("match_comments")
    .insert({
      match_id: matchId,
      author_id: userId,
      content: trimmed,
      parent_id: effectiveParent,
    })
    .select("id, created_at, updated_at, parent_id")
    .single();
  return (data as CreatedMatchComment | null) ?? null;
}

export async function updateMatchComment(commentId: string, content: string) {
  const { supabase } = await requireUser();
  const trimmed = content.trim();
  if (!trimmed) return;
  await supabase
    .from("match_comments")
    .update({ content: trimmed, updated_at: new Date().toISOString() })
    .eq("id", commentId);
}

export async function deleteMatchComment(commentId: string) {
  const { supabase } = await requireUser();
  await supabase.from("match_comments").delete().eq("id", commentId);
}

// ─────────────────────────────────────────────────────────────
// 용병 (match_mercenaries) — 자체전에서 임시로 추가되는 1회성 멤버
// ─────────────────────────────────────────────────────────────

/**
 * 용병 관리 권한 — staff(매니저/코치/회장/감독) 또는 해당 경기의 주장.
 */
async function requireCanManageMercenary(matchId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, { data: m }] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, title")
      .eq("id", user.id)
      .single(),
    supabase
      .from("matches")
      .select("team_a_captain, team_b_captain")
      .eq("id", matchId)
      .single(),
  ]);

  const isStaff =
    me?.role === "manager" ||
    me?.role === "coach" ||
    me?.title === "president" ||
    me?.title === "head_coach";
  const isCaptain =
    (!!m?.team_a_captain && m.team_a_captain === user.id) ||
    (!!m?.team_b_captain && m.team_b_captain === user.id);

  if (!isStaff && !isCaptain) {
    throw new Error("용병을 관리할 권한이 없습니다");
  }
  return { supabase, userId: user.id };
}

/**
 * 용병 추가: 이름은 자동으로 "용병N" (N = 기존 이름 중 가장 큰 번호 + 1).
 * 삭제 후 재추가 시 이름 충돌을 피하기 위해 max+1 방식.
 */
export async function addMercenary(matchId: string) {
  const { supabase } = await requireCanManageMercenary(matchId);

  const { data: existing } = await supabase
    .from("match_mercenaries")
    .select("name")
    .eq("match_id", matchId);

  let maxNum = 0;
  for (const m of (existing ?? []) as { name: string }[]) {
    const match = m.name.match(/^용병(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  const nextNum = maxNum + 1;

  const { error } = await supabase.from("match_mercenaries").insert({
    match_id: matchId,
    name: `용병${nextNum}`,
    team: null,
  });
  if (error) throw error;

  revalidatePath(`/matches/${matchId}`);
}

/**
 * 용병 팀 배정 (A/B/null).
 */
export async function setMercenaryTeam(
  matchId: string,
  mercenaryId: string,
  team: "A" | "B" | null,
) {
  const { supabase } = await requireCanManageMercenary(matchId);
  const { error } = await supabase
    .from("match_mercenaries")
    .update({ team })
    .eq("id", mercenaryId);
  if (error) throw error;
  revalidatePath(`/matches/${matchId}`);
}

/**
 * 용병 팀 순환 (없음 → A → B → 없음). 칩 탭 동작.
 */
export async function cycleMercenaryTeam(
  matchId: string,
  mercenaryId: string,
) {
  const { supabase } = await requireCanManageMercenary(matchId);
  const { data: cur } = await supabase
    .from("match_mercenaries")
    .select("team")
    .eq("id", mercenaryId)
    .single();
  const next: "A" | "B" | null =
    cur?.team === null || cur?.team === undefined
      ? "A"
      : cur.team === "A"
        ? "B"
        : null;
  const { error } = await supabase
    .from("match_mercenaries")
    .update({ team: next })
    .eq("id", mercenaryId);
  if (error) throw error;
  revalidatePath(`/matches/${matchId}`);
}

/**
 * 용병 삭제.
 */
export async function removeMercenary(matchId: string, mercenaryId: string) {
  const { supabase } = await requireCanManageMercenary(matchId);
  const { error } = await supabase
    .from("match_mercenaries")
    .delete()
    .eq("id", mercenaryId);
  if (error) throw error;
  revalidatePath(`/matches/${matchId}`);
}
