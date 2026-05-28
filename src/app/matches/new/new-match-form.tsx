"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createMatch, updateMatch } from "@/lib/matches/actions";
import DatePicker from "./date-picker";
import TimePicker from "./time-picker";
import {
  DEFAULT_MATCH_DURATION_HOURS,
  DEFAULT_TEAM_COLOR,
  DEFAULT_VS_COLOR,
  MATCH_DURATION_OPTIONS,
  QUARTER_ACTIONS,
  QUARTER_ACTION_COLOR,
  QUARTER_ACTION_LABEL,
  maxQuartersForDuration,
  type MatchDurationHours,
  type QuarterAction,
} from "@/lib/matches/helpers";

type Status = "scheduled" | "in_progress" | "done" | "canceled";
type MatchType = "vs" | "intra";

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

const STATUS_OPTS: {
  value: Status;
  label: string;
  desc: string;
  color: string;
}[] = [
  {
    value: "scheduled",
    label: "예정",
    desc: "아직 안 한 경기",
    color: "#3B82F6",
  },
  {
    value: "in_progress",
    label: "진행중",
    desc: "지금 경기 중",
    color: "#F59E0B",
  },
  { value: "done", label: "완료", desc: "끝난 경기", color: "#22C55E" },
  { value: "canceled", label: "취소", desc: "취소된 경기", color: "#9CA3AF" },
];

type Initial = {
  opponent: string;
  matchDate: string; // ISO from DB
  location: string | null;
  status: Status;
  notes: string | null;
  durationHours?: number | null;
  voteDeadline?: string | null; // ISO from DB
  teamAName?: string | null;
  teamBName?: string | null;
  teamAColor?: string | null;
  teamBColor?: string | null;
  totalQuarters?: number | null;
  quarterActions?: (QuarterAction | null)[] | null;
};

// 투표 마감: 경기 시작 N시간 전, 또는 직접 설정
type VoteMode = 24 | 6 | 3 | 1 | "custom";
const VOTE_TABS: { value: VoteMode; label: string }[] = [
  { value: 24, label: "하루 전" },
  { value: 6, label: "6시간 전" },
  { value: 3, label: "3시간 전" },
  { value: 1, label: "1시간 전" },
  { value: "custom", label: "직접 설정" },
];
// 로컬 wall-clock 에서 offsetHours 만큼 앞으로 당긴 datetime-local 문자열 반환.
function shiftLocalDatetime(
  dateStr: string,
  timeStr: string,
  offsetHours: number,
): string {
  if (!dateStr || !timeStr) return "";
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return "";
  const dt = new Date(y, mo - 1, d, h, mi);
  dt.setTime(dt.getTime() - offsetHours * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

// 기본 직접설정 마감: 경기 날짜 기준 2일 전 12:00
function defaultCustomDeadline(dateStr: string): string {
  if (!dateStr) return "";
  const [y, mo, d] = dateStr.split("-").map(Number);
  if ([y, mo, d].some((n) => Number.isNaN(n))) return "";
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() - 2);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T12:00`;
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
function formatDeadlineLabel(local: string): string {
  if (!local) return "";
  const [datePart, timePart] = local.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  if ([y, mo, d].some((n) => Number.isNaN(n))) return "";
  const dow = DOW[new Date(y, mo - 1, d).getDay()];
  return `${mo}월 ${d}일 (${dow}) ${timePart}`;
}

export default function NewMatchForm({
  mode = "create",
  matchId,
  initial,
  recentOpponents,
  recentLocations,
}: {
  mode?: "create" | "edit";
  matchId?: string;
  initial?: Initial;
  recentOpponents: string[];
  recentLocations: string[];
}) {
  const isEdit = mode === "edit";
  const initialIsIntra = initial?.opponent === "자체전";

  const [matchType, setMatchType] = useState<MatchType>(
    initial ? (initialIsIntra ? "intra" : "vs") : "intra",
  );
  const [opponent, setOpponent] = useState(
    initial && !initialIsIntra ? initial.opponent : "",
  );
  const [teamAName, setTeamAName] = useState(initial?.teamAName ?? "");
  const [teamBName, setTeamBName] = useState(initial?.teamBName ?? "");
  // 상대전 유니폼 색 picker 초기값 (자체전은 picker 표시 안 함)
  const [teamAColor, setTeamAColor] = useState<string>(
    initial?.teamAColor || DEFAULT_VS_COLOR.A,
  );
  const [teamBColor, setTeamBColor] = useState<string>(
    initial?.teamBColor || DEFAULT_VS_COLOR.B,
  );
  const [date, setDate] = useState(
    initial ? isoToLocalDate(initial.matchDate) : "",
  );
  const [time, setTime] = useState(
    initial ? isoToLocalTime(initial.matchDate) : "",
  );
  const [location, setLocation] = useState(initial?.location ?? "");
  const [status, setStatus] = useState<Status>(initial?.status ?? "scheduled");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [durationHours, setDurationHours] = useState<MatchDurationHours>(
    (MATCH_DURATION_OPTIONS as readonly number[]).includes(
      initial?.durationHours ?? DEFAULT_MATCH_DURATION_HOURS,
    )
      ? ((initial?.durationHours ??
          DEFAULT_MATCH_DURATION_HOURS) as MatchDurationHours)
      : (DEFAULT_MATCH_DURATION_HOURS as MatchDurationHours),
  );
  // 쿼터 설정: duration_hours 별 최대 (1h=2, 2h=4, 3h=6, 4h=8). 사용자는 ≤ max 로 줄일 수 있음.
  const initialMaxQ = maxQuartersForDuration(
    initial?.durationHours ?? DEFAULT_MATCH_DURATION_HOURS,
  );
  const [totalQuarters, setTotalQuarters] = useState<number>(
    initial?.totalQuarters && initial.totalQuarters > 0
      ? Math.min(initial.totalQuarters, initialMaxQ)
      : initialMaxQ,
  );
  // 경기 타입별 게임 쿼터 기본 활동: 자체전 → intra, 상대전 → inter
  const defaultGameAction: QuarterAction = matchType === "intra" ? "intra" : "inter";
  // 길이는 항상 MAX_TOTAL_QUARTERS(8) 로 유지하되, 저장 시엔 앞쪽 totalQuarters 만 사용.
  const [quarterActions, setQuarterActions] = useState<
    (QuarterAction | null)[]
  >(() => {
    const src = initial?.quarterActions ?? null;
    const out: (QuarterAction | null)[] = [];
    // 신규 등록: 경기 타입 기본 활동으로 채움. 편집: 저장값 사용.
    for (let i = 0; i < 8; i++) {
      out.push(src ? src[i] ?? null : defaultGameAction);
    }
    return out;
  });
  const maxQuarters = maxQuartersForDuration(durationHours);
  // duration 변경 시 해당 시간의 최대 쿼터로 자동 설정. (초기 마운트는 저장값 보존)
  const quartersInitRef = useRef(false);
  useEffect(() => {
    if (!quartersInitRef.current) {
      quartersInitRef.current = true;
      return;
    }
    setTotalQuarters(maxQuarters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationHours]);
  // 경기 타입 변경 시: 게임 쿼터(자체전/상대전·미선택)는 새 기본값으로, 준비/훈련은 유지.
  const matchTypeInitRef = useRef(false);
  useEffect(() => {
    if (!matchTypeInitRef.current) {
      matchTypeInitRef.current = true;
      return;
    }
    const def: QuarterAction = matchType === "intra" ? "intra" : "inter";
    setQuarterActions((prev) =>
      prev.map((a) => (a === "warmup" || a === "training" ? a : def)),
    );
  }, [matchType]);
  const setQuarterAction = (idx: number, action: QuarterAction | null) => {
    setQuarterActions((prev) => {
      const next = [...prev];
      next[idx] = next[idx] === action ? null : action;
      return next;
    });
  };
  // 라벨 산출: warmup/training 쿼터는 각자 "준비"/"훈련" 으로 표시되고
  // 게임 쿼터 번호(Q1, Q2, …)에서 제외된다.
  const computeQuarterLabel = (idx: number): string => {
    const a = quarterActions[idx];
    if (a === "warmup") return "준비";
    if (a === "training") return "훈련";
    let nonGameBefore = 0;
    for (let i = 0; i < idx; i++) {
      const ai = quarterActions[i];
      if (ai === "warmup" || ai === "training") nonGameBefore += 1;
    }
    return `Q${idx + 1 - nonGameBefore}`;
  };
  // 투표 마감 모드 + 직접설정 값
  // 신규 등록 기본값: 직접 설정(경기일 2일 전 12:00)
  const [voteMode, setVoteMode] = useState<VoteMode>(() => {
    if (!initial?.voteDeadline) return "custom";
    const dl = `${isoToLocalDate(initial.voteDeadline)}T${isoToLocalTime(initial.voteDeadline)}`;
    const md = isoToLocalDate(initial.matchDate);
    const mt = isoToLocalTime(initial.matchDate);
    for (const off of [24, 6, 3, 1] as const) {
      if (shiftLocalDatetime(md, mt, off) === dl) return off;
    }
    return "custom";
  });
  const [customDeadline, setCustomDeadline] = useState<string>(() =>
    initial?.voteDeadline
      ? `${isoToLocalDate(initial.voteDeadline)}T${isoToLocalTime(initial.voteDeadline)}`
      : "",
  );
  // 직접설정 값을 사용자가 직접 만졌는지 (만지기 전엔 경기일 기준 자동 계산)
  const [customTouched, setCustomTouched] = useState(false);

  const opponentInputRef = useRef<HTMLInputElement>(null);

  const matchDate = date && time ? `${date}T${time}` : "";
  const effectiveOpponent = matchType === "intra" ? "자체전" : opponent;
  const finishTimeLabel = computeFinishTime(time, durationHours);

  // 계산된 투표 마감(datetime-local 문자열)
  const voteDeadline =
    voteMode === "custom"
      ? customDeadline
      : date && time
        ? shiftLocalDatetime(date, time, voteMode)
        : "";

  // 생성 모드일 때만 오늘 날짜 + 킥오프 06:00 기본값
  useEffect(() => {
    if (isEdit) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    setDate((cur) => cur || `${y}-${m}-${d}`);
    setTime((cur) => cur || "06:00");
  }, [isEdit]);

  // 신규 등록 + 직접설정 모드 + 사용자가 안 만진 경우:
  // 경기 날짜가 정해지면 마감을 '경기일 2일 전 12:00'으로 자동 설정/갱신
  useEffect(() => {
    if (isEdit) return;
    if (voteMode !== "custom") return;
    if (customTouched) return;
    if (!date) return;
    setCustomDeadline(defaultCustomDeadline(date));
  }, [isEdit, voteMode, customTouched, date]);

  const formAction =
    isEdit && matchId ? updateMatch.bind(null, matchId) : createMatch;
  const cancelHref = isEdit && matchId ? `/matches/${matchId}` : "/matches";
  const submitLabel = isEdit ? "저장" : "경기 등록";

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="opponent" value={effectiveOpponent} />
      <input type="hidden" name="match_date" value={matchDate} />
      <input type="hidden" name="location" value={location} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="notes" value={notes} />
      <input type="hidden" name="duration_hours" value={durationHours} />
      <input type="hidden" name="total_quarters" value={totalQuarters} />
      {Array.from({ length: totalQuarters }, (_, i) => (
        <input
          key={`qa-${i}`}
          type="hidden"
          name={`quarter_action_${i}`}
          value={quarterActions[i] ?? ""}
        />
      ))}
      <input type="hidden" name="vote_deadline" value={voteDeadline} />
      <input type="hidden" name="team_a_name" value={teamAName} />
      <input type="hidden" name="team_b_name" value={teamBName} />
      {/* 자체전은 색을 저장하지 않음 (DB null → 기본값 폴백) */}
      <input
        type="hidden"
        name="team_a_color"
        value={matchType === "vs" ? teamAColor : ""}
      />
      <input
        type="hidden"
        name="team_b_color"
        value={matchType === "vs" ? teamBColor : ""}
      />

      {/* 경기 유형 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-suaza-ink text-base font-medium">경기 유형</span>
          <span className="text-xs text-suaza-accent font-medium">필수</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MatchTypeCard
            selected={matchType === "intra"}
            onClick={() => setMatchType("intra")}
            icon="⚽"
            label="자체전"
            desc="우리끼리 경기"
          />
          <MatchTypeCard
            selected={matchType === "vs"}
            onClick={() => setMatchType("vs")}
            icon={
              <span className="inline-flex items-center justify-center border-[1.5px] border-current px-1.5 py-0 text-sm font-bold leading-tight">
                VS
              </span>
            }
            label="상대전"
            desc="다른 팀과 경기"
          />
        </div>
      </div>

      {/* VS preview */}
      <section className="bg-gray-50 rounded-xl p-4 sm:p-5">
        {matchType === "vs" ? (
          <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] gap-2 sm:gap-3 items-center">
            <TeamSide kind="us" name="SUAZA FC" />
            <JerseyPicker
              color={teamAColor}
              onChange={setTeamAColor}
              title="우리팀 상의 색상"
            />
            <span className="text-suaza-ink-muted font-bold text-sm">vs</span>
            <JerseyPicker
              color={teamBColor}
              onChange={setTeamBColor}
              title="상대팀 상의 색상"
            />
            <TeamSide
              kind="opponent"
              name={opponent}
              onEmptyClick={() => opponentInputRef.current?.focus()}
            />
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
            <TeamSide
              kind="letter"
              letter="A"
              color={DEFAULT_TEAM_COLOR.A}
              subtitle={previewTeamName(teamAName, "A팀")}
            />
            <span className="text-suaza-ink-muted font-bold text-sm">vs</span>
            <TeamSide
              kind="letter"
              letter="B"
              color={DEFAULT_TEAM_COLOR.B}
              subtitle={previewTeamName(teamBName, "B팀")}
            />
          </div>
        )}
      </section>

      {/* 팀 이름 — 자체전일 때만 */}
      {matchType === "intra" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="A팀 이름">
            <input
              type="text"
              value={teamAName}
              onChange={(e) => setTeamAName(e.target.value)}
              placeholder="예: 감독"
              maxLength={7}
              className={inputCls}
            />
          </Field>
          <Field label="B팀 이름">
            <input
              type="text"
              value={teamBName}
              onChange={(e) => setTeamBName(e.target.value)}
              placeholder="예: 회장"
              maxLength={7}
              className={inputCls}
            />
          </Field>
        </div>
      )}

      {/* 상대팀 — 상대전일 때만 */}
      {matchType === "vs" && (
        <Field label="상대팀" required>
          <input
            ref={opponentInputRef}
            type="text"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="예: 잼뱅이"
            required
            className={inputCls}
          />
          {recentOpponents.length > 0 && (
            <Suggestions
              label="자주 만난 팀"
              options={recentOpponents}
              onSelect={setOpponent}
              mobileLimit={2}
            />
          )}
        </Field>
      )}

      {/* 날짜 + 킥오프 */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="경기 날짜" hint="YYYY-MM-DD" required>
          {/* 모바일: 커스텀 달력 (화면 가득 차지 않음) */}
          <div className="desktop:hidden">
            <DatePicker value={date} onChange={setDate} required />
          </div>
          {/* 데스크탑: native input */}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={`${inputCls} hidden desktop:block`}
          />
        </Field>
        <Field label="킥오프 시간" hint="30분 단위" required>
          {/* 모바일: 커스텀 시간 픽커 */}
          <div className="desktop:hidden">
            <TimePicker
              value={time}
              onChange={setTime}
              options={TIME_OPTIONS}
              required
            />
          </div>
          {/* 데스크탑: native select */}
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            className={`${inputCls} bg-white hidden desktop:block`}
          >
            <option value="" disabled>
              시간 선택
            </option>
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* 경기 시간 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-suaza-ink text-base font-medium">경기 시간</span>
          <span className="text-xs text-suaza-accent font-medium">필수</span>
        </div>
        <DurationSegmented
          value={durationHours}
          onChange={setDurationHours}
          options={MATCH_DURATION_OPTIONS}
        />
        {finishTimeLabel && (
          <span className="text-xs text-suaza-ink-faint mt-1">
            종료 시간: {finishTimeLabel} (자동 계산)
          </span>
        )}
      </div>

      {/* 쿼터 설정 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-suaza-ink text-base font-medium">쿼터 설정</span>
          <span className="text-[11px] text-suaza-ink-muted bg-gray-100 px-2 py-0.5 rounded-md">
            최대 {maxQuarters}쿼터 ({durationHours}시간 기준)
          </span>
        </div>

        {/* 진행 쿼터 수 stepper */}
        <div className="flex items-center justify-between gap-2 rounded-lg bg-suaza-bg/60 px-3 py-2">
          <span className="text-sm text-suaza-ink">진행 쿼터 수</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setTotalQuarters((cur) => Math.max(1, cur - 1))
              }
              disabled={totalQuarters <= 1}
              className="w-8 h-8 rounded-md border border-suaza-border text-suaza-ink hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed font-bold"
              aria-label="쿼터 수 감소"
            >
              −
            </button>
            <span className="w-6 text-center text-lg font-bold text-suaza-ink tabular-nums">
              {totalQuarters}
            </span>
            <button
              type="button"
              onClick={() =>
                setTotalQuarters((cur) => Math.min(maxQuarters, cur + 1))
              }
              disabled={totalQuarters >= maxQuarters}
              className="w-8 h-8 rounded-md border border-suaza-border text-suaza-ink hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed font-bold"
              aria-label="쿼터 수 증가"
            >
              +
            </button>
            <span className="text-xs text-suaza-ink-muted">
              / 최대 {maxQuarters}
            </span>
          </div>
        </div>

        {/* 쿼터 인디케이터 (1..maxQuarters) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {Array.from({ length: maxQuarters }, (_, i) => {
            const active = i + 1 <= totalQuarters;
            return (
              <span
                key={i}
                className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-bold ${
                  active
                    ? "bg-suaza-button text-white"
                    : "bg-gray-100 text-suaza-ink-faint"
                }`}
              >
                {i + 1}
              </span>
            );
          })}
        </div>

        {/* 쿼터별 활동 선택 — 1..maxQuarters 까지 행으로 표시.
            활성 쿼터(≤ totalQuarters)만 클릭 가능. */}
        <div className="flex flex-col gap-2">
          {Array.from({ length: maxQuarters }, (_, i) => {
            const enabled = i + 1 <= totalQuarters;
            const selected = quarterActions[i] ?? null;
            return (
              <div
                key={`q-${i}`}
                className="flex items-center gap-2 py-1"
              >
                <span
                  className={`shrink-0 inline-flex items-center justify-center w-12 py-1 rounded-lg text-xs font-bold ${
                    enabled
                      ? "bg-suaza-button text-white"
                      : "bg-gray-200 text-suaza-ink-faint"
                  }`}
                >
                  {enabled ? computeQuarterLabel(i) : `Q${i + 1}`}
                </span>
                {enabled ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {QUARTER_ACTIONS.map((a) => {
                      const active = selected === a;
                      const color = QUARTER_ACTION_COLOR[a];
                      return (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setQuarterAction(i, a)}
                          aria-pressed={active}
                          className="text-xs font-medium px-3 py-1 rounded-lg border transition"
                          style={
                            active
                              ? {
                                  backgroundColor: color,
                                  borderColor: color,
                                  color: "white",
                                }
                              : {
                                  backgroundColor: "white",
                                  borderColor: "var(--suaza-border)",
                                  color: "var(--suaza-ink-muted)",
                                }
                          }
                        >
                          {QUARTER_ACTION_LABEL[a]}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <span className="text-xs text-suaza-ink-faint">
                    쿼터 수를 늘리면 활성화됩니다
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 장소 */}
      <Field label="장소" required>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="예: 수원공고"
          required
          className={inputCls}
        />
        {recentLocations.length > 0 && (
          <Suggestions
            label="최근 장소"
            options={recentLocations}
            onSelect={setLocation}
            mobileLimit={2}
          />
        )}
      </Field>

      {/* 투표 마감 */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-suaza-ink text-base font-medium">투표 마감</span>
          <span className="text-suaza-ink-faint text-xs">경기 시작 기준</span>
        </div>
        <div className="bg-gray-100 rounded-xl p-1 grid grid-cols-5 gap-1">
          {VOTE_TABS.map((t) => {
            const on = voteMode === t.value;
            return (
              <button
                key={String(t.value)}
                type="button"
                onClick={() => setVoteMode(t.value)}
                className={`h-10 rounded-lg text-xs desktop:text-sm font-bold transition ${
                  on
                    ? "bg-suaza-accent text-white shadow-sm"
                    : "text-suaza-ink-muted hover:text-suaza-ink"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {(() => {
          // 프리셋(1·3·6·24시간 전)이면 voteDeadline 이 계산값, custom 이면 customDeadline
          const [dlDate, dlTime] = (voteDeadline || "").split("T");
          // 피커 변경 시 자동으로 "직접 설정" 모드로 전환
          const setDlDate = (v: string) => {
            setVoteMode("custom");
            setCustomDeadline(v ? `${v}T${dlTime || ""}` : "");
            setCustomTouched(true);
          };
          const setDlTime = (v: string) => {
            setVoteMode("custom");
            setCustomDeadline(`${dlDate || ""}T${v}`);
            setCustomTouched(true);
          };
          return (
            <div className="grid grid-cols-2 gap-3">
              {/* 마감 날짜 */}
              <div className="desktop:hidden">
                <DatePicker
                  value={dlDate || ""}
                  onChange={setDlDate}
                  placeholder="마감 날짜"
                />
              </div>
              <input
                type="date"
                value={dlDate || ""}
                onChange={(e) => setDlDate(e.target.value)}
                className={`${inputCls} hidden desktop:block`}
              />
              {/* 마감 시간 */}
              <div className="desktop:hidden">
                <TimePicker
                  value={dlTime || ""}
                  onChange={setDlTime}
                  options={TIME_OPTIONS}
                  placeholder="마감 시간"
                />
              </div>
              <select
                value={dlTime || ""}
                onChange={(e) => setDlTime(e.target.value)}
                className={`${inputCls} bg-white hidden desktop:block`}
              >
                <option value="" disabled>
                  시간 선택
                </option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          );
        })()}
        {voteDeadline ? (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-50 text-sm flex-wrap">
            <span aria-hidden>🔔</span>
            <span className="font-bold text-blue-600">
              {formatDeadlineLabel(voteDeadline)} 마감
            </span>
            {time && (
              <span className="text-suaza-ink-muted">
                · 경기 {time} 시작 기준
              </span>
            )}
          </div>
        ) : (
          <div className="px-3 py-2.5 rounded-lg bg-gray-50 text-sm text-suaza-ink-faint">
            {voteMode === "custom"
              ? "마감 일시를 직접 선택해 주세요"
              : "경기 날짜·시간을 먼저 입력하면 마감 시각이 표시됩니다"}
          </div>
        )}
      </div>

      {/* 경기 상태 — 새 경기 등록이므로 예정만 가능 */}
      <div className="flex flex-col gap-2">
        <span className="text-suaza-ink text-base font-medium">경기 상태</span>
        <div className="grid grid-cols-2 desktop:grid-cols-4 gap-2">
          {STATUS_OPTS.map((opt) => {
            const on = status === opt.value;
            const disabled = !isEdit && opt.value !== "scheduled";
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setStatus(opt.value)}
                style={
                  on
                    ? {
                        borderColor: opt.color,
                        backgroundColor: `${opt.color}14`,
                      }
                    : undefined
                }
                className={`flex flex-col items-center justify-center gap-1 py-3 rounded-lg border-2 transition ${
                  on
                    ? ""
                    : disabled
                      ? "border-suaza-border bg-gray-50 opacity-50 cursor-not-allowed"
                      : "border-suaza-border bg-white hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: opt.color }}
                  />
                  <span
                    className={`font-bold ${
                      on ? "text-suaza-ink" : "text-suaza-ink-muted"
                    }`}
                  >
                    {opt.label}
                  </span>
                </span>
                <span className="hidden pointer-fine:block text-[11px] text-suaza-ink-faint">
                  {opt.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 메모 */}
      <Field label="메모" tag="선택">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="유니폼 컬러, 사전 미팅, 회비 정산 등"
          className={`${inputCls} resize-none`}
        />
      </Field>

      {/* 버튼 */}
      <div className="flex gap-2 mt-2">
        <Link
          href={cancelHref}
          className="flex-1 h-[52px] rounded-lg bg-gray-100 text-suaza-ink-muted text-base font-medium flex items-center justify-center hover:bg-gray-200 transition"
        >
          취소
        </Link>
        <button
          type="submit"
          className="flex-1 h-[52px] rounded-lg bg-suaza-accent text-white text-base font-medium hover:opacity-90 transition"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink placeholder:text-suaza-placeholder focus:outline-none focus:border-suaza-button";

// 상의 유니폼 SVG (단색)
function Jersey({ color }: { color: string }) {
  const isLight = isLightColor(color);
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-full h-full"
      fill={color}
      stroke={isLight ? "#737a8c" : "rgba(0,0,0,0.25)"}
      strokeWidth={isLight ? 0.6 : 0.4}
      strokeLinejoin="round"
    >
      <path d="M9 3 L6 4 L3 7 L4 10.5 L7 10 L7 21 L17 21 L17 10 L20 10.5 L21 7 L18 4 L15 3 L14 4.5 L12 5 L10 4.5 Z" />
    </svg>
  );
}

function isLightColor(hex: string): boolean {
  const m = hex.match(/^#([0-9A-Fa-f]{6})$/);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // 밝기 (Rec. 601 luma) > 230 → 밝은 색
  return 0.299 * r + 0.587 * g + 0.114 * b > 230;
}

// 20 대표 색상 (한글 라벨 포함)
const PRESET_COLORS: { hex: string; name: string }[] = [
  { hex: "#EF4444", name: "빨강" },
  { hex: "#991B1B", name: "진홍" },
  { hex: "#EC4899", name: "분홍" },
  { hex: "#F97316", name: "주황" },
  { hex: "#B45309", name: "황토" },
  { hex: "#EAB308", name: "노랑" },
  { hex: "#84CC16", name: "라임" },
  { hex: "#22C55E", name: "초록" },
  { hex: "#15803D", name: "짙초록" },
  { hex: "#14B8A6", name: "청록" },
  { hex: "#67E8F9", name: "민트" },
  { hex: "#38BDF8", name: "하늘" },
  { hex: "#3B82F6", name: "파랑" },
  { hex: "#1D4ED8", name: "코발트" },
  { hex: "#1E3A8A", name: "남색" },
  { hex: "#8B5CF6", name: "보라" },
  { hex: "#6B21A8", name: "자주" },
  { hex: "#1F2937", name: "검정" },
  { hex: "#6B7280", name: "회색" },
  { hex: "#FFFFFF", name: "흰색" },
];

function findColorName(hex: string): string {
  const lower = hex.toLowerCase();
  return (
    PRESET_COLORS.find((c) => c.hex.toLowerCase() === lower)?.name ??
    "사용자 정의"
  );
}

// 유니폼 클릭 → 색상 모달
function JerseyPicker({
  color,
  onChange,
  title,
}: {
  color: string;
  onChange: (c: string) => void;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center gap-0.5 hover:scale-105 transition cursor-pointer"
        aria-label={title}
      >
        <span className="text-[10px] text-suaza-ink-muted">
          {findColorName(color)}
        </span>
        <span className="block w-10 h-10 sm:w-12 sm:h-12">
          <Jersey color={color} />
        </span>
      </button>
      {open && (
        <ColorPickerModal
          initialColor={color}
          title={title}
          onClose={() => setOpen(false)}
          onApply={(c) => {
            onChange(c);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

// 색상 선택 모달 (대표 12색 + 직접 입력)
function ColorPickerModal({
  initialColor,
  title,
  onClose,
  onApply,
}: {
  initialColor: string;
  title: string;
  onClose: () => void;
  onApply: (c: string) => void;
}) {
  const [preview, setPreview] = useState(initialColor);

  // ESC 키 닫기
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 모달 열려있는 동안 body 스크롤 잠금
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div className="w-12 h-12 shrink-0">
            <Jersey color={preview} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-suaza-ink">{title}</h3>
            <p className="text-xs text-suaza-ink-muted truncate">
              현재 · {findColorName(preview)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-suaza-ink-muted flex items-center justify-center text-xl shrink-0"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* 12색 그리드 */}
        <div className="grid grid-cols-5 gap-3 px-5 pb-3">
          {PRESET_COLORS.map((c) => {
            const selected = c.hex.toLowerCase() === preview.toLowerCase();
            const lightBg = isLightColor(c.hex);
            return (
              <button
                key={c.hex}
                type="button"
                onClick={() => setPreview(c.hex)}
                className="flex flex-col items-center gap-1 group"
              >
                <div
                  className={`relative w-12 h-12 rounded-full transition ${
                    selected
                      ? "ring-2 ring-suaza-ink ring-offset-2"
                      : "group-hover:scale-110"
                  } ${lightBg ? "border border-suaza-border" : ""}`}
                  style={{ backgroundColor: c.hex }}
                >
                  {selected && (
                    <svg
                      className={`absolute inset-0 m-auto w-6 h-6 ${
                        lightBg ? "text-suaza-ink" : "text-white"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span
                  className={`text-xs ${
                    selected
                      ? "font-bold text-suaza-ink"
                      : "text-suaza-ink-muted"
                  }`}
                >
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>


        {/* 푸터: 취소 / 적용 */}
        <div className="flex gap-2 px-5 pb-5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-lg border border-suaza-border text-suaza-ink font-medium hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onApply(preview)}
            className="flex-1 py-3 rounded-lg bg-suaza-accent text-white font-bold hover:opacity-90 inline-flex items-center justify-center gap-1.5"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            적용
          </button>
        </div>
      </div>
    </div>
  );
}

// 자체전 팀명 미리보기: 입력값에 "팀" 접미사 자동 부착, 비어있으면 기본값
function previewTeamName(input: string, fallback: string): string {
  const t = input.trim();
  if (!t) return fallback;
  return t.endsWith("팀") ? t : `${t}팀`;
}

function computeFinishTime(time: string, hours: number): string {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const endH = (h + hours) % 24;
  return `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function DurationSegmented({
  value,
  onChange,
  options,
}: {
  value: MatchDurationHours;
  onChange: (v: MatchDurationHours) => void;
  options: readonly MatchDurationHours[];
}) {
  const index = options.indexOf(value);
  const count = options.length;
  return (
    <div
      className="relative bg-gray-100 rounded-xl p-1 grid gap-0"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute top-1 bottom-1 rounded-lg bg-suaza-accent shadow-sm transition-all duration-200 ease-out"
        style={{
          width: `calc((100% - 0.5rem) / ${count})`,
          left: `calc(0.25rem + ${index} * ((100% - 0.5rem) / ${count}))`,
        }}
      />
      {options.map((opt) => {
        const on = opt === value;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`relative z-10 h-11 rounded-lg text-sm font-bold inline-flex items-center justify-center transition-colors ${
              on ? "text-white" : "text-suaza-ink-muted"
            }`}
          >
            {opt}시간
          </button>
        );
      })}
    </div>
  );
}

// 저장된 절대 시각(UTC ISO)을 단말 타임존과 무관하게 서울(KST) 기준으로 분해.
function kstParts(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function isoToLocalDate(iso: string): string {
  const p = kstParts(iso);
  return p ? `${p.year}-${p.month}-${p.day}` : "";
}

function isoToLocalTime(iso: string): string {
  const p = kstParts(iso);
  return p ? `${p.hour}:${p.minute}` : "";
}

function MatchTypeCard({
  selected,
  onClick,
  icon,
  label,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1.5 py-5 rounded-xl border-2 transition ${
        selected
          ? "border-suaza-accent bg-red-50 text-suaza-accent"
          : "border-suaza-border bg-white text-suaza-ink hover:bg-gray-50"
      }`}
    >
      <span className="text-2xl">{icon}</span>
      <span className="font-bold text-base">{label}</span>
      <span
        className={`text-xs ${
          selected ? "text-suaza-accent" : "text-suaza-ink-faint"
        }`}
      >
        {desc}
      </span>
    </button>
  );
}

type TeamSideProps =
  | { kind: "us"; name: string }
  | { kind: "opponent"; name: string; onEmptyClick?: () => void }
  | { kind: "letter"; letter: "A" | "B"; color: string; subtitle?: string };

function TeamSide(props: TeamSideProps) {
  if (props.kind === "us") {
    return (
      <div className="flex flex-col items-center gap-2 py-2">
        <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden bg-white">
          <Image
            src="/suaza-emblem.png"
            alt="SUAZA FC"
            fill
            sizes="56px"
            className="object-cover"
          />
        </div>
        <span className="text-sm sm:text-base font-bold text-suaza-ink text-center">
          SUAZA FC
        </span>
      </div>
    );
  }

  if (props.kind === "letter") {
    return (
      <div className="flex flex-col items-center gap-2 py-2">
        <div
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center"
          style={{ backgroundColor: props.color }}
        >
          <span className="text-2xl sm:text-3xl font-bold text-white">
            {props.letter}
          </span>
        </div>
        <span className="text-sm sm:text-base font-bold text-suaza-ink text-center break-keep">
          {props.subtitle ?? `${props.letter}팀`}
        </span>
      </div>
    );
  }

  // opponent
  const trimmed = props.name.trim();
  if (!trimmed) {
    return (
      <button
        type="button"
        onClick={props.onEmptyClick}
        className="flex flex-col items-center gap-2 py-2 cursor-pointer hover:opacity-80 transition"
      >
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-dashed border-gray-300" />
        <span className="text-sm sm:text-base font-bold text-suaza-ink-faint">
          상대팀 입력
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gray-200 flex items-center justify-center">
        <span className="text-xl sm:text-2xl font-bold text-suaza-ink">
          {trimmed.charAt(0)}
        </span>
      </div>
      <span className="text-sm sm:text-base font-bold text-suaza-ink text-center break-all">
        {trimmed}
      </span>
    </div>
  );
}

function Field({
  label,
  hint,
  tag,
  required,
  children,
}: {
  label: string;
  hint?: string;
  tag?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-suaza-ink text-base font-medium">{label}</span>
        {required && (
          <span className="text-xs text-suaza-accent font-medium">필수</span>
        )}
        {tag && <span className="text-xs text-suaza-ink-faint">{tag}</span>}
      </div>
      {hint && <span className="text-xs text-suaza-ink-faint -mt-0.5">{hint}</span>}
      {children}
    </div>
  );
}

function Suggestions({
  label,
  options,
  onSelect,
  mobileLimit,
}: {
  label: string;
  options: string[];
  onSelect: (v: string) => void;
  mobileLimit: number;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs mt-1">
      <span className="text-suaza-ink-faint">{label}</span>
      {options.map((opt, i) => (
        <button
          type="button"
          key={opt}
          onClick={() => onSelect(opt)}
          className={`px-3 py-1 rounded-full border border-suaza-border text-suaza-ink-muted hover:bg-gray-50 transition ${
            i >= mobileLimit ? "hidden sm:inline-flex" : ""
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
