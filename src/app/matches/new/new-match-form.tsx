"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createMatch, updateMatch } from "@/lib/matches/actions";
import {
  DEFAULT_MATCH_DURATION_HOURS,
  MATCH_DURATION_OPTIONS,
  type MatchDurationHours,
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
      <input type="hidden" name="vote_deadline" value={voteDeadline} />

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
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
          {matchType === "vs" ? (
            <>
              <TeamSide kind="us" name="SUAZA FC" />
              <span className="text-suaza-ink-muted font-bold text-sm">vs</span>
              <TeamSide
                kind="opponent"
                name={opponent}
                onEmptyClick={() => opponentInputRef.current?.focus()}
              />
            </>
          ) : (
            <>
              <TeamSide kind="letter" letter="A" color="#EF3E3E" />
              <span className="text-suaza-ink-muted font-bold text-sm">vs</span>
              <TeamSide kind="letter" letter="B" color="#338CF2" />
            </>
          )}
        </div>
      </section>

      {/* 상대팀 — 상대전일 때만 */}
      {matchType === "vs" && (
        <Field label="상대팀">
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
        <Field label="경기 날짜" hint="YYYY-MM-DD">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={inputCls}
          />
        </Field>
        <Field label="킥오프 시간" hint="30분 단위">
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            className={`${inputCls} bg-white`}
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

      {/* 장소 */}
      <Field label="장소">
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="예: 수원공고"
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
        {voteMode === "custom" && (
          <input
            type="datetime-local"
            value={customDeadline}
            onChange={(e) => {
              setCustomDeadline(e.target.value);
              setCustomTouched(true);
            }}
            className={inputCls}
          />
        )}
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
    <div className="relative bg-gray-100 rounded-xl p-1 grid grid-cols-4 gap-0">
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
            className={`relative z-10 h-11 rounded-lg text-sm font-bold transition-colors ${
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
  | { kind: "letter"; letter: "A" | "B"; color: string };

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
        <span className="text-sm sm:text-base font-bold text-suaza-ink">
          {props.letter}팀
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
  children,
}: {
  label: string;
  hint?: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-suaza-ink text-base font-medium">{label}</span>
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
