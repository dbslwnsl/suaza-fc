"use client";

import { useEffect, useRef, useState } from "react";
import { displayMemberName } from "@/lib/members/name";

export type CaptainMember = { id: string; name: string };

// 주장 칩 색: 주장 완장(노랑/금색) 연상 — 앰버 계열.
export const CAPTAIN_CHIP_CLASS =
  "bg-amber-100 text-amber-700 border-amber-400 font-semibold";

/**
 * 팀 이름 옆에 표시되는 주장 선택 컨트롤.
 * - editable(매니저/감독): 현재 팀원 중에서 주장 지정/해제 (커스텀 드롭다운)
 * - 그 외: 주장이 있으면 앰버색 "주장" 칩만 표시(범례), 없으면 표시 안 함
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

  return <CaptainSelect members={members} captain={captain} onChange={onChange} />;
}

// 트리거 바로 아래에 뜨는 커스텀 드롭다운 (네이티브 select 가 모바일에서 하단 전체를
// 덮는 문제 회피). 팀 헤더 우측에 위치하므로 메뉴는 우측 정렬로 펼친다.
function CaptainSelect({
  members,
  captain,
  onChange,
}: {
  members: CaptainMember[];
  captain: CaptainMember | null;
  onChange: (playerId: string | null) => void;
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const disabled = members.length === 0;
  const label = captain ? displayMemberName(captain.name) : "주장 선택";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="주장 선택"
        className="inline-flex items-center gap-1 max-w-[7.5rem] text-xs rounded-md border border-suaza-border bg-white px-2 py-1 text-suaza-ink-muted hover:bg-gray-50 focus:outline-none focus:border-suaza-button disabled:opacity-50 transition"
      >
        <span className="truncate">{label}</span>
        <span aria-hidden className="ml-auto text-[10px] text-suaza-ink-faint">
          ▾
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-30 mt-1 max-h-60 min-w-[8rem] overflow-y-auto whitespace-nowrap rounded-lg border border-suaza-border bg-white shadow-lg py-1"
        >
          <li>
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-suaza-ink-muted hover:bg-gray-50"
            >
              주장 없음
            </button>
          </li>
          {members.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${
                  m.id === captain?.id
                    ? "bg-amber-50 font-semibold text-amber-700"
                    : "text-suaza-ink"
                }`}
              >
                {displayMemberName(m.name)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
