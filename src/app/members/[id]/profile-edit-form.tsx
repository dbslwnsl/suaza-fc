"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  FOOT_LABEL,
  POSITIONS,
  POSITION_LABEL,
  PREFERRED_FEET,
  TITLE_BADGE,
  TITLE_LABEL,
  type MemberTitle,
  type Position,
  type PreferredFoot,
} from "@/lib/members/positions";
import { updateProfile } from "./actions";

type Initial = {
  name: string;
  nickname: string | null;
  positions: Position[];
  jersey_number: number | null;
  birth_date: string | null;
  preferred_foot: PreferredFoot | null;
  is_injured: boolean;
  on_leave: boolean;
  title: MemberTitle;
};

export default function ProfileEditForm({
  profileId,
  initial,
  email,
  avatar,
  stats,
  readonly = false,
}: {
  profileId: string;
  initial: Initial;
  /** 표시용 이메일 (수정 불가) */
  email: string | null;
  /** 상단 카드 아바타 (AvatarUpload) — 서버에서 주입 */
  avatar: React.ReactNode;
  /** 상단 카드 하단 통계 그리드 — 서버에서 주입 */
  stats?: React.ReactNode;
  /** true 면 동일 레이아웃을 비편집(읽기 전용)으로 렌더 — 다른 회원이 볼 때 */
  readonly?: boolean;
}) {
  // 별명/등번호/생년월일/상태는 상단 카드에서 인라인 편집(본인만).
  // 이름·직책은 표시 전용.
  const [nickname, setNickname] = useState(initial.nickname ?? "");
  const [jersey, setJersey] = useState(
    initial.jersey_number != null ? String(initial.jersey_number) : "",
  );
  const [birth, setBirth] = useState(initial.birth_date ?? "");
  // 포지션: 주(primary) / 부(secondary) 각각 한 개씩
  const [primary, setPrimary] = useState<Position | null>(
    initial.positions[0] ?? null,
  );
  const [secondary, setSecondary] = useState<Position | null>(
    initial.positions[1] ?? null,
  );
  const [activeSlot, setActiveSlot] = useState<"primary" | "secondary">(
    "primary",
  );
  const positions = useMemo(
    () => [primary, secondary].filter((p): p is Position => p != null),
    [primary, secondary],
  );
  const [foot, setFoot] = useState<PreferredFoot | null>(
    initial.preferred_foot,
  );
  const [injured, setInjured] = useState(initial.is_injured);
  const [onLeave, setOnLeave] = useState(initial.on_leave);

  const title = initial.title;

  const isDirty = useMemo(() => {
    if (nickname.trim() !== (initial.nickname ?? "")) return true;
    if (jersey.trim() !== String(initial.jersey_number ?? "")) return true;
    if (birth.trim() !== (initial.birth_date ?? "")) return true;
    if (foot !== initial.preferred_foot) return true;
    if (injured !== initial.is_injured) return true;
    if (onLeave !== initial.on_leave) return true;
    // 순서(주/부)가 의미를 가지므로 정렬 없이 비교
    if (positions.length !== initial.positions.length) return true;
    if (positions.some((p, i) => p !== initial.positions[i])) return true;
    return false;
  }, [nickname, jersey, birth, foot, injured, onLeave, positions, initial]);

  // 필수: 등번호, 생년월일, 주포지션, 주발 (이름은 가입 시 값 유지)
  const requiredValid =
    jersey.trim().length > 0 &&
    birth.trim().length > 0 &&
    primary != null &&
    foot != null;
  const canSave = isDirty && requiredValid;

  // 카드 클릭 → 현재 단계(주/부)에 배정. 같은 칸 재선택 시 해제.
  const pickPosition = (p: Position) => {
    if (activeSlot === "primary") {
      if (primary === p) {
        setPrimary(null);
        return;
      }
      setPrimary(p);
      if (secondary === p) setSecondary(null); // 주·부 중복 방지
      if (!secondary || secondary === p) setActiveSlot("secondary");
    } else {
      if (primary === p) return; // 주포지션과 동일 선택 불가
      setSecondary((cur) => (cur === p ? null : p));
    }
  };

  // 카드 + 포지션 + 주발 (편집/읽기 공통 레이아웃)
  const sections = (
    <>
      {/* 상단 신원 카드 */}
      <section className="rounded-2xl border border-suaza-border p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3 sm:gap-5 min-w-0">
          {/* 아바타 + 직책(아바타 중앙 하단 뱃지) */}
          <div className="relative shrink-0">
            {avatar}
            <span
              className={`absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 z-10 whitespace-nowrap text-[11px] leading-none px-2 py-1 rounded-full ring-2 ring-white shadow-sm ${TITLE_BADGE[title] ?? TITLE_BADGE.player}`}
            >
              {TITLE_LABEL[title] ?? title}
            </span>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {/* 1행: 이름 + 생년월일 / 등번호(우측) — 좁으면 줄바꿈 */}
            <div className="flex items-baseline gap-x-2 gap-y-1 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold text-suaza-ink">
                {initial.name}
              </h1>
              <InlineEditable
                type="number"
                value={jersey}
                onCommit={setJersey}
                readonly={readonly}
                min={0}
                max={99}
                ariaLabel="등번호 수정"
                renderDisplay={(v) => (
                  <span className="font-bold" style={{ color: "#338CF2" }}>
                    #{v || "--"}
                  </span>
                )}
                displayClassName="text-sm hover:opacity-70 transition"
                inputClassName={`${inlineInputCls} w-[60px] text-center`}
              />
              <InlineEditable
                type="date"
                value={birth}
                onCommit={setBirth}
                readonly={readonly}
                ariaLabel="생년월일 수정"
                renderDisplay={(v) => (v ? formatBirth(v) : "생년월일 입력")}
                displayClassName="ml-auto text-xs text-suaza-ink-faint hover:text-suaza-ink-muted transition whitespace-nowrap"
                inputClassName={`${inlineInputCls} w-[150px] ml-auto`}
              />
            </div>

            {/* 2행: 이메일 */}
            {email && (
              <p className="text-xs sm:text-sm text-suaza-ink-muted truncate">
                {email}
              </p>
            )}

            {/* 3행: 별명 위 / 부상·장기불참 아래 (본인만 편집) */}
            <div className="flex flex-col items-start gap-2">
              <InlineEditable
                type="text"
                value={nickname}
                onCommit={(v) => setNickname(v.slice(0, 6))}
                readonly={readonly}
                maxLength={6}
                placeholder="별명"
                ariaLabel="별명 수정"
                renderDisplay={(v) => (
                  <span className="inline-flex items-center gap-1 font-medium text-suaza-ink">
                    {v || (readonly ? "—" : "별명 추가")}
                    {!readonly && <span aria-hidden>✏️</span>}
                  </span>
                )}
                displayClassName="px-2.5 py-1 rounded-full border border-suaza-border text-xs hover:bg-gray-50 transition"
                inputClassName={`${inlineInputCls} w-[120px]`}
              />
              <div className="flex items-center gap-2">
                <StatusPill
                  label="부상"
                  active={injured}
                  onColor="#EF3E3E"
                  onBg="rgba(239,62,62,0.10)"
                  readonly={readonly}
                  onClick={() => setInjured((v) => !v)}
                />
                <StatusPill
                  label="장기불참"
                  active={onLeave}
                  onColor="#1F2937"
                  onBg="rgba(31,41,55,0.08)"
                  readonly={readonly}
                  onClick={() => setOnLeave((v) => !v)}
                />
              </div>
            </div>
          </div>
        </div>

        {stats && (
          <>
            <div className="h-px bg-suaza-border" />
            {stats}
          </>
        )}
      </section>

      {/* 포지션 (주/부 각각 선택) */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-suaza-ink text-base font-medium">포지션</span>
          {!readonly && (
            <span className="text-suaza-accent text-xs font-medium">*</span>
          )}
        </div>

        {/* 단계 탭 + 안내 — 편집 모드에서만 */}
        {!readonly && (
          <>
            <div className="flex items-center gap-2">
              <StepTab
                n={1}
                label="주포지션"
                value={primary}
                active={activeSlot === "primary"}
                onClick={() => setActiveSlot("primary")}
              />
              <span className="text-suaza-ink-faint shrink-0">›</span>
              <StepTab
                n={2}
                label="부포지션"
                value={secondary}
                active={activeSlot === "secondary"}
                onClick={() => setActiveSlot("secondary")}
              />
            </div>
            <p
              className={`text-xs ${
                primary && secondary
                  ? "text-emerald-600 font-medium"
                  : "text-suaza-ink-muted"
              }`}
            >
              {primary && secondary
                ? "포지션 선택이 완료되었습니다"
                : activeSlot === "primary"
                  ? "주포지션을 선택하세요"
                  : "부포지션을 선택하세요 (선택 사항)"}
            </p>
          </>
        )}

        {/* 포지션 카드 */}
        <div className="grid grid-cols-4 gap-2">
          {POSITIONS.map((p) => {
            const role =
              p === primary ? "primary" : p === secondary ? "secondary" : null;
            const isActiveSlotEmptyTarget =
              !readonly &&
              ((activeSlot === "primary" && p === primary) ||
                (activeSlot === "secondary" && p === secondary));
            return (
              <button
                type="button"
                key={p}
                disabled={readonly}
                onClick={readonly ? undefined : () => pickPosition(p)}
                aria-pressed={role != null}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-3 rounded-xl border-2 transition ${
                  role === "primary"
                    ? "bg-suaza-button border-suaza-button text-white"
                    : role === "secondary"
                      ? "bg-white border-emerald-500 text-emerald-600"
                      : "border-suaza-border bg-white text-suaza-ink-faint"
                } ${readonly ? "cursor-default" : "hover:bg-gray-50"} ${
                  isActiveSlotEmptyTarget ? "ring-2 ring-offset-1 ring-suaza-ink/20" : ""
                }`}
              >
                {role && (
                  <span
                    className={`absolute -top-2 -right-2 w-5 h-5 rounded-full text-[11px] font-bold text-white flex items-center justify-center shadow ring-2 ring-white ${
                      role === "primary" ? "bg-orange-500" : "bg-emerald-500"
                    }`}
                  >
                    {role === "primary" ? "주" : "부"}
                  </span>
                )}
                <span className="text-lg font-bold">{p}</span>
                <span className="text-[11px]">{POSITION_LABEL[p]}</span>
              </button>
            );
          })}
        </div>

        {/* 선택 요약 */}
        <div className="flex items-center gap-2 flex-wrap rounded-lg bg-suaza-bg/60 px-3 py-2 text-sm">
          <span className="text-suaza-ink-muted">주포지션</span>
          <RoleChip value={primary} role="primary" />
          <span className="text-suaza-ink-faint">/</span>
          <span className="text-suaza-ink-muted">부포지션</span>
          <RoleChip value={secondary} role="secondary" />
        </div>
      </div>

      {/* 주발 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-suaza-ink text-base font-medium">주발</span>
          {!readonly && (
            <span className="text-suaza-accent text-xs font-medium">*</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {PREFERRED_FEET.map((f) => {
            const on = foot === f;
            return (
              <button
                type="button"
                key={f}
                disabled={readonly}
                onClick={readonly ? undefined : () => setFoot(on ? null : f)}
                className={`flex flex-col items-center gap-2 py-4 rounded-lg border-2 transition ${
                  on
                    ? "border-suaza-accent bg-red-50 text-suaza-accent"
                    : "border-suaza-border bg-white text-suaza-ink-faint"
                } ${readonly ? "cursor-default" : "hover:bg-gray-50"}`}
              >
                <FootIcon variant={f} className="h-12" />
                <span className="text-sm font-medium">{FOOT_LABEL[f]}</span>
              </button>
            );
          })}
        </div>
        {readonly && !foot && (
          <span className="text-xs text-suaza-ink-faint">
            선택된 주발이 없습니다
          </span>
        )}
      </div>
    </>
  );

  // 읽기 전용: 폼/저장 없이 동일 레이아웃만 렌더
  if (readonly) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <UsersIcon className="w-9 h-9 text-suaza-ink shrink-0" />
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            프로필
          </h1>
        </div>
        {sections}
      </div>
    );
  }

  return (
    <form
      action={updateProfile.bind(null, profileId)}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="name" value={initial.name} />
      <input type="hidden" name="nickname" value={nickname} />
      <input type="hidden" name="jersey_number" value={jersey} />
      <input type="hidden" name="birth_date" value={birth} />
      {positions.map((p) => (
        <input key={p} type="hidden" name="positions" value={p} />
      ))}
      {foot && <input type="hidden" name="preferred_foot" value={foot} />}
      <input type="hidden" name="is_injured" value={injured ? "1" : "0"} />
      <input type="hidden" name="on_leave" value={onLeave ? "1" : "0"} />

      {/* 제목 + 저장 — 같은 라인 (카드 밖 상단) */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <UsersIcon className="w-9 h-9 text-suaza-ink shrink-0" />
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            프로필
          </h1>
        </div>
        <button
          type="submit"
          disabled={!canSave}
          className="text-xs font-medium px-3 py-1.5 rounded-md bg-suaza-ink text-white hover:opacity-90 transition shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          저장
        </button>
      </div>

      {sections}

      {/* 필수 누락 안내 */}
      {isDirty && !requiredValid && (
        <p className="text-xs text-suaza-accent">
          * 등번호, 생년월일, 주포지션, 주발은 필수 항목입니다
        </p>
      )}

    </form>
  );
}

// 클릭하면 인라인 입력으로 전환되는 편집 필드 (별명/등번호/생년월일 공용).
// readonly 면 클릭 불가한 정적 표시.
function InlineEditable({
  type,
  value,
  onCommit,
  renderDisplay,
  displayClassName,
  inputClassName,
  placeholder,
  min,
  max,
  maxLength,
  ariaLabel,
  readonly = false,
}: {
  type: "text" | "number" | "date";
  value: string;
  onCommit: (v: string) => void;
  renderDisplay: (v: string) => React.ReactNode;
  displayClassName?: string;
  inputClassName?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  ariaLabel?: string;
  readonly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (readonly) {
    return <span className={displayClassName}>{renderDisplay(value)}</span>;
  }

  if (editing) {
    return (
      <input
        type={type}
        value={draft}
        autoFocus
        placeholder={placeholder}
        min={min}
        max={max}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onCommit(draft);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(draft);
            setEditing(false);
          } else if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={inputClassName}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={displayClassName}
      aria-label={ariaLabel}
    >
      {renderDisplay(value)}
    </button>
  );
}

// "1985-11-30" → "1985.11.30"
function formatBirth(iso: string): string {
  return iso.replaceAll("-", ".");
}

const inlineInputCls =
  "px-2 py-1 rounded-md border border-suaza-button text-sm text-suaza-ink focus:outline-none";

function StepTab({
  n,
  label,
  value,
  active,
  onClick,
}: {
  n: number;
  label: string;
  value: Position | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border-2 transition ${
        active
          ? "bg-suaza-button border-suaza-button text-white"
          : "bg-white border-suaza-border text-suaza-ink-muted hover:bg-gray-50"
      }`}
    >
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold ${
          active ? "bg-white/20 text-white" : "bg-gray-100 text-suaza-ink-muted"
        }`}
      >
        {n}
      </span>
      <span>{label}</span>
      {value && <span className="font-bold">{value}</span>}
    </button>
  );
}

function RoleChip({
  value,
  role,
}: {
  value: Position | null;
  role: "primary" | "secondary";
}) {
  if (!value) {
    return <span className="text-suaza-ink-faint text-xs">미선택</span>;
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
        role === "primary"
          ? "bg-suaza-button text-white"
          : "border border-emerald-500 text-emerald-600"
      }`}
    >
      {value}
    </span>
  );
}

// 상태 칩 (부상/장기불참) — 좌측 컬러 닷 + 라벨. readonly 면 정적 표시.
function StatusPill({
  label,
  active,
  onColor,
  onBg,
  onClick,
  readonly = false,
}: {
  label: string;
  active: boolean;
  /** 활성화 시 닷·텍스트 색 */
  onColor: string;
  /** 활성화 시 배경색 (반투명) */
  onBg: string;
  onClick: () => void;
  readonly?: boolean;
}) {
  const cls = `inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition ${
    active ? "" : `bg-gray-100 text-suaza-ink-muted${readonly ? "" : " hover:bg-gray-200"}`
  }`;
  const style = active ? { backgroundColor: onBg, color: onColor } : undefined;
  const inner = label;
  if (readonly) {
    return (
      <span className={cls} style={style}>
        {inner}
      </span>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onClick}
      className={cls}
      style={style}
    >
      {inner}
    </button>
  );
}

const FOOT_IMAGE: Record<PreferredFoot, { src: string; ratio: string }> = {
  left: { src: "/foot-left.png", ratio: "aspect-[3/4]" },
  right: { src: "/foot-right.png", ratio: "aspect-[3/4]" },
  both: { src: "/foot-both.png", ratio: "aspect-[3/2]" },
};

// 회원명단 탭과 동일한 사람 아이콘 — "프로필" 제목 앞에 표시
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function FootIcon({
  variant,
  className = "",
}: {
  variant: PreferredFoot;
  className?: string;
}) {
  const { src, ratio } = FOOT_IMAGE[variant];
  return (
    <div className={`relative ${ratio} ${className}`}>
      <Image
        src={src}
        alt={FOOT_LABEL[variant]}
        fill
        sizes="80px"
        className="object-contain"
      />
    </div>
  );
}
