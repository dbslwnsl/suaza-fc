"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FOOT_LABEL,
  POSITIONS,
  POSITION_COLOR,
  PREFERRED_FEET,
  TITLE_BADGE,
  TITLE_LABEL,
  type MemberTitle,
  type Position,
  type PreferredFoot,
} from "@/lib/members/positions";
import DatePicker from "../../matches/new/date-picker";
import { updateProfile } from "./actions";

// 등번호 드롭다운 옵션 (0~99)
const JERSEY_OPTIONS = Array.from({ length: 100 }, (_, i) => ({
  value: String(i),
  label: String(i),
}));

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
  hideStatus = false,
  setupMode = false,
  hasAvatar = false,
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
  /** true 면 부상/장기불참 토글 숨김 (가입 첫 입력 단계) */
  hideStatus?: boolean;
  /** true 면 가입 첫 프로필 입력 단계 — 제목 "프로필입력", 상단 저장 버튼 숨김, 하단 회원가입 버튼 표시 */
  setupMode?: boolean;
  /** 프로필 사진(아바타) 등록 여부 — 가입 단계에선 사진까지 등록해야 회원가입 활성화 */
  hasAvatar?: boolean;
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
  // 가입 입력 단계에선 사진(아바타) 등록까지 완료해야 저장(회원가입) 가능
  const canSave = isDirty && requiredValid && (!setupMode || hasAvatar);

  // 카드 + 포지션 + 주발 (편집/읽기 공통 레이아웃)
  const sections = (
    <>
      {/* 상단 신원 카드 */}
      <section className="rounded-2xl border border-suaza-border p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3 sm:gap-5 min-w-0">
          {/* 아바타 + 중앙 하단 뱃지 — 가입 입력 단계엔 "사진필수", 그 외엔 직책 */}
          <div className="relative shrink-0">
            {avatar}
            {setupMode ? (
              <span className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 z-10 whitespace-nowrap text-[11px] leading-none px-2 py-1 rounded-full ring-2 ring-white shadow-sm bg-suaza-accent text-white">
                사진*
              </span>
            ) : (
              <span
                className={`absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 z-10 whitespace-nowrap text-[11px] leading-none px-2 py-1 rounded-full ring-2 ring-white shadow-sm ${TITLE_BADGE[title] ?? TITLE_BADGE.player}`}
              >
                {TITLE_LABEL[title] ?? title}
              </span>
            )}
          </div>
          <div className={`flex-1 min-w-0 flex flex-col ${setupMode ? "gap-3.5" : "gap-2"}`}>
            {/* 1행: 이름 + 생년월일 / 등번호(우측) — 좁으면 줄바꿈 */}
            <div className="flex items-baseline gap-x-2 gap-y-1 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold text-suaza-ink">
                {initial.name}
              </h1>
              {/* 가입 입력 단계에선 등번호·생년월일을 아래 전용 입력으로 받으므로 카드 인라인 표시는 숨김 */}
              {!setupMode && (
                <InlineEditable
                  type="number"
                  value={jersey}
                  onCommit={setJersey}
                  readonly
                  min={0}
                  max={99}
                  ariaLabel="등번호"
                  renderDisplay={(v) => (
                    <span className="font-bold" style={{ color: "#338CF2" }}>
                      #{v || "--"}
                    </span>
                  )}
                  displayClassName="text-sm"
                  inputClassName={`${inlineInputCls} w-[60px] text-center`}
                />
              )}
              {!setupMode && (
                <InlineEditable
                  type="date"
                  value={birth}
                  onCommit={setBirth}
                  readonly
                  ariaLabel="생년월일"
                  renderDisplay={(v) => (v ? formatBirth(v) : "생년월일 미설정")}
                  displayClassName="ml-auto text-xs text-suaza-ink-faint whitespace-nowrap"
                  inputClassName={`${inlineInputCls} w-[150px] ml-auto`}
                />
              )}
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
                    {v || (readonly ? "—" : "별명입력")}
                    {!readonly && <span aria-hidden>✏️</span>}
                  </span>
                )}
                displayClassName="px-2.5 py-1 rounded-full border border-suaza-border text-xs hover:bg-gray-50 transition"
                inputClassName={`${inlineInputCls} w-[120px]`}
              />
              {!hideStatus && (
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
              )}
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

      {/* 가입 입력 단계: 생년월일(커스텀 달력) + 등번호(커스텀 드롭다운 0~99) */}
      {setupMode && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-suaza-ink-muted">
              생년월일 <span className="text-suaza-accent">*</span>
            </span>
            <DatePicker
              value={birth}
              onChange={setBirth}
              defaultView="1987-01-01"
              placeholder="생년월일 선택"
              rounded="rounded-2xl"
              textSize="text-xs"
              padding="px-2.5 py-1.5"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-suaza-ink-muted">
              등번호 <span className="text-suaza-accent">*</span>
            </span>
            <Dropdown
              value={jersey || null}
              placeholder="선택"
              options={JERSEY_OPTIONS}
              onChange={(v) => setJersey(v ?? "")}
              rounded="rounded-2xl"
            />
          </div>
        </div>
      )}

      {/* 주포지션 · 부포지션 · 주발 — 드롭다운 (가로 3등분) */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-suaza-ink-muted">
            주포지션 {setupMode && <span className="text-suaza-accent">*</span>}
          </span>
          <Dropdown
            value={primary}
            placeholder="선택"
            readonly={readonly}
            rounded={setupMode ? "rounded-2xl" : "rounded-xl"}
            options={POSITIONS.map((p) => ({
              value: p,
              label: p,
              color: POSITION_COLOR[p],
            }))}
            onChange={(v) => {
              const next = v as Position | null;
              setPrimary(next);
              if (next && secondary === next) setSecondary(null);
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-suaza-ink-muted">
            부포지션
          </span>
          <Dropdown
            value={secondary}
            placeholder="없음"
            readonly={readonly}
            rounded={setupMode ? "rounded-2xl" : "rounded-xl"}
            allowClear
            clearLabel="없음"
            options={POSITIONS.filter((p) => p !== primary).map((p) => ({
              value: p,
              label: p,
              color: POSITION_COLOR[p],
            }))}
            onChange={(v) => setSecondary(v as Position | null)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-suaza-ink-muted">
            주발 {setupMode && <span className="text-suaza-accent">*</span>}
          </span>
          <Dropdown
            value={foot}
            placeholder="선택"
            readonly={readonly}
            rounded={setupMode ? "rounded-2xl" : "rounded-xl"}
            options={PREFERRED_FEET.map((f) => ({
              value: f,
              label: FOOT_LABEL[f],
            }))}
            onChange={(v) => setFoot(v as PreferredFoot | null)}
          />
        </div>
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
            {setupMode ? "프로필입력" : "프로필"}
          </h1>
        </div>
        {!setupMode && (
          <button
            type="submit"
            disabled={!canSave}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-suaza-ink text-white hover:opacity-90 transition shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            저장
          </button>
        )}
      </div>

      {sections}

      {/* 필수 누락 안내 */}
      {isDirty && !requiredValid && (
        <p className="text-xs text-suaza-accent">
          * 등번호, 생년월일, 주포지션, 주발은 필수 항목입니다
        </p>
      )}

      {/* 가입 첫 입력 단계 — 하단 회원가입 버튼 (이전 "다음" 버튼과 동일 스타일) */}
      {setupMode && (
        <button
          type="submit"
          disabled={!canSave}
          className="h-[52px] rounded-2xl bg-[#15224A] text-white text-[16px] font-semibold hover:brightness-125 transition mt-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
        >
          회원가입
        </button>
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

// 색 점 + 텍스트 + ▾ 형태의 커스텀 드롭다운. readonly 면 정적 박스로 표시.
function Dropdown<T extends string>({
  value,
  options,
  onChange,
  placeholder = "선택",
  readonly = false,
  allowClear = false,
  clearLabel = "없음",
  rounded = "rounded-xl",
}: {
  value: T | null;
  options: { value: T; label: string; color?: string }[];
  onChange: (v: T | null) => void;
  placeholder?: string;
  readonly?: boolean;
  allowClear?: boolean;
  clearLabel?: string;
  /** 박스 모서리 둥글기 클래스 (기본 rounded-xl) */
  rounded?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? null;
  const label = selected ? selected.label : readonly ? "미설정" : placeholder;

  const inner = (
    <>
      {selected?.color ? (
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: selected.color }}
        />
      ) : null}
      <span className={selected ? "" : "text-suaza-ink-faint font-normal"}>
        {label}
      </span>
    </>
  );

  if (readonly) {
    return (
      <span className={`flex w-full items-center gap-2 ${rounded} border border-suaza-border bg-white px-2.5 py-1.5 text-xs font-bold text-suaza-ink`}>
        {inner}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center gap-2 ${rounded} border border-suaza-border bg-white px-2.5 py-1.5 text-xs font-bold text-suaza-ink hover:bg-gray-50 transition`}
      >
        {inner}
        <span aria-hidden className="ml-auto text-[10px] text-suaza-ink-faint">
          ▾
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-20 left-0 mt-1 max-h-60 min-w-full overflow-y-auto whitespace-nowrap rounded-xl border border-suaza-border bg-white shadow-lg py-1"
        >
          {allowClear && (
            <li>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-suaza-ink-muted hover:bg-gray-50"
              >
                {clearLabel}
              </button>
            </li>
          )}
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                  o.value === value
                    ? "bg-gray-50 font-bold text-suaza-ink"
                    : "text-suaza-ink"
                }`}
              >
                {o.color ? (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: o.color }}
                  />
                ) : null}
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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

