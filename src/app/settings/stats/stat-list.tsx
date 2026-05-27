"use client";

import { useRef, useState, useTransition } from "react";
import {
  removeStatDefinition,
  reorderStatDefinitions,
} from "@/lib/stats/actions";

type StatItem = { key: string; label: string; sort_order: number };

export default function StatList({ initial }: { initial: StatItem[] }) {
  const [items, setItems] = useState<StatItem[]>(initial);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpStart = useRef<{ x: number; y: number } | null>(null);

  const cancelLP = () => {
    if (lpTimer.current) {
      clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  };

  const startLongPress = (key: string, e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    const ptrId = e.pointerId;
    lpStart.current = { x: e.clientX, y: e.clientY };
    cancelLP();
    lpTimer.current = setTimeout(() => {
      setDraggingKey(key);
      try {
        target.setPointerCapture(ptrId);
      } catch {}
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(40);
        } catch {}
      }
    }, 450);
  };

  const onHandlePointerMove = (e: React.PointerEvent) => {
    // 길게 누르기 중에 손가락이 일정 이상 움직이면 long-press 취소 (스크롤 충돌 방지)
    if (lpTimer.current && lpStart.current) {
      const dx = e.clientX - lpStart.current.x;
      const dy = e.clientY - lpStart.current.y;
      if (dx * dx + dy * dy > 100) cancelLP();
    }
    if (!draggingKey) return;

    // 포인터 아래의 요소에서 data-stat-key 를 찾아 위치 교환
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    let cur: HTMLElement | null = el;
    while (cur) {
      const k = cur.dataset?.statKey;
      if (k && k !== draggingKey) {
        setItems((prev) => {
          const from = prev.findIndex((p) => p.key === draggingKey);
          const to = prev.findIndex((p) => p.key === k);
          if (from < 0 || to < 0 || from === to) return prev;
          const next = [...prev];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return next;
        });
        return;
      }
      cur = cur.parentElement;
    }
  };

  const endDrag = () => {
    cancelLP();
    if (draggingKey) {
      const order = items.map((i) => i.key);
      setDraggingKey(null);
      startTransition(() => {
        reorderStatDefinitions(order);
      });
    }
  };

  return (
    <ul className="flex flex-col gap-2">
      {items.map((d) => {
        const isProtected = d.key === "points" || d.label === "포인트";
        const dragging = draggingKey === d.key;
        return (
          <li
            key={d.key}
            data-stat-key={d.key}
            className={`flex items-center justify-between gap-3 p-3 border border-suaza-border rounded-lg bg-white transition ${
              dragging ? "ring-2 ring-suaza-button shadow-md" : ""
            }`}
          >
            <span className="font-medium text-suaza-ink">{d.label}</span>
            <div className="flex items-center gap-2 shrink-0">
              {isProtected ? (
                <span
                  className="text-[11px] text-suaza-ink-faint"
                  title="합계 항목은 삭제할 수 없습니다"
                >
                  합계
                </span>
              ) : (
                <form action={removeStatDefinition.bind(null, d.key)}>
                  <button
                    type="submit"
                    className="text-xs text-red-600 hover:underline"
                  >
                    삭제
                  </button>
                </form>
              )}
              {/* 드래그 핸들 — 길게 누르고 이동 */}
              <span
                role="button"
                aria-label="순서 변경 (길게 누르세요)"
                title="길게 눌러 순서 변경"
                onPointerDown={(e) => startLongPress(d.key, e)}
                onPointerMove={onHandlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerLeave={() => {
                  if (!draggingKey) cancelLP();
                }}
                className={`w-8 h-8 flex items-center justify-center text-suaza-ink-muted select-none ${
                  dragging ? "cursor-grabbing" : "cursor-grab"
                }`}
                style={{ touchAction: "none" }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                >
                  <line x1="4" y1="8" x2="20" y2="8" />
                  <line x1="4" y1="16" x2="20" y2="16" />
                </svg>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
