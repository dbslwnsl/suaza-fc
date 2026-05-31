"use client";

import { displayMemberName } from "@/lib/members/name";

export type CaptainMember = { id: string; name: string };

// 주장 칩 색: 주장 완장(노랑/금색) 연상 — 앰버 계열.
export const CAPTAIN_CHIP_CLASS =
  "bg-amber-100 text-amber-700 border-amber-400 font-semibold";

/**
 * 팀 이름 옆에 표시되는 주장 선택 컨트롤.
 * - editable(매니저/감독): 현재 팀원 중에서 select 로 주장 지정/해제
 * - 그 외: 주장이 있으면 👑 + 이름만 표시, 없으면 아무것도 표시 안 함
 * captainId 가 현재 팀원에 없으면(드래그로 팀을 떠난 경우) 미지정으로 간주.
 */
export default function CaptainPicker({
  members,
  captainId,
  editable,
  locked = false,
  onChange,
}: {
  members: CaptainMember[];
  captainId: string | null;
  editable: boolean;
  /** 편집 권한이 있어도 변경 불가 (예: 경기 종료) — 읽기 전용 표시만 */
  locked?: boolean;
  onChange: (playerId: string | null) => void;
}) {
  const captain =
    captainId != null ? members.find((m) => m.id === captainId) ?? null : null;

  if (!editable || locked) {
    // 회원에게는 이름을 따로 적지 않고, 주장색 "주장" 칩으로 범례처럼 표시.
    // (실제 주장은 명단의 주장색 칩으로 구분됨)
    if (!captain) return null;
    return (
      <span
        className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full border select-none shrink-0 ${CAPTAIN_CHIP_CLASS}`}
      >
        주장
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <span aria-hidden className="text-sm">
        👑
      </span>
      <select
        value={captain?.id ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={members.length === 0}
        aria-label="주장 선택"
        className="text-xs rounded-md border border-suaza-border bg-white px-1.5 py-1 text-suaza-ink-muted focus:outline-none focus:border-suaza-button disabled:opacity-50 max-w-[7.5rem]"
      >
        <option value="">주장 선택</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {displayMemberName(m.name)}
          </option>
        ))}
      </select>
    </span>
  );
}
