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
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [swapSourceIdx, setSwapSourceIdx] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSwapSourceIdx(null);
  }, [activeIdx]);

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
    // 1) 필터가 특정 포지션이면 그 라인의 빈 슬롯 우선
    if (filter !== "ALL") {
      for (let i = 0; i < slots.length; i++) {
        if (!assigns[i] && slots[i].role === filter) return i;
      }
    }
    // 2) 선수 본인 포지션 순으로 매칭
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

  function onSave() {
    const payload: SaveFormationPayload = {
      quarters: quarters.map((q) => ({
        id: q.id,
        shape: q.shape,
        player_ids: q.assignments,
      })),
    };
    startTransition(() => {
      saveFormation(matchId, payload);
    });
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
          <div className="flex-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={resetCurrent}
              disabled={isPending}
              className="h-9 px-3 rounded-lg border border-suaza-border text-sm font-medium text-suaza-ink bg-white hover:bg-suaza-bg disabled:opacity-50"
            >
              초기화
            </button>
            <button
              type="button"
              onClick={autoPlace}
              disabled={isPending}
              className="h-9 px-3 rounded-lg border border-suaza-border text-sm font-medium text-suaza-ink bg-white hover:bg-suaza-bg disabled:opacity-50"
            >
              자동 배치
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isPending}
              className="h-9 px-3 rounded-lg bg-suaza-button text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "저장 중" : "저장"}
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
            swapSourceIdx={swapSourceIdx}
            onSlotClick={(i) => !readonly && setOpenSlot(i)}
            onSlotDrop={handleSlotDrop}
            onDragStart={(id) => setDraggingId(id)}
            onDragEnd={() => setDraggingId(null)}
            onSwapSourceChange={setSwapSourceIdx}
            onSwapSlots={(a, b) => swapSlots(a, b)}
          />

          {swapSourceIdx !== null && (
            <div className="absolute left-3 right-3 top-3 z-10 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-50/95 border border-amber-200 shadow-sm">
              <span className="text-xs sm:text-sm text-amber-800 font-medium">
                교환할 다른 위치를 탭하세요
              </span>
              <button
                type="button"
                onClick={() => setSwapSourceIdx(null)}
                className="shrink-0 text-xs text-amber-800 hover:underline px-1"
              >
                취소
              </button>
            </div>
          )}
        </div>

        <aside className="hidden desktop:flex desktop:absolute desktop:top-0 desktop:right-0 desktop:bottom-0 desktop:w-[340px] flex-col bg-white rounded-2xl border border-suaza-border p-4 gap-3 min-h-0">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-suaza-ink">
              선수 명단
            </h2>
            <span className="text-xs text-suaza-ink-muted">
              배치{" "}
              <span className="font-semibold text-suaza-ink">
                {placedSet.size}
              </span>
              /{slots.length}
            </span>
          </div>
          <SearchInput value={query} onChange={setQuery} />
          <FilterTabs value={filter} onChange={setFilter} />
          {!readonly && (
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={resetCurrent}
                disabled={isPending}
                className="h-9 rounded-lg border border-suaza-border text-sm font-medium text-suaza-ink hover:bg-suaza-bg transition disabled:opacity-50"
              >
                초기화
              </button>
              <button
                type="button"
                onClick={autoPlace}
                disabled={isPending}
                className="h-9 rounded-lg bg-suaza-bg text-sm font-medium text-suaza-ink hover:bg-suaza-border/60 transition disabled:opacity-50"
              >
                자동 배치
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={isPending}
                className="h-9 rounded-lg bg-suaza-button text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {isPending ? "저장 중" : "저장"}
              </button>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2">
            <PlayerList
              members={attendingMembers}
              placedSet={placedSet}
              filter={filter}
              query={query}
              readonly={readonly}
              emptyText={
                attendingMembers.length === 0
                  ? "참석으로 표시된 선수가 없습니다"
                  : undefined
              }
              onTap={(id, placed) => {
                if (readonly) return;
                if (placed) unassignPlayer(id);
                else placeByClick(id);
              }}
              onDragStart={(id) => setDraggingId(id)}
              onDragEnd={() => setDraggingId(null)}
            />
          </div>
        </aside>
      </div>

      {/* 모바일 전용 참석 선수 칩 */}
      <AttendingStrip
        members={attendingMembers}
        placedSet={placedSet}
        readonly={readonly}
        onTap={(id, placed) => {
          if (readonly) return;
          if (placed) unassignPlayer(id);
          else placeByClick(id);
        }}
        onDragStart={(id) => setDraggingId(id)}
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
  swapSourceIdx,
  onSlotClick,
  onSlotDrop,
  onDragStart,
  onDragEnd,
  onSwapSourceChange,
  onSwapSlots,
}: {
  slots: SlotDef[];
  assignments: (string | null)[];
  byId: Map<string, EditorMember>;
  readonly: boolean;
  draggingId: string | null;
  swapSourceIdx: number | null;
  onSlotClick: (i: number) => void;
  onSlotDrop: (targetIdx: number, playerId: string, sourceIdx?: number) => void;
  onDragStart?: (playerId: string) => void;
  onDragEnd?: () => void;
  onSwapSourceChange: (i: number | null) => void;
  onSwapSlots: (a: number, b: number) => void;
}) {
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const isDropMode = !readonly && draggingId != null;
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpFired = useRef(false);
  const lpStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return () => {
      if (lpTimer.current) clearTimeout(lpTimer.current);
    };
  }, []);

  function startLongPress(i: number, e: React.PointerEvent) {
    if (readonly) return;
    lpFired.current = false;
    lpStart.current = { x: e.clientX, y: e.clientY };
    if (lpTimer.current) clearTimeout(lpTimer.current);
    lpTimer.current = setTimeout(() => {
      lpFired.current = true;
      onSwapSourceChange(i);
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

  function checkLongPressMove(e: React.PointerEvent) {
    if (!lpTimer.current || !lpStart.current) return;
    const dx = e.clientX - lpStart.current.x;
    const dy = e.clientY - lpStart.current.y;
    if (dx * dx + dy * dy > 100) cancelLongPress();
  }

  function handleSlotClick(i: number) {
    if (lpFired.current) {
      lpFired.current = false;
      return;
    }
    if (swapSourceIdx != null) {
      if (swapSourceIdx !== i) onSwapSlots(swapSourceIdx, i);
      onSwapSourceChange(null);
      return;
    }
    onSlotClick(i);
  }

  return (
    <div className="relative w-full aspect-[3/4] desktop:aspect-auto desktop:h-full desktop:min-h-[360px] bg-gradient-to-b from-emerald-600 to-emerald-700 rounded-2xl overflow-hidden shadow-lg">
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
        const isHover = hoverSlot === i;
        const isEmpty = !player;
        const showDropHint = isDropMode && isEmpty;
        const canDrag = !readonly && !!pid;
        const isSwapSource = swapSourceIdx === i;
        return (
          <div
            key={s.index}
            className="absolute -translate-x-1/2 -translate-y-1/2 touch-none"
            style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}
            draggable={canDrag}
            onPointerDown={(e) => startLongPress(i, e)}
            onPointerMove={checkLongPressMove}
            onPointerUp={cancelLongPress}
            onPointerCancel={cancelLongPress}
            onPointerLeave={cancelLongPress}
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
                selected={isSwapSource}
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
    </div>
  );
}

function PlayerCircle({
  player,
  role,
  hovered,
  hint,
  selected,
}: {
  player: EditorMember | null | undefined;
  role: SlotRole;
  hovered: boolean;
  hint: boolean;
  selected?: boolean;
}) {
  const color = POSITION_COLOR[role];
  const stateRing = selected
    ? "ring-4 ring-amber-300/90 scale-110 animate-pulse"
    : hovered
      ? "ring-4 ring-white/60 scale-110"
      : "";
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

function AttendingStrip({
  members,
  placedSet,
  readonly,
  onTap,
  onDragStart,
  onDragEnd,
}: {
  members: EditorMember[];
  placedSet: Set<string>;
  readonly: boolean;
  onTap: (id: string, placed: boolean) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
}) {
  if (members.length === 0) {
    return (
      <div className="desktop:hidden rounded-2xl border border-dashed border-suaza-border p-5 text-center text-sm text-suaza-ink-muted">
        참석으로 표시된 선수가 없습니다
      </div>
    );
  }
  const placedCount = members.filter((m) => placedSet.has(m.id)).length;
  return (
    <div className="desktop:hidden flex flex-col gap-2.5 rounded-2xl bg-white border border-suaza-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-suaza-ink">참석 선수</h3>
        <span className="text-xs text-suaza-ink-muted">
          배치{" "}
          <span className="font-semibold text-suaza-ink">
            {placedCount}
          </span>
          /{members.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => {
          const placed = placedSet.has(m.id);
          const primaryPos = m.positions?.[0];
          const posColor = primaryPos ? POSITION_COLOR[primaryPos] : null;
          return (
            <button
              key={m.id}
              type="button"
              disabled={readonly}
              draggable={!readonly}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", m.id);
                e.dataTransfer.effectAllowed = "move";
                onDragStart?.(m.id);
              }}
              onDragEnd={() => onDragEnd?.()}
              onClick={() => onTap(m.id, placed)}
              className={`shrink-0 inline-flex items-center gap-1.5 h-8 pl-2 pr-2.5 rounded-full border text-xs font-medium transition touch-none ${
                placed
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-white border-suaza-border text-suaza-ink hover:bg-suaza-bg"
              } ${!readonly ? "cursor-grab active:cursor-grabbing" : ""} disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white"
                style={{
                  backgroundColor: placed
                    ? "#10b981"
                    : (posColor ?? "#9CA3AF"),
                }}
              >
                {placed ? "✓" : (m.jersey_number ?? "·")}
              </span>
              <span className={placed ? "line-through decoration-emerald-400/60" : ""}>
                {m.name}
              </span>
            </button>
          );
        })}
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
