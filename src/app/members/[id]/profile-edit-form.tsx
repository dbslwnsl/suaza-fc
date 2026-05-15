"use client";

import { useRef, useState } from "react";
import {
  MEMBER_TITLES,
  POSITIONS,
  TITLE_LABEL,
  type MemberTitle,
  type Position,
} from "@/lib/members/positions";
import { updateProfile } from "./actions";

type Initial = {
  name: string;
  nickname: string | null;
  positions: Position[];
  jersey_number: number | null;
  birth_date: string | null;
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
  const [isDirty, setIsDirty] = useState(false);

  const recompute = () => {
    if (!formRef.current) return;
    setIsDirty(isFormDirty(formRef.current, initial, isManager));
  };

  const handleCancel = () => {
    formRef.current?.reset();
    setIsDirty(false);
  };

  return (
    <form
      ref={formRef}
      action={updateProfile.bind(null, profileId)}
      onChange={recompute}
      onInput={recompute}
      className="flex flex-col gap-4"
    >
      <Field label="이름">
        <input
          type="text"
          name="name"
          defaultValue={initial.name}
          required
          className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
        />
      </Field>

      <Field label="별명">
        <input
          type="text"
          name="nickname"
          defaultValue={initial.nickname ?? ""}
          className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
        />
      </Field>

      <Field label="포지션 (복수 선택)">
        <div className="flex gap-2 flex-wrap">
          {POSITIONS.map((p) => (
            <label
              key={p}
              className="flex items-center gap-2 px-3 py-1.5 border border-suaza-border rounded-lg cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                name="positions"
                value={p}
                defaultChecked={initial.positions.includes(p)}
                className="accent-suaza-button"
              />
              <span className="text-suaza-ink">{p}</span>
            </label>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="등번호">
          <input
            type="number"
            name="jersey_number"
            defaultValue={initial.jersey_number ?? ""}
            min={0}
            max={999}
            className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
          />
        </Field>
        <Field label="생년월일">
          <input
            type="date"
            name="birth_date"
            defaultValue={initial.birth_date ?? ""}
            className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
          />
        </Field>
      </div>

      {isManager && (
        <Field label="직책">
          <select
            name="title"
            defaultValue={initial.title}
            className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink bg-white focus:outline-none focus:border-suaza-button"
          >
            {MEMBER_TITLES.map((t) => (
              <option key={t} value={t}>
                {TITLE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={handleCancel}
          disabled={!isDirty}
          className="flex-1 h-[52px] rounded-lg border border-suaza-border text-suaza-ink text-base font-medium hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={!isDirty}
          className="flex-1 h-[52px] rounded-lg bg-suaza-button text-white text-base font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
        >
          저장
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-suaza-ink text-base">{label}</span>
      {children}
    </label>
  );
}

function isFormDirty(
  form: HTMLFormElement,
  initial: Initial,
  isManager: boolean,
): boolean {
  const fd = new FormData(form);
  const get = (k: string) => String(fd.get(k) ?? "").trim();

  if (get("name") !== initial.name) return true;
  if (get("nickname") !== (initial.nickname ?? "")) return true;
  if (get("jersey_number") !== String(initial.jersey_number ?? "")) return true;
  if (get("birth_date") !== (initial.birth_date ?? "")) return true;

  const current = fd.getAll("positions").map(String).sort();
  const original = [...initial.positions].sort();
  if (current.length !== original.length) return true;
  if (current.some((p, i) => p !== original[i])) return true;

  if (isManager && get("title") !== initial.title) return true;

  return false;
}
