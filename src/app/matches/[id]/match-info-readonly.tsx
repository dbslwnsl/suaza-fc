import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_TEAM_COLOR,
  DEFAULT_VS_COLOR,
  formatDurationLabel,
  getTeamName,
  isQuarterAction,
  type Match,
} from "@/lib/matches/helpers";
import { TITLE_LABEL, type MemberTitle } from "@/lib/members/positions";

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function kstParts(iso: string) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayShort = get("weekday");
  const map: Record<string, string> = {
    Sun: "일", Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토",
  };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: map[weekdayShort] ?? weekdayShort,
    hour: get("hour"),
    minute: get("minute"),
  };
}

function formatEndTime(iso: string, hours: number): string {
  const end = new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000);
  const p = kstParts(end.toISOString());
  return `${p.hour}:${p.minute}`;
}

function formatCreatedAt(iso: string): string {
  const p = kstParts(iso);
  const h = Number(p.hour);
  const ampm = h < 12 ? "오전" : "오후";
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${p.month}/${p.day} ${ampm} ${hh}:${p.minute}`;
}

const STATUS_META: Record<
  Match["status"],
  { label: string; bg: string; fg: string; dot: string }
> = {
  scheduled: { label: "예정", bg: "#EFF6FF", fg: "#1D4ED8", dot: "#3B82F6" },
  in_progress: { label: "진행중", bg: "#FFFBEB", fg: "#B45309", dot: "#F59E0B" },
  done: { label: "종료", bg: "#EFF6FF", fg: "#1D4ED8", dot: "#3B82F6" },
  canceled: { label: "취소", bg: "#FEF2F2", fg: "#B91C1C", dot: "#EF4444" },
};

// hex 색상의 밝기 판단 (Rec. 601 luma > 200 이면 밝은 색)
function isLightHex(hex: string): boolean {
  const m = hex.match(/^#([0-9A-Fa-f]{6})$/);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b > 200;
}

/**
 * 종료/취소 경기 — 경기 정보 조회용. 4개 카드(VS / 장소 / 쿼터 구성 / 메모) 구성.
 * 등록자 정보(이름/직책)는 created_by 기반으로 자체 조회.
 */
export default async function MatchInfoReadonly({ match }: { match: Match }) {
  let creatorName: string | null = null;
  let creatorTitle: string | null = null;
  if (match.created_by) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("name, title")
      .eq("id", match.created_by)
      .maybeSingle();
    creatorName = data?.name ?? null;
    const t = data?.title as MemberTitle | null | undefined;
    creatorTitle = t && t !== "player" ? TITLE_LABEL[t] : null;
  }

  const isIntra = match.opponent === "자체전";
  const status = STATUS_META[match.status];
  const p = kstParts(match.match_date);
  const quarterActions = (match.quarter_actions ?? []) as (string | null)[];
  const total = match.total_quarters ?? 0;
  // 자체전(intra) / 훈련(training) / 준비운동(warmup) / 상대전(inter) 등 카운트
  const actionCounts = quarterActions.reduce<Record<string, number>>(
    (acc, a) => {
      if (a && isQuarterAction(a)) acc[a] = (acc[a] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 1) VS 카드 */}
      <section className="bg-white rounded-2xl border border-suaza-border p-5 desktop:p-6 flex flex-col gap-4">
        <div className="flex items-center justify-center gap-2">
          <StatusBadge
            label={status.label}
            bg={status.bg}
            fg={status.fg}
            dot={status.dot}
          />
          <TypeBadge isIntra={isIntra} />
        </div>

        <div className="grid grid-cols-3 items-center gap-3">
          {isIntra ? (
            <>
              <TeamCircle
                letter="A"
                name={getTeamName(match, "A")}
                color={match.team_a_color ?? DEFAULT_TEAM_COLOR.A}
              />
              <span className="text-center text-suaza-ink-muted text-base font-bold">
                VS
              </span>
              <TeamCircle
                letter="B"
                name={getTeamName(match, "B")}
                color={match.team_b_color ?? DEFAULT_TEAM_COLOR.B}
              />
            </>
          ) : (
            <>
              <UsCircle
                uniformColor={match.team_a_color ?? DEFAULT_VS_COLOR.A}
              />
              <span className="text-center text-suaza-ink-muted text-base font-bold">
                VS
              </span>
              <OpponentCircle
                name={match.opponent}
                color={match.team_b_color ?? DEFAULT_VS_COLOR.B}
              />
            </>
          )}
        </div>

        <div className="border-t border-suaza-border pt-4 grid grid-cols-3 gap-3 text-sm">
          <InfoItem
            label="날짜"
            value={`${p.month}월 ${p.day}일 (${p.weekday})`}
          />
          <InfoItem label="시작" value={`${p.hour}:${p.minute}`} />
          <InfoItem
            label="경기 시간"
            value={
              match.duration_hours != null
                ? formatDurationLabel(match.duration_hours)
                : "—"
            }
          />
        </div>
        {match.duration_hours != null && (
          <p className="text-xs text-suaza-ink-faint -mt-2">
            종료 {formatEndTime(match.match_date, match.duration_hours)} (자동
            계산)
          </p>
        )}
      </section>

      {/* 2) 장소 카드 */}
      {match.location && (
        <section className="bg-white rounded-2xl border border-suaza-border p-5 desktop:p-6 flex flex-col gap-2">
          <h3 className="text-sm font-bold text-suaza-ink inline-flex items-center gap-1.5">
            <span aria-hidden>📍</span> 장소
          </h3>
          <p className="text-xl font-bold text-suaza-ink">
            {match.location}
          </p>
        </section>
      )}

      {/* 3) 쿼터 구성 카드 */}
      {total > 0 && (
        <section className="bg-white rounded-2xl border border-suaza-border p-5 desktop:p-6 flex flex-col gap-3">
          <h3 className="text-sm font-bold text-suaza-ink inline-flex items-center gap-1.5">
            <span aria-hidden>⏱️</span> 쿼터 구성
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <QuarterStat label="총 쿼터" value={total} />
            {actionCounts.intra != null && (
              <QuarterStat label="자체전" value={actionCounts.intra} />
            )}
            {actionCounts.inter != null && (
              <QuarterStat label="상대전" value={actionCounts.inter} />
            )}
            {actionCounts.training != null && (
              <QuarterStat label="훈련" value={actionCounts.training} />
            )}
            {actionCounts.warmup != null && (
              <QuarterStat label="준비운동" value={actionCounts.warmup} />
            )}
          </div>
        </section>
      )}

      {/* 4) 메모 카드 */}
      {match.notes && (
        <section className="bg-white rounded-2xl border border-suaza-border p-5 desktop:p-6 flex flex-col gap-2">
          <h3 className="text-sm font-bold text-suaza-ink inline-flex items-center gap-1.5">
            <span aria-hidden>📝</span> 메모
          </h3>
          <p className="text-sm text-suaza-ink whitespace-pre-wrap leading-relaxed">
            {match.notes}
          </p>
        </section>
      )}

      {/* 등록 정보 */}
      <p className="text-xs text-suaza-ink-faint px-1">
        등록 · {creatorTitle ? `${creatorTitle} ` : ""}
        {creatorName ?? "—"} · {formatCreatedAt(match.created_at)}
      </p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Sub components
// ───────────────────────────────────────────────────────────

function StatusBadge({
  label,
  bg,
  fg,
  dot,
}: {
  label: string;
  bg: string;
  fg: string;
  dot: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold"
      style={{ backgroundColor: bg, color: fg }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: dot }}
      />
      {label}
    </span>
  );
}

function TypeBadge({ isIntra }: { isIntra: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold"
      style={{
        backgroundColor: isIntra ? "#FEF2F2" : "#FFF7ED",
        color: "#EF3E3E",
      }}
    >
      <span aria-hidden>{isIntra ? "⚽" : "🆚"}</span>
      {isIntra ? "자체전" : "상대전"}
    </span>
  );
}

function TeamCircle({
  letter,
  name,
  color,
}: {
  letter: "A" | "B";
  name: string;
  color: string;
}) {
  const textCls = isLightHex(color) ? "text-suaza-ink" : "text-white";
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-20 h-20 desktop:w-24 desktop:h-24 rounded-full flex items-center justify-center shadow"
        style={{ backgroundColor: color }}
      >
        <span className={`text-3xl font-bold ${textCls}`}>{letter}</span>
      </div>
      <span className="text-base font-bold text-suaza-ink">{name}</span>
    </div>
  );
}

function UsCircle({ uniformColor }: { uniformColor: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-20 h-20 desktop:w-24 desktop:h-24 rounded-full overflow-hidden bg-white shadow">
        <Image
          src="/suaza-emblem.png"
          alt="SUAZA FC"
          fill
          sizes="96px"
          className="object-cover"
        />
      </div>
      <span className="text-base font-bold text-suaza-ink">SUAZA FC</span>
      <JerseyMini color={uniformColor} />
    </div>
  );
}

function OpponentCircle({ name, color }: { name: string; color: string }) {
  const trimmed = (name ?? "").trim();
  const textCls = isLightHex(color) ? "text-suaza-ink" : "text-white";
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-20 h-20 desktop:w-24 desktop:h-24 rounded-full flex items-center justify-center shadow"
        style={{ backgroundColor: color }}
      >
        <span className={`text-3xl font-bold ${textCls}`}>
          {trimmed.charAt(0) || "?"}
        </span>
      </div>
      <span className="text-base font-bold text-suaza-ink text-center break-all">
        {trimmed || "(상대팀)"}
      </span>
      <JerseyMini color={color} />
    </div>
  );
}

function JerseyMini({ color }: { color: string }) {
  const isLight = isLightHex(color);
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-5 h-5"
      fill={color}
      stroke={isLight ? "#737a8c" : "rgba(0,0,0,0.25)"}
      strokeWidth={isLight ? 0.6 : 0.4}
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 3 L6 4 L3 7 L4 10.5 L7 10 L7 21 L17 21 L17 10 L20 10.5 L21 7 L18 4 L15 3 L14 4.5 L12 5 L10 4.5 Z" />
    </svg>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-suaza-ink-muted">{label}</span>
      <span className="text-base font-bold text-suaza-ink tabular-nums">
        {value}
      </span>
    </div>
  );
}

function QuarterStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-suaza-bg rounded-xl px-3 py-2.5 flex flex-col gap-1">
      <span className="text-xs text-suaza-ink-muted">{label}</span>
      <span className="text-2xl font-bold text-suaza-ink tabular-nums inline-flex items-baseline gap-1">
        {value}
        <span className="text-xs font-bold text-suaza-ink-muted">Q</span>
      </span>
    </div>
  );
}
