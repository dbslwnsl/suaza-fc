"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { incrementMatchScore } from "@/lib/matches/actions";

export default function ScoreControl({
  matchId,
  ourScore,
  opponentScore,
}: {
  matchId: string;
  ourScore: number | null;
  opponentScore: number | null;
}) {
  const [our, setOur] = useState(ourScore ?? 0);
  const [opp, setOpp] = useState(opponentScore ?? 0);
  const [, startTransition] = useTransition();

  // 서버 데이터 변경 시 동기화 (revalidate 후 props 업데이트)
  useEffect(() => {
    setOur(ourScore ?? 0);
  }, [ourScore]);
  useEffect(() => {
    setOpp(opponentScore ?? 0);
  }, [opponentScore]);

  const change = (side: "our" | "opponent", delta: number) => {
    if (side === "our") setOur((v) => Math.max(0, v + delta));
    else setOpp((v) => Math.max(0, v + delta));
    startTransition(() => {
      incrementMatchScore(matchId, side, delta);
    });
  };

  return (
    <div className="flex items-center justify-center gap-2 desktop:gap-3 text-suaza-ink select-none">
      <ScoreTap value={our} onIncrement={() => change("our", 1)} onDecrement={() => change("our", -1)} />
      <span className="text-suaza-ink-muted font-bold text-sm desktop:text-xl">
        VS
      </span>
      <ScoreTap value={opp} onIncrement={() => change("opponent", 1)} onDecrement={() => change("opponent", -1)} />
    </div>
  );
}

/**
 * 탭: +1, 길게 누름: -/+ 팝오버 (참가 보드의 StatChip 롱프레스 패턴 참고)
 */
function ScoreTap({
  value,
  onIncrement,
  onDecrement,
}: {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const cancelTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const startTimer = () => {
    longPressFired.current = false;
    cancelTimer();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setPopoverOpen(true);
    }, 450);
  };
  const handleClick = () => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    onIncrement();
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={handleClick}
        onMouseDown={startTimer}
        onMouseUp={cancelTimer}
        onMouseLeave={cancelTimer}
        onTouchStart={startTimer}
        onTouchEnd={cancelTimer}
        onTouchCancel={cancelTimer}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={`점수 ${value}, 탭 +1 / 길게 눌러 ±`}
        className="text-3xl desktop:text-5xl font-bold tabular-nums leading-none px-1 py-0.5 rounded transition active:scale-95"
      >
        {value}
      </button>
      {popoverOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setPopoverOpen(false)}
            onTouchStart={() => setPopoverOpen(false)}
          />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40 flex items-stretch rounded-lg overflow-hidden shadow-lg select-none border-2 border-suaza-ink bg-white">
            <button
              type="button"
              onClick={onDecrement}
              disabled={value === 0}
              className="px-3 py-1.5 text-base font-bold text-white bg-suaza-ink disabled:opacity-40 disabled:cursor-not-allowed transition hover:opacity-90"
              aria-label="점수 감소"
            >
              −
            </button>
            <span className="px-4 py-1.5 text-base font-bold text-suaza-ink min-w-[2.5rem] text-center tabular-nums">
              {value}
            </span>
            <button
              type="button"
              onClick={onIncrement}
              className="px-3 py-1.5 text-base font-bold text-white bg-suaza-ink transition hover:opacity-90"
              aria-label="점수 증가"
            >
              +
            </button>
          </div>
        </>
      )}
    </span>
  );
}
