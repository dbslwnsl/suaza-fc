"use client";

import { useState } from "react";
import { saveFormation, deleteFormation } from "@/lib/formations/actions";
import {
  FORMATION_SHAPES,
  buildSlots,
  type SlotDef,
} from "@/lib/formations/helpers";

type Member = {
  id: string;
  name: string;
  jersey_number: number | null;
};

export default function FormationEditor({
  matchId,
  members,
  initialShape,
  initialPlayerIds,
}: {
  matchId: string;
  members: Member[];
  initialShape: string;
  initialPlayerIds: (string | null)[];
}) {
  const [shape, setShape] = useState(initialShape);
  const slots = buildSlots(shape);

  return (
    <div className="flex flex-col gap-4">
      <form
        action={saveFormation.bind(null, matchId)}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-2">
          <span className="text-suaza-ink text-base">포메이션</span>
          <select
            name="shape"
            value={shape}
            onChange={(e) => setShape(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink bg-white focus:outline-none focus:border-suaza-button"
          >
            {FORMATION_SHAPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <Field
          slots={slots}
          members={members}
          assignments={initialPlayerIds}
          editable
        />

        <button
          type="submit"
          className="h-[52px] rounded-lg bg-suaza-button text-white text-base font-medium hover:opacity-90 transition"
        >
          포메이션 저장
        </button>
      </form>

      <form action={deleteFormation.bind(null, matchId)}>
        <button
          type="submit"
          className="w-full h-[44px] rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition"
        >
          포메이션 초기화
        </button>
      </form>
    </div>
  );
}

export function Field({
  slots,
  members,
  assignments,
  editable,
}: {
  slots: SlotDef[];
  members: Member[];
  assignments: (string | null)[];
  editable: boolean;
}) {
  const byId = new Map(members.map((m) => [m.id, m]));
  return (
    <div className="relative w-full aspect-[2/3] sm:aspect-[3/4] bg-emerald-700 rounded-xl overflow-hidden shadow-inner">
      {/* 필드 라인 */}
      <div className="absolute inset-2 border border-white/40 rounded" />
      <div className="absolute top-1/2 left-2 right-2 h-px bg-white/40" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-white/40" />
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1/2 h-[14%] border border-t-0 border-white/40 rounded-b" />
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1/2 h-[14%] border border-b-0 border-white/40 rounded-t" />

      {/* 슬롯 */}
      {slots.map((s, i) => {
        const playerId = assignments[i] ?? "";
        const player = playerId ? byId.get(playerId) : null;
        return (
          <div
            key={s.index}
            className="absolute -translate-x-1/2 -translate-y-1/2 w-[22%] sm:w-[18%]"
            style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}
          >
            {editable ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-white/80 font-mono">
                  {s.role}
                </span>
                <select
                  name={`slot__${s.index}`}
                  defaultValue={playerId}
                  className="w-full text-[11px] sm:text-xs px-1 py-1 rounded bg-white/95 text-suaza-ink focus:outline-none border border-white/40"
                >
                  <option value="">(빈칸)</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.jersey_number != null ? `#${m.jersey_number} ` : ""}
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-0.5">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white text-suaza-ink flex items-center justify-center text-xs font-bold border border-white/60">
                  {player?.jersey_number ?? s.role}
                </div>
                <span className="text-[11px] text-white font-medium drop-shadow whitespace-nowrap">
                  {player?.name ?? "—"}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
