"use client";

import { useRef } from "react";

type Option = { id: string; name: string; jersey_number: number | null };

export default function ParticipationAdd({
  action,
  options,
}: {
  action: (formData: FormData) => Promise<void>;
  options: Option[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      <select
        name="player_id"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            formRef.current?.requestSubmit();
          }
        }}
        className="w-full px-3 py-2 rounded-lg border border-dashed border-suaza-border text-sm text-suaza-ink-muted bg-white focus:outline-none focus:border-suaza-button"
      >
        <option value="" disabled>
          + 미리 출전 선수 추가
        </option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.jersey_number != null ? `#${opt.jersey_number} ` : ""}
            {opt.name}
          </option>
        ))}
      </select>
    </form>
  );
}
