"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import {
  FOOT_LABEL,
  MEMBER_TITLES,
  POSITIONS,
  POSITION_LABEL,
  PREFERRED_FEET,
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
  title: MemberTitle;
};

export default function ProfileEditForm({
  profileId,
  initial,
  isManager,
}: {
  profileId: string;
  initial: Initial;
  isManager: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(initial.name);
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
  const [title, setTitle] = useState<MemberTitle>(initial.title);
  const [foot, setFoot] = useState<PreferredFoot | null>(
    initial.preferred_foot,
  );

  const isDirty = useMemo(() => {
    if (name.trim() !== initial.name) return true;
    if (nickname.trim() !== (initial.nickname ?? "")) return true;
    if (jersey.trim() !== String(initial.jersey_number ?? "")) return true;
    if (birth.trim() !== (initial.birth_date ?? "")) return true;
    if (foot !== initial.preferred_foot) return true;
    // 순서(주/부)가 의미를 가지므로 정렬 없이 비교
    if (positions.length !== initial.positions.length) return true;
    if (positions.some((p, i) => p !== initial.positions[i])) return true;
    if (isManager && title !== initial.title) return true;
    return false;
  }, [name, nickname, jersey, birth, foot, positions, title, isManager, initial]);

  // 필수: 이름, 등번호, 생년월일, 주포지션, 주발
  const requiredValid =
    name.trim().length > 0 &&
    jersey.trim().length > 0 &&
    birth.trim().length > 0 &&
    primary != null &&
    foot != null;
  const canSave = isDirty && requiredValid;

  const handleCancel = () => {
    setName(initial.name);
    setNickname(initial.nickname ?? "");
    setJersey(initial.jersey_number != null ? String(initial.jersey_number) : "");
    setBirth(initial.birth_date ?? "");
    setPrimary(initial.positions[0] ?? null);
    setSecondary(initial.positions[1] ?? null);
    setActiveSlot("primary");
    setTitle(initial.title);
    setFoot(initial.preferred_foot);
  };

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

  return (
    <form
      ref={formRef}
      action={updateProfile.bind(null, profileId)}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="nickname" value={nickname} />
      <input type="hidden" name="jersey_number" value={jersey} />
      <input type="hidden" name="birth_date" value={birth} />
      {positions.map((p) => (
        <input key={p} type="hidden" name="positions" value={p} />
      ))}
      {isManager && <input type="hidden" name="title" value={title} />}
      {foot && <input type="hidden" name="preferred_foot" value={foot} />}

      {/* 이름 / 별명 */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="이름" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="송영훈"
            required
            className={textInputCls}
          />
        </Field>
        <Field label="별명">
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 6))}
            placeholder="해리"
            maxLength={6}
            className={textInputCls}
          />
        </Field>
      </div>

      {/* 등번호 / 생년월일 */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="등번호" hint="0-99 사이 숫자" required>
          <input
            type="number"
            value={jersey}
            onChange={(e) => setJersey(e.target.value)}
            min={0}
            max={99}
            placeholder="40"
            required
            className={textInputCls}
          />
        </Field>
        <Field label="생년월일" hint="YYYY-MM-DD" required>
          <input
            type="date"
            value={birth}
            onChange={(e) => setBirth(e.target.value)}
            placeholder="1987-01-26"
            required
            className={textInputCls}
          />
        </Field>
      </div>

      {/* 직책 (manager 만) */}
      {isManager && (
        <div className="flex flex-col gap-2">
          <span className="text-suaza-ink text-base font-medium">직책</span>
          <div className="flex flex-wrap gap-2">
            {MEMBER_TITLES.map((t) => {
              const on = title === t;
              return (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTitle(t)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                    on
                      ? "bg-suaza-accent text-white"
                      : "bg-white border border-suaza-border text-suaza-ink-muted hover:bg-gray-50"
                  }`}
                >
                  {TITLE_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 포지션 (주/부 각각 선택) */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-suaza-ink text-base font-medium">포지션</span>
          <span className="text-suaza-accent text-xs font-medium">*</span>
        </div>

        {/* 단계 탭: 주포지션 / 부포지션 */}
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

        {/* 안내 문구 */}
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

        {/* 포지션 카드 */}
        <div className="grid grid-cols-4 gap-2">
          {POSITIONS.map((p) => {
            const role =
              p === primary ? "primary" : p === secondary ? "secondary" : null;
            const isActiveSlotEmptyTarget =
              (activeSlot === "primary" && p === primary) ||
              (activeSlot === "secondary" && p === secondary);
            return (
              <button
                type="button"
                key={p}
                onClick={() => pickPosition(p)}
                aria-pressed={role != null}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-3 rounded-xl border-2 transition ${
                  role === "primary"
                    ? "bg-suaza-button border-suaza-button text-white"
                    : role === "secondary"
                      ? "bg-white border-emerald-500 text-emerald-600"
                      : "border-suaza-border bg-white text-suaza-ink-faint hover:bg-gray-50"
                } ${
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
          <span className="text-suaza-accent text-xs font-medium">*</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {PREFERRED_FEET.map((f) => {
            const on = foot === f;
            return (
              <button
                type="button"
                key={f}
                onClick={() => setFoot(on ? null : f)}
                className={`flex flex-col items-center gap-2 py-4 rounded-lg border-2 transition ${
                  on
                    ? "border-suaza-accent bg-red-50 text-suaza-accent"
                    : "border-suaza-border bg-white text-suaza-ink-faint hover:bg-gray-50"
                }`}
              >
                <FootIcon variant={f} className="h-12" />
                <span className="text-sm font-medium">{FOOT_LABEL[f]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 필수 누락 안내 */}
      {isDirty && !requiredValid && (
        <p className="text-xs text-suaza-accent">
          * 등번호, 생년월일, 주포지션, 주발은 필수 항목입니다
        </p>
      )}

      {/* 저장 / 취소 */}
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={handleCancel}
          disabled={!isDirty}
          className="flex-1 h-[52px] rounded-lg bg-gray-100 text-suaza-ink-muted text-base font-medium hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-100"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={!canSave}
          className="flex-1 h-[52px] rounded-lg bg-suaza-accent text-white text-base font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:opacity-50"
        >
          저장
        </button>
      </div>
    </form>
  );
}

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

const textInputCls =
  "w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink placeholder:text-suaza-placeholder focus:outline-none focus:border-suaza-button";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-suaza-ink text-base font-medium inline-flex items-baseline gap-1">
        {label}
        {required && (
          <span className="text-suaza-accent text-xs font-medium">*</span>
        )}
      </span>
      {hint && <span className="text-suaza-ink-faint text-xs">{hint}</span>}
      {children}
    </label>
  );
}

const FOOT_IMAGE: Record<PreferredFoot, { src: string; ratio: string }> = {
  left: { src: "/foot-left.png", ratio: "aspect-[3/4]" },
  right: { src: "/foot-right.png", ratio: "aspect-[3/4]" },
  both: { src: "/foot-both.png", ratio: "aspect-[3/2]" },
};

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
