"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import {
  FOOT_LABEL,
  MEMBER_TITLES,
  POSITIONS,
  POSITION_COLOR,
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
  const [positions, setPositions] = useState<Position[]>(initial.positions);
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
    const cur = [...positions].sort();
    const org = [...initial.positions].sort();
    if (cur.length !== org.length) return true;
    if (cur.some((p, i) => p !== org[i])) return true;
    if (isManager && title !== initial.title) return true;
    return false;
  }, [name, nickname, jersey, birth, foot, positions, title, isManager, initial]);

  // 필수: 이름, 등번호, 생년월일, 포지션(1개 이상), 주발
  const requiredValid =
    name.trim().length > 0 &&
    jersey.trim().length > 0 &&
    birth.trim().length > 0 &&
    positions.length > 0 &&
    foot != null;
  const canSave = isDirty && requiredValid;

  const handleCancel = () => {
    setName(initial.name);
    setNickname(initial.nickname ?? "");
    setJersey(initial.jersey_number != null ? String(initial.jersey_number) : "");
    setBirth(initial.birth_date ?? "");
    setPositions(initial.positions);
    setTitle(initial.title);
    setFoot(initial.preferred_foot);
  };

  const togglePosition = (p: Position) => {
    setPositions((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );
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
            onChange={(e) => setNickname(e.target.value)}
            placeholder="해리"
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

      {/* 포지션 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-suaza-ink text-base font-medium">포지션</span>
          <span className="text-suaza-accent text-xs font-medium">*</span>
          <span className="text-suaza-ink-faint text-xs">복수 선택 가능</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {POSITIONS.map((p) => {
            const on = positions.includes(p);
            const color = POSITION_COLOR[p];
            return (
              <button
                type="button"
                key={p}
                onClick={() => togglePosition(p)}
                style={
                  on
                    ? {
                        borderColor: color,
                        backgroundColor: `${color}1A`,
                        color,
                      }
                    : undefined
                }
                className={`flex flex-col items-center justify-center gap-0.5 py-3 rounded-lg border-2 transition ${
                  on
                    ? ""
                    : "border-suaza-border bg-white text-suaza-ink-faint hover:bg-gray-50"
                }`}
              >
                <span className="text-lg font-bold">{p}</span>
                <span className="text-[11px]">{POSITION_LABEL[p]}</span>
              </button>
            );
          })}
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
          * 등번호, 생년월일, 포지션, 주발은 필수 항목입니다
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
