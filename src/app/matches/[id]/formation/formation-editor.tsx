"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { saveFormation } from "@/lib/formations/actions";
import {
  FORMATIONS,
  MAX_QUARTERS,
  buildSlots,
  type SaveFormationPayload,
  type SavedQuarter,
  type SlotDef,
  type SlotRole,
} from "@/lib/formations/helpers";
import {
  POSITIONS,
  POSITION_COLOR,
  type Position,
  type MemberTitle,
} from "@/lib/members/positions";
import type { EditorMember } from "./page";

type Filter = "ALL" | Position;

type QuarterState = {
  id: string;
  shape: string;
  assignments: (string | null)[];
};

const TITLE_SHORT: Record<MemberTitle, string> = {
  president: "회장",
  vice_president: "부회장",
  treasurer: "총무",
  auditor: "감사",
  head_coach: "감독",
  coach: "코치",
  player: "",
};

export default function FormationEditor({
  matchId,
  members,
  attendingIds,
  initialQuarters,
  readonly,
}: {
  matchId: string;
  members: EditorMember[];
  attendingIds: string[];
  initialQuarters: SavedQuarter[];
  readonly: boolean;
}) {
  const [quarters, setQuarters] = useState<QuarterState[]>(() =>
    initialQuarters.map((q) => {
      const slots = buildSlots(q.shape);
      return {
        id: q.id,
        shape: q.shape,
        assignments: slots.map((_, i) => q.player_ids[i] ?? null),
      };
    }),
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [, startTransition] = useTransition();
  const initialMount = useRef(true);
  const saveDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (readonly) return;
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    if (saveDebounce.current) clearTimeout(saveDebounce.current);
    saveDebounce.current = setTimeout(() => {
      setSaveStatus("saving");
      startTransition(async () => {
        const payload: SaveFormationPayload = {
          quarters: quarters.map((q) => ({
            id: q.id,
            shape: q.shape,
            player_ids: q.assignments,
          })),
        };
        try {
          const result = await saveFormation(matchId, payload);
          if (result?.error) setSaveStatus("error");
          else setSaveStatus("saved");
        } catch {
          setSaveStatus("error");
        }
        setTimeout(() => setSaveStatus("idle"), 1500);
      });
    }, 500);
    return () => {
      if (saveDebounce.current) clearTimeout(saveDebounce.current);
    };
  }, [quarters, matchId, readonly]);

  const current = quarters[activeIdx] ?? quarters[0];
  const slots = useMemo(() => buildSlots(current.shape), [current.shape]);
  const byId = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );
  const placedSet = useMemo(
    () => new Set(current.assignments.filter((v): v is string => !!v)),
    [current.assignments],
  );
  const attendingMembers = useMemo(() => {
    const set = new Set(attendingIds);
    return members
      .filter((m) => set.has(m.id))
      .sort((a, b) => {
        const an = a.jersey_number ?? 9999;
        const bn = b.jersey_number ?? 9999;
        return an - bn;
      });
  }, [members, attendingIds]);

  function patchQuarter(i: number, fn: (q: QuarterState) => QuarterState) {
    setQuarters((prev) => prev.map((q, idx) => (idx === i ? fn(q) : q)));
  }

  function changeShape(next: string) {
    patchQuarter(activeIdx, (q) => {
      const nextSlots = buildSlots(next);
      const seen = new Set<string>();
      const newAssignments: (string | null)[] = nextSlots.map((_, j) => {
        const pid = q.assignments[j] ?? null;
        if (pid && !seen.has(pid)) {
          seen.add(pid);
          return pid;
        }
        return null;
      });
      return { ...q, shape: next, assignments: newAssignments };
    });
    setOpenSlot(null);
  }

  function assignSlot(slotIndex: number, playerId: string | null) {
    patchQuarter(activeIdx, (q) => {
      const next = [...q.assignments];
      if (playerId) {
        for (let j = 0; j < next.length; j++) {
          if (j !== slotIndex && next[j] === playerId) next[j] = null;
        }
      }
      next[slotIndex] = playerId;
      return { ...q, assignments: next };
    });
    setOpenSlot(null);
  }

  function swapSlots(sourceIdx: number, targetIdx: number) {
    if (sourceIdx === targetIdx) return;
    patchQuarter(activeIdx, (q) => {
      const next = [...q.assignments];
      const tmp = next[targetIdx] ?? null;
      next[targetIdx] = next[sourceIdx] ?? null;
      next[sourceIdx] = tmp;
      return { ...q, assignments: next };
    });
    setOpenSlot(null);
  }

  function handleSlotDrop(targetIdx: number, playerId: string, sourceIdx?: number) {
    if (sourceIdx != null) {
      swapSlots(sourceIdx, targetIdx);
    } else {
      assignSlot(targetIdx, playerId);
    }
  }

  function unassignPlayer(playerId: string) {
    patchQuarter(activeIdx, (q) => ({
      ...q,
      assignments: q.assignments.map((p) => (p === playerId ? null : p)),
    }));
  }

  function findSlotForPlayer(playerId: string): number | null {
    const m = byId.get(playerId);
    const positions: Position[] = m?.positions ?? [];
    const assigns = current.assignments;
    // 1) 선수 본인 포지션 순으로 매칭
    for (const pos of positions) {
      for (let i = 0; i < slots.length; i++) {
        if (!assigns[i] && slots[i].role === pos) return i;
      }
    }
    // 3) 아무 빈 슬롯
    for (let i = 0; i < slots.length; i++) {
      if (!assigns[i]) return i;
    }
    return null;
  }

  function placeByClick(playerId: string) {
    const slot = findSlotForPlayer(playerId);
    if (slot != null) assignSlot(slot, playerId);
  }

  function autoPlace() {
    patchQuarter(activeIdx, (q) => {
      const qSlots = buildSlots(q.shape);
      const assignments = [...q.assignments];
      const placed = new Set(assignments.filter((v): v is string => !!v));
      for (const m of attendingMembers) {
        if (placed.has(m.id)) continue;
        const positions = m.positions ?? [];
        let assigned = false;
        for (const pos of positions) {
          const idx = qSlots.findIndex(
            (s, i) => !assignments[i] && s.role === pos,
          );
          if (idx >= 0) {
            assignments[idx] = m.id;
            placed.add(m.id);
            assigned = true;
            break;
          }
        }
        if (assigned) continue;
      }
      return { ...q, assignments };
    });
  }

  function resetCurrent() {
    if (!confirm(`${current.id} 배치를 모두 비우시겠습니까?`)) return;
    patchQuarter(activeIdx, (q) => ({
      ...q,
      assignments: buildSlots(q.shape).map(() => null),
    }));
  }

  function addQuarter() {
    if (quarters.length >= MAX_QUARTERS) return;
    const nextNum = quarters.length + 1;
    const newQ: QuarterState = {
      id: `${nextNum}Q`,
      shape: current.shape,
      assignments: buildSlots(current.shape).map(() => null),
    };
    setQuarters((prev) => [...prev, newQ]);
    setActiveIdx(quarters.length);
  }


  return (
    <div className="flex flex-col gap-5 desktop:flex-1 desktop:min-h-0">
      {/* 쿼터 탭 + 추가 버튼 */}
      <div className="-mx-1 px-1 overflow-x-auto">
        <div className="flex gap-2 w-max">
          {quarters.map((q, i) => {
            const active = i === activeIdx;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setActiveIdx(i)}
                className={`shrink-0 min-w-[64px] h-10 px-4 rounded-lg text-sm font-medium transition ${
                  active
                    ? "bg-suaza-button text-white shadow-sm"
                    : "bg-white text-suaza-ink-muted border border-suaza-border hover:text-suaza-ink"
                }`}
              >
                {q.id}
              </button>
            );
          })}
          {!readonly && quarters.length < MAX_QUARTERS && (
            <button
              type="button"
              onClick={addQuarter}
              aria-label="쿼터 추가"
              className="shrink-0 w-10 h-10 rounded-lg border border-dashed border-suaza-border text-suaza-ink-muted text-lg hover:border-suaza-button hover:text-suaza-button transition"
            >
              +
            </button>
          )}
        </div>
      </div>

      {/* 포메이션 칩 */}
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto sm:overflow-visible">
        <div className="flex gap-2 sm:flex-wrap sm:gap-2 w-max sm:w-auto">
          {FORMATIONS.map((f) => {
            const active = f.shape === current.shape;
            return (
              <button
                key={f.shape}
                type="button"
                disabled={readonly}
                onClick={() => changeShape(f.shape)}
                className={`shrink-0 h-10 px-4 rounded-xl border text-sm font-semibold transition ${
                  active
                    ? "bg-suaza-button text-white border-suaza-button shadow-sm"
                    : "bg-white text-suaza-ink border-suaza-border hover:border-suaza-ink-muted"
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {f.shape}
              </button>
            );
          })}
        </div>
      </div>

      {/* 모바일 전용 액션 바: 카운터 + 초기화 + 자동배치 + 저장 */}
      <div className="flex items-center gap-2 desktop:hidden">
        <span className="text-sm text-suaza-ink-muted shrink-0">
          배치{" "}
          <span className="font-semibold text-suaza-ink">
            {placedSet.size}/{slots.length}
          </span>
        </span>
        {!readonly && (
          <div className="flex-1 flex items-center justify-end gap-2">
            <SaveStatusBadge status={saveStatus} />
            <button
              type="button"
              onClick={resetCurrent}
              className="h-9 px-3 rounded-lg border border-suaza-border text-sm font-medium text-suaza-ink bg-white hover:bg-suaza-bg"
            >
              초기화
            </button>
            <button
              type="button"
              onClick={autoPlace}
              className="h-9 px-3 rounded-lg border border-suaza-border text-sm font-medium text-suaza-ink bg-white hover:bg-suaza-bg"
            >
              자동 배치
            </button>
          </div>
        )}
      </div>

      {/* 메인 영역 */}
      <div className="desktop:relative desktop:flex-1 desktop:min-h-0">
        <div className="relative desktop:pr-[360px] desktop:h-full">
          <Pitch
            slots={slots}
            assignments={current.assignments}
            byId={byId}
            readonly={readonly}
            draggingId={draggingId}
            onSlotClick={(i) => !readonly && setOpenSlot(i)}
            onSlotDrop={handleSlotDrop}
            onDragStart={(id) => setDraggingId(id)}
            onDragEnd={() => setDraggingId(null)}
            onSwapSlots={(a, b) => swapSlots(a, b)}
            onUnassignSlot={(i) => assignSlot(i, null)}
          />
        </div>

        <aside className="hidden desktop:flex desktop:absolute desktop:top-0 desktop:right-0 desktop:bottom-0 desktop:w-[340px] flex-col bg-white rounded-2xl border border-suaza-border p-4 gap-3 min-h-0">
          <PlayerRosterDesktop
            members={attendingMembers}
            quarters={quarters}
            placedSet={placedSet}
            readonly={readonly}
            onTap={(id: string, placed: boolean) => {
              if (readonly) return;
              if (placed) unassignPlayer(id);
              else placeByClick(id);
            }}
            onDragStart={(id: string) => setDraggingId(id)}
            onDragEnd={() => setDraggingId(null)}
          />
        </aside>
      </div>

      {/* 모바일 전용 선수 명단 (쿼터별 출전 현황) */}
      <PlayerRosterMobile
        members={attendingMembers}
        quarters={quarters}
        placedSet={placedSet}
        readonly={readonly}
        onTap={(id: string, placed: boolean) => {
          if (readonly) return;
          if (placed) unassignPlayer(id);
          else placeByClick(id);
        }}
        onDragStart={(id: string) => setDraggingId(id)}
        onDragEnd={() => setDraggingId(null)}
      />

      {/* 모바일 바텀시트 */}
      {openSlot != null && (
        <BottomSheet
          slot={slots[openSlot]}
          members={attendingMembers}
          placedSet={placedSet}
          currentPlayerId={current.assignments[openSlot]}
          onClose={() => setOpenSlot(null)}
          onPick={(id) => assignSlot(openSlot, id)}
          onClear={() => assignSlot(openSlot, null)}
        />
      )}
    </div>
  );
}

function Pitch({
  slots,
  assignments,
  byId,
  readonly,
  draggingId,
  onSlotClick,
  onSlotDrop,
  onDragStart,
  onDragEnd,
  onSwapSlots,
  onUnassignSlot,
}: {
  slots: SlotDef[];
  assignments: (string | null)[];
  byId: Map<string, EditorMember>;
  readonly: boolean;
  draggingId: string | null;
  onSlotClick: (i: number) => void;
  onSlotDrop: (targetIdx: number, playerId: string, sourceIdx?: number) => void;
  onDragStart?: (playerId: string) => void;
  onDragEnd?: () => void;
  onSwapSlots: (a: number, b: number) => void;
  onUnassignSlot: (i: number) => void;
}) {
  const pitchRef = useRef<HTMLDivElement | null>(null);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [pitchDrag, setPitchDrag] = useState<{
    sourceIdx: number;
    playerId: string;
    x: number;
    y: number;
    targetIdx: number | null;
  } | null>(null);
  const isDropMode = !readonly && draggingId != null;
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    return () => {
      if (lpTimer.current) clearTimeout(lpTimer.current);
    };
  }, []);

  function findSlotIdxFromPoint(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    let cur: HTMLElement | null = el;
    while (cur) {
      const attr = cur.dataset?.slotIdx;
      if (attr != null) return parseInt(attr, 10);
      cur = cur.parentElement;
    }
    return null;
  }

  function startLongPress(i: number, e: React.PointerEvent) {
    if (readonly) return;
    const pid = assignments[i];
    if (!pid) return; // 빈 슬롯에서는 드래그 시작 불가
    suppressClick.current = false;
    lpStart.current = { x: e.clientX, y: e.clientY };
    const target = e.currentTarget as HTMLElement;
    const ptrId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    if (lpTimer.current) clearTimeout(lpTimer.current);
    lpTimer.current = setTimeout(() => {
      setPitchDrag({
        sourceIdx: i,
        playerId: pid,
        x: startX,
        y: startY,
        targetIdx: null,
      });
      try {
        target.setPointerCapture(ptrId);
      } catch {}
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(40);
        } catch {}
      }
    }, 450);
  }

  function cancelLongPress() {
    if (lpTimer.current) {
      clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  }

  function onSlotPointerMove(e: React.PointerEvent) {
    // 롱프레스 발화 전 — 일정 거리 움직이면 타이머 취소(스크롤로 간주)
    if (lpTimer.current && lpStart.current) {
      const dx = e.clientX - lpStart.current.x;
      const dy = e.clientY - lpStart.current.y;
      if (dx * dx + dy * dy > 100) cancelLongPress();
    }
    // 드래그 중 — 손가락 따라 ghost 이동 + 타겟 추적
    if (pitchDrag) {
      const tIdx = findSlotIdxFromPoint(e.clientX, e.clientY);
      setPitchDrag({
        ...pitchDrag,
        x: e.clientX,
        y: e.clientY,
        targetIdx: tIdx != null && tIdx !== pitchDrag.sourceIdx ? tIdx : null,
      });
    }
  }

  function onSlotPointerUp(e: React.PointerEvent) {
    if (pitchDrag) {
      if (pitchDrag.targetIdx != null) {
        // 다른 슬롯 위에서 손을 뗌 → 교환
        onSwapSlots(pitchDrag.sourceIdx, pitchDrag.targetIdx);
      } else {
        // 경기장 밖이면 선수 제거, 안이면 취소
        const rect = pitchRef.current?.getBoundingClientRect();
        const outside =
          !rect ||
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom;
        if (outside) onUnassignSlot(pitchDrag.sourceIdx);
      }
      setPitchDrag(null);
      suppressClick.current = true;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
    cancelLongPress();
  }

  function handleSlotClick(i: number) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onSlotClick(i);
  }

  return (
    <div
      ref={pitchRef}
      className="relative w-full aspect-[3/4] desktop:aspect-auto desktop:h-full desktop:min-h-[360px] bg-gradient-to-b from-emerald-600 to-emerald-700 rounded-2xl overflow-hidden shadow-lg"
    >
      {/* 잔디 줄무늬 */}
      <div className="absolute inset-0 opacity-20">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`absolute left-0 right-0 ${i % 2 === 0 ? "bg-white/30" : ""}`}
            style={{ top: `${(i * 100) / 8}%`, height: `${100 / 8}%` }}
          />
        ))}
      </div>

      {/* 필드 라인 */}
      <div className="absolute inset-3 border-2 border-white/60 rounded-md" />
      <div className="absolute top-1/2 left-3 right-3 h-0.5 bg-white/60" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 border-white/60" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/80" />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[55%] h-[14%] border-2 border-t-0 border-white/60 rounded-b-sm" />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[55%] h-[14%] border-2 border-b-0 border-white/60 rounded-t-sm" />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[28%] h-[6%] border-2 border-t-0 border-white/60" />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[28%] h-[6%] border-2 border-b-0 border-white/60" />

      {/* 슬롯 */}
      {slots.map((s, i) => {
        const pid = assignments[i];
        const player = pid ? byId.get(pid) : null;
        const isDragSource = pitchDrag?.sourceIdx === i;
        const isDragTarget = pitchDrag?.targetIdx === i;
        const isHover = isDragTarget || hoverSlot === i;
        const isEmpty = !player;
        const showDropHint = isDropMode && isEmpty;
        const canDrag = !readonly && !!pid;
        return (
          <div
            key={s.index}
            className={`absolute -translate-x-1/2 -translate-y-1/2 select-none ${
              isDragSource ? "opacity-30" : ""
            }`}
            style={{
              left: `${s.x * 100}%`,
              top: `${s.y * 100}%`,
              WebkitTouchCallout: "none",
              touchAction: pitchDrag ? "none" : "manipulation",
            }}
            draggable={canDrag}
            data-slot-idx={i}
            onPointerDown={(e) => startLongPress(i, e)}
            onPointerMove={onSlotPointerMove}
            onPointerUp={onSlotPointerUp}
            onPointerCancel={onSlotPointerUp}
            onDragStart={(e) => {
              cancelLongPress();
              if (!canDrag || !pid) return;
              e.dataTransfer.setData("text/plain", pid);
              e.dataTransfer.setData(
                "application/x-source-slot",
                String(i),
              );
              e.dataTransfer.effectAllowed = "move";
              onDragStart?.(pid);
            }}
            onDragEnd={() => {
              setHoverSlot(null);
              onDragEnd?.();
            }}
            onDragOver={(e) => {
              if (readonly || !draggingId) return;
              e.preventDefault();
              setHoverSlot(i);
            }}
            onDragLeave={() => {
              if (hoverSlot === i) setHoverSlot(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setHoverSlot(null);
              const id = e.dataTransfer.getData("text/plain") || draggingId;
              if (!id) return;
              const sourceStr = e.dataTransfer.getData(
                "application/x-source-slot",
              );
              const sourceIdx = sourceStr ? parseInt(sourceStr, 10) : undefined;
              onSlotDrop(i, id, sourceIdx);
            }}
          >
            <button
              type="button"
              disabled={readonly}
              onClick={() => handleSlotClick(i)}
              className={`flex flex-col items-center gap-1 group ${
                readonly ? "cursor-default" : "cursor-pointer"
              } ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <PlayerCircle
                player={player}
                role={s.role}
                hovered={isHover}
                hint={showDropHint}
              />
              <span className="text-[11px] sm:text-xs text-white font-medium drop-shadow whitespace-nowrap max-w-[80px] truncate">
                {player?.name ?? (
                  <span className="text-white/70">{s.role}</span>
                )}
              </span>
            </button>
          </div>
        );
      })}

      {/* 드래그 ghost — 손가락 따라옴 */}
      {pitchDrag && (
        <div
          className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-1/2 drop-shadow-xl"
          style={{ left: pitchDrag.x, top: pitchDrag.y }}
        >
          <PlayerCircle
            player={byId.get(pitchDrag.playerId)}
            role={slots[pitchDrag.sourceIdx].role}
            hovered
            hint={false}
          />
        </div>
      )}
    </div>
  );
}

function SaveStatusBadge({
  status,
}: {
  status: "idle" | "saving" | "saved" | "error";
}) {
  if (status === "idle") return null;
  const map = {
    saving: { label: "저장 중...", cls: "bg-suaza-bg text-suaza-ink-muted" },
    saved: { label: "저장됨", cls: "bg-emerald-50 text-emerald-700" },
    error: { label: "저장 실패", cls: "bg-red-50 text-red-700" },
  } as const;
  const meta = map[status];
  return (
    <span
      className={`shrink-0 h-7 inline-flex items-center px-2.5 rounded-full text-[11px] font-medium ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

function PlayerCircle({
  player,
  role,
  hovered,
  hint,
}: {
  player: EditorMember | null | undefined;
  role: SlotRole;
  hovered: boolean;
  hint: boolean;
}) {
  const color = POSITION_COLOR[role];
  const stateRing = hovered ? "ring-4 ring-white/60 scale-110" : "";
  if (player) {
    return (
      <div
        className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white border-[3px] flex items-center justify-center text-[11px] font-bold shadow-md transition ${stateRing}`}
        style={{ borderColor: color }}
      >
        <span style={{ color }}>{role}</span>
      </div>
    );
  }
  return (
    <div
      className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 border-dashed flex items-center justify-center transition group-hover:bg-white/10 ${stateRing} ${hint ? "animate-pulse" : ""}`}
      style={{ borderColor: color, backgroundColor: `${color}33` }}
    >
      <span className="text-white/85 text-lg leading-none font-light">+</span>
    </div>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="이름/등번호 검색"
        className="w-full h-10 pl-9 pr-3 rounded-lg border border-suaza-border text-sm text-suaza-ink bg-white focus:outline-none focus:border-suaza-button"
      />
      <svg
        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-suaza-ink-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    </div>
  );
}

function FilterTabs({
  value,
  onChange,
}: {
  value: Filter;
  onChange: (v: Filter) => void;
}) {
  const items: { key: Filter; label: string }[] = [
    { key: "ALL", label: "전체" },
    ...POSITIONS.map((p) => ({ key: p as Filter, label: p })),
  ];
  return (
    <div className="flex gap-1">
      {items.map((it) => {
        const active = it.key === value;
        const color = it.key === "ALL" ? null : POSITION_COLOR[it.key];
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={`flex-1 h-8 rounded-md text-xs font-medium transition ${
              active
                ? "text-white shadow-sm"
                : "bg-suaza-bg text-suaza-ink-muted hover:text-suaza-ink"
            }`}
            style={active ? { backgroundColor: color ?? "#374151" } : undefined}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function PlayerList({
  members,
  placedSet,
  filter,
  query,
  readonly,
  emptyText,
  onTap,
  onDragStart,
  onDragEnd,
}: {
  members: EditorMember[];
  placedSet: Set<string>;
  filter: Filter;
  query: string;
  readonly: boolean;
  emptyText?: string;
  onTap: (id: string, placed: boolean) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (filter !== "ALL") {
        if (!(m.positions ?? []).includes(filter)) return false;
      }
      if (!q) return true;
      const name = m.name.toLowerCase();
      const num = m.jersey_number != null ? String(m.jersey_number) : "";
      return name.includes(q) || num.includes(q);
    });
  }, [members, filter, query]);

  // 미배치 → 배치 순 정렬 (미배치 강조)
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ap = placedSet.has(a.id) ? 1 : 0;
      const bp = placedSet.has(b.id) ? 1 : 0;
      if (ap !== bp) return ap - bp;
      const an = a.jersey_number ?? 9999;
      const bn = b.jersey_number ?? 9999;
      return an - bn;
    });
  }, [filtered, placedSet]);

  return (
    <div className="flex flex-col gap-1">
      {sorted.length === 0 && (
        <p className="py-6 text-center text-sm text-suaza-ink-muted">
          {emptyText ?? "해당 조건의 선수가 없습니다"}
        </p>
      )}
      {sorted.map((m) => {
        const placed = placedSet.has(m.id);
        return (
          <div
            key={m.id}
            draggable={!readonly && !placed}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", m.id);
              e.dataTransfer.effectAllowed = "move";
              onDragStart?.(m.id);
            }}
            onDragEnd={() => onDragEnd?.()}
            onClick={() => onTap(m.id, placed)}
            className={`flex items-center gap-2 px-2 py-2 rounded-lg select-none transition ${
              readonly ? "cursor-default" : "cursor-pointer"
            } ${
              placed
                ? "bg-suaza-bg/70 opacity-60 hover:opacity-100"
                : "bg-white hover:bg-suaza-bg"
            }`}
          >
            <div className="relative shrink-0">
              <PlayerAvatar member={m} dimmed={placed} />
              {placed && (
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-white">
                  ✓
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {m.jersey_number != null && (
                  <span className="text-[11px] font-mono text-suaza-ink-muted">
                    #{m.jersey_number}
                  </span>
                )}
                <span
                  className={`text-sm font-medium truncate ${
                    placed
                      ? "text-suaza-ink-muted line-through decoration-suaza-ink-muted/40"
                      : "text-suaza-ink"
                  }`}
                >
                  {m.name}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                {(m.positions ?? []).slice(0, 3).map((p) => (
                  <span
                    key={p}
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white"
                    style={{
                      backgroundColor: POSITION_COLOR[p],
                      opacity: placed ? 0.7 : 1,
                    }}
                  >
                    {p}
                  </span>
                ))}
                {m.title && m.title !== "player" && (
                  <span className="text-[10px] text-suaza-ink-muted">
                    {TITLE_SHORT[m.title]}
                  </span>
                )}
              </div>
            </div>
            {placed && (
              <span className="shrink-0 text-[10px] text-emerald-700 font-semibold px-2 py-0.5 rounded-full bg-emerald-100">
                배치됨
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlayerAvatar({
  member,
  dimmed,
}: {
  member: EditorMember;
  dimmed?: boolean;
}) {
  const cls = `w-9 h-9 rounded-full object-cover bg-suaza-bg ${
    dimmed ? "grayscale" : ""
  }`;
  if (member.avatar_url) {
    return (
      <Image
        src={member.avatar_url}
        alt={member.name}
        width={36}
        height={36}
        className={cls}
      />
    );
  }
  return (
    <div
      className={`w-9 h-9 rounded-full bg-suaza-bg flex items-center justify-center text-xs font-semibold text-suaza-ink-muted ${
        dimmed ? "opacity-70" : ""
      }`}
    >
      {member.name.slice(0, 1)}
    </div>
  );
}

type PlayerParticipation = {
  member: EditorMember;
  byQuarter: (Position | null)[];
  totalPlayed: number;
  positionsPlayed: Position[];
  hasPositionChange: boolean;
};

function computeParticipations(
  members: EditorMember[],
  quarters: { shape: string; assignments: (string | null)[] }[],
): PlayerParticipation[] {
  return members.map((m) => {
    const byQuarter: (Position | null)[] = quarters.map((q) => {
      const idx = q.assignments.indexOf(m.id);
      if (idx < 0) return null;
      const slots = buildSlots(q.shape);
      return (slots[idx]?.role as Position) ?? null;
    });
    const seen = new Set<Position>();
    const positionsPlayed: Position[] = [];
    for (const p of byQuarter) {
      if (p && !seen.has(p)) {
        seen.add(p);
        positionsPlayed.push(p);
      }
    }
    return {
      member: m,
      byQuarter,
      totalPlayed: byQuarter.filter((p): p is Position => p != null).length,
      positionsPlayed,
      hasPositionChange: positionsPlayed.length > 1,
    };
  });
}

function getTierColor(played: number): string {
  if (played >= 4) return "#22C55E";
  if (played === 3) return "#3B82F6";
  if (played === 2) return "#F59E0B";
  if (played === 1) return "#EF4444";
  return "#9CA3AF";
}

function LegendBar() {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-suaza-bg">
      <span className="text-xs">🎨</span>
      <span className="text-[11px] text-suaza-ink-muted">쿼터별 출전 포지션</span>
      <div className="flex items-center gap-2 ml-auto">
        {POSITIONS.map((p) => (
          <span key={p} className="inline-flex items-center gap-1 text-[10px] font-semibold text-suaza-ink">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: POSITION_COLOR[p] }}
            />
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

function QuarterTierCounters({
  tierCounts,
}: {
  tierCounts: number[]; // index 0..4 → count of players who played that many quarters
}) {
  const tiers = [4, 3, 2, 1] as const;
  return (
    <div className="grid grid-cols-4 gap-2 rounded-xl border border-suaza-border bg-white p-3">
      {tiers.map((t) => {
        const color = getTierColor(t);
        const n = tierCounts[t] ?? 0;
        return (
          <div key={t} className="flex flex-col items-center gap-0.5">
            <div className="inline-flex items-baseline gap-1">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-lg font-bold" style={{ color }}>
                {n}
              </span>
              <span className="text-[10px] text-suaza-ink-muted">명</span>
            </div>
            <span className="text-[10px] text-suaza-ink-muted">{t}Q</span>
          </div>
        );
      })}
    </div>
  );
}

function FilterTabsWithCounts({
  value,
  onChange,
  counts,
}: {
  value: Filter;
  onChange: (v: Filter) => void;
  counts: Record<Filter, number>;
}) {
  const items: { key: Filter; label: string }[] = [
    { key: "ALL", label: "전체" },
    ...POSITIONS.map((p) => ({ key: p as Filter, label: p })),
  ];
  return (
    <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
      {items.map((it) => {
        const active = it.key === value;
        const color = it.key === "ALL" ? "#1F2937" : POSITION_COLOR[it.key];
        const cnt = counts[it.key] ?? 0;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={`shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-semibold transition ${
              active
                ? "text-white shadow-sm"
                : "bg-white border border-suaza-border text-suaza-ink hover:bg-suaza-bg"
            }`}
            style={active ? { backgroundColor: color } : undefined}
          >
            {it.key !== "ALL" && (
              <span
                className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white/80" : ""}`}
                style={!active ? { backgroundColor: color } : undefined}
              />
            )}
            <span>{it.label}</span>
            <span className={active ? "text-white/80" : "text-suaza-ink-muted"}>
              {cnt}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PlayerRosterMobile({
  members,
  quarters,
  placedSet,
  readonly,
  onTap,
  onDragStart,
  onDragEnd,
}: {
  members: EditorMember[];
  quarters: { shape: string; assignments: (string | null)[] }[];
  placedSet: Set<string>;
  readonly: boolean;
  onTap: (id: string, placed: boolean) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
}) {
  const participations = useMemo(
    () => computeParticipations(members, quarters),
    [members, quarters],
  );
  const total = members.length;
  const played = participations.filter((p) => p.totalPlayed > 0).length;
  const sumQuarters = participations.reduce((s, p) => s + p.totalPlayed, 0);
  const avg = played > 0 ? (sumQuarters / played).toFixed(1) : "0.0";

  const tierCounts = useMemo(() => {
    const c = [0, 0, 0, 0, 0];
    for (const p of participations) {
      const t = Math.min(4, p.totalPlayed);
      c[t]++;
    }
    return c;
  }, [participations]);

  const sorted = useMemo(() => {
    return [...participations].sort((a, b) => {
      if (b.totalPlayed !== a.totalPlayed)
        return b.totalPlayed - a.totalPlayed;
      const an = a.member.jersey_number ?? 9999;
      const bn = b.member.jersey_number ?? 9999;
      return an - bn;
    });
  }, [participations]);

  if (members.length === 0) {
    return (
      <div className="desktop:hidden rounded-2xl border border-dashed border-suaza-border p-5 text-center text-sm text-suaza-ink-muted">
        참석으로 표시된 선수가 없습니다
      </div>
    );
  }

  return (
    <div className="desktop:hidden flex flex-col gap-3 rounded-2xl bg-white border border-suaza-border p-4">
      <div>
        <h3 className="text-base font-bold text-suaza-ink">선수명단</h3>
        <p className="text-xs text-suaza-ink-muted mt-0.5">
          총 {total}명 · 출전 {played}명 · 평균 {avg}쿼터
        </p>
      </div>
      <LegendBar />
      <QuarterTierCounters tierCounts={tierCounts} />
      <div className="grid grid-cols-2 gap-2">
        {sorted.map((p) => (
          <DesktopPlayerCard
            key={p.member.id}
            participation={p}
            placed={placedSet.has(p.member.id)}
            readonly={readonly}
            onTap={onTap}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerRowMobile({
  participation,
  placed,
  readonly,
  onTap,
  onDragStart,
  onDragEnd,
}: {
  participation: PlayerParticipation;
  placed: boolean;
  readonly: boolean;
  onTap: (id: string, placed: boolean) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
}) {
  const m = participation.member;
  const primary = m.positions?.[0];
  const primaryColor = primary ? POSITION_COLOR[primary] : "#9CA3AF";
  const tierColor = getTierColor(participation.totalPlayed);
  const hasPlayed = participation.totalPlayed > 0;

  return (
    <div
      style={{ touchAction: "manipulation" }}
      draggable={!readonly}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", m.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.(m.id);
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={() => !readonly && onTap(m.id, placed)}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border bg-white select-none transition ${
        readonly ? "cursor-default" : "cursor-pointer"
      } ${hasPlayed ? "border-suaza-border" : "border-suaza-border opacity-80"}`}
    >
      <div
        className={`shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold ${
          hasPlayed ? "" : "border-gray-200 text-gray-300"
        }`}
        style={hasPlayed ? { borderColor: primaryColor, color: primaryColor } : undefined}
      >
        {m.name.slice(0, 1)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold text-suaza-ink truncate">
            {m.name}
          </span>
          {m.jersey_number != null && (
            <span className="text-[11px] font-mono text-suaza-ink-muted shrink-0">
              #{m.jersey_number}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {!hasPlayed && (
            <span className="text-[10px] text-suaza-ink-muted">미출전</span>
          )}
          {participation.positionsPlayed.map((pos) => (
            <span
              key={pos}
              className="inline-flex items-center gap-0.5 text-[10px] font-semibold"
              style={{ color: POSITION_COLOR[pos] }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: POSITION_COLOR[pos] }}
              />
              {pos}
            </span>
          ))}
          {participation.hasPositionChange && (
            <span className="text-[10px] text-suaza-ink-muted">
              · 포지션 변경
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {participation.byQuarter.map((pos, i) => {
          const bg = pos ? POSITION_COLOR[pos] : null;
          return (
            <span
              key={i}
              className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold ${
                bg ? "text-white" : "bg-gray-100 text-gray-400"
              }`}
              style={bg ? { backgroundColor: bg } : undefined}
            >
              {i + 1}
            </span>
          );
        })}
      </div>

      <span
        className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
        style={{ backgroundColor: tierColor }}
      >
        {participation.totalPlayed}/{participation.byQuarter.length}
      </span>
    </div>
  );
}

function PlayerRosterDesktop({
  members,
  quarters,
  placedSet,
  readonly,
  onTap,
  onDragStart,
  onDragEnd,
}: {
  members: EditorMember[];
  quarters: { shape: string; assignments: (string | null)[] }[];
  placedSet: Set<string>;
  readonly: boolean;
  onTap: (id: string, placed: boolean) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

  const participations = useMemo(
    () => computeParticipations(members, quarters),
    [members, quarters],
  );
  const posCounts = useMemo(() => {
    const c: Record<Filter, number> = {
      ALL: members.length,
      GK: 0,
      DF: 0,
      MF: 0,
      FW: 0,
    };
    for (const m of members) {
      const primary = m.positions?.[0];
      if (primary) c[primary]++;
    }
    return c;
  }, [members]);
  const tierCounts = useMemo(() => {
    const c = [0, 0, 0, 0, 0];
    for (const p of participations) {
      const t = Math.min(4, p.totalPlayed);
      c[t]++;
    }
    return c;
  }, [participations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = participations;
    if (filter !== "ALL") {
      out = out.filter((p) => p.member.positions?.[0] === filter);
    }
    if (q) {
      out = out.filter((p) => {
        const name = p.member.name.toLowerCase();
        const num =
          p.member.jersey_number != null ? String(p.member.jersey_number) : "";
        return name.includes(q) || num.includes(q);
      });
    }
    return [...out].sort((a, b) => {
      if (b.totalPlayed !== a.totalPlayed)
        return b.totalPlayed - a.totalPlayed;
      const an = a.member.jersey_number ?? 9999;
      const bn = b.member.jersey_number ?? 9999;
      return an - bn;
    });
  }, [participations, filter, query]);

  return (
    <>
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-bold text-suaza-ink">선수 명단</h2>
        <span className="text-xs text-suaza-ink-muted">쿼터별 출전 현황</span>
      </div>
      <SearchInput value={query} onChange={setQuery} />
      <FilterTabsWithCounts
        value={filter}
        onChange={setFilter}
        counts={posCounts}
      />
      <LegendBar />
      <QuarterTierCounters tierCounts={tierCounts} />
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-suaza-ink-muted">
            {members.length === 0
              ? "참석으로 표시된 선수가 없습니다"
              : "해당 조건의 선수가 없습니다"}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((p) => (
              <PlayerRowMobile
                key={p.member.id}
                participation={p}
                placed={placedSet.has(p.member.id)}
                readonly={readonly}
                onTap={onTap}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function DesktopPlayerCard({
  participation,
  placed,
  readonly,
  onTap,
  onDragStart,
  onDragEnd,
}: {
  participation: PlayerParticipation;
  placed: boolean;
  readonly: boolean;
  onTap: (id: string, placed: boolean) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
}) {
  const m = participation.member;
  return (
    <div
      draggable={!readonly}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", m.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.(m.id);
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={() => !readonly && onTap(m.id, placed)}
      className={`flex items-center gap-2 p-2.5 rounded-xl border bg-white select-none transition ${
        readonly ? "cursor-default" : "cursor-pointer hover:bg-suaza-bg"
      } ${placed ? "border-emerald-200" : "border-suaza-border"}`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-suaza-ink truncate">
          {m.name}
        </div>
        <div className="text-[10px] text-suaza-ink-muted">
          {m.jersey_number != null ? `#${m.jersey_number}` : "—"}
        </div>
      </div>
      <div className="flex gap-0.5 shrink-0">
        {participation.byQuarter.map((pos, i) => (
          <span
            key={i}
            className={`w-3 h-5 rounded-sm ${pos ? "" : "bg-gray-200"}`}
            style={pos ? { backgroundColor: POSITION_COLOR[pos] } : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function BottomSheet({
  slot,
  members,
  placedSet,
  currentPlayerId,
  onClose,
  onPick,
  onClear,
}: {
  slot: SlotDef;
  members: EditorMember[];
  placedSet: Set<string>;
  currentPlayerId: string | null;
  onClose: () => void;
  onPick: (id: string) => void;
  onClear: () => void;
}) {
  const [filter, setFilter] = useState<Filter>(slot.role as Filter);
  const [query, setQuery] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-end desktop:items-center desktop:justify-center bg-black/40">
      <div className="absolute inset-0" onClick={onClose} aria-label="닫기" />
      <div className="relative w-full desktop:w-[420px] desktop:rounded-2xl bg-white rounded-t-2xl shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-suaza-border">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: POSITION_COLOR[slot.role] }}
            />
            <h3 className="text-base font-semibold text-suaza-ink">
              {slot.role} 슬롯에 배치
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-suaza-ink-muted hover:text-suaza-ink text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-3 flex flex-col gap-2 border-b border-suaza-border">
          <SearchInput value={query} onChange={setQuery} />
          <FilterTabs value={filter} onChange={setFilter} />
        </div>

        <div className="px-3 py-2 overflow-y-auto flex-1">
          <PlayerList
            members={members}
            placedSet={placedSet}
            filter={filter}
            query={query}
            readonly={false}
            onTap={(id) => onPick(id)}
          />
        </div>

        {currentPlayerId && (
          <div className="px-5 py-3 border-t border-suaza-border">
            <button
              type="button"
              onClick={onClear}
              className="w-full h-11 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50"
            >
              이 슬롯 비우기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
