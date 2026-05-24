"use client";

import { useEffect, useRef, useState } from "react";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

type View = { year: number; month: number };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toYMD(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function parseView(v: string): View {
  if (v) {
    const m = v.match(/^(\d{4})-(\d{2})-/);
    if (m) return { year: Number(m[1]), month: Number(m[2]) };
  }
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function todayYMD(): string {
  const d = new Date();
  return toYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function formatDateKo(v: string): string {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return v;
  const [, y, mo, d] = m;
  return `${y}년 ${Number(mo)}월 ${Number(d)}일`;
}

function addMonths(view: View, delta: number): View {
  const total = view.month - 1 + delta;
  const newY = view.year + Math.floor(total / 12);
  let newM = total % 12;
  if (newM < 0) newM += 12;
  return { year: newY, month: newM + 1 };
}

function buildMonthDays(year: number, month: number) {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const start = 1 - firstDow;
  const cells: { year: number; month: number; day: number; iso: string }[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(year, month - 1, start + i);
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    cells.push({ year: y, month: m, day: d, iso: toYMD(y, m, d) });
  }
  return cells;
}

export default function DatePicker({
  value,
  onChange,
  required,
  placeholder = "날짜 선택",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>(() => parseView(value));
  const [mode, setMode] = useState<"days" | "years">("days");
  // 연도 선택 모드에서 보여줄 12년 묶음의 시작값
  const [yearPageStart, setYearPageStart] = useState<number>(() =>
    parseView(value).year - 5,
  );
  const ref = useRef<HTMLDivElement>(null);

  // 외부값 변경 시 뷰 동기화
  useEffect(() => {
    if (value) setView(parseView(value));
  }, [value]);

  // 팝업 닫힐 때 days 모드로 초기화
  useEffect(() => {
    if (!open) setMode("days");
  }, [open]);

  // 바깥 클릭 / Esc 닫기
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const today = todayYMD();
  const days = buildMonthDays(view.year, view.month);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input
        type="text"
        readOnly
        required={required}
        value={value ? formatDateKo(value) : ""}
        placeholder={placeholder}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink bg-white placeholder:text-suaza-placeholder focus:outline-none focus:border-suaza-button cursor-pointer"
      />

      {open && (
        <div className="absolute z-30 top-full left-0 mt-2 w-[300px] bg-white rounded-xl border border-suaza-border shadow-lg p-3">
          {/* 헤더: 모드별 이전/다음 + 라벨 토글 */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => {
                if (mode === "days") setView(addMonths(view, -1));
                else setYearPageStart((s) => s - 12);
              }}
              className="w-8 h-8 rounded-md hover:bg-gray-100 text-suaza-ink flex items-center justify-center"
              aria-label={mode === "days" ? "이전 달" : "이전 12년"}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                if (mode === "days") {
                  setYearPageStart(view.year - 5);
                  setMode("years");
                } else {
                  setMode("days");
                }
              }}
              className="text-sm font-bold text-suaza-ink tabular-nums hover:bg-gray-100 rounded-md px-2 py-1 transition"
              aria-label="연도 선택"
            >
              {mode === "days"
                ? `${view.year}년 ${view.month}월`
                : `${yearPageStart} - ${yearPageStart + 11}`}
            </button>
            <button
              type="button"
              onClick={() => {
                if (mode === "days") setView(addMonths(view, 1));
                else setYearPageStart((s) => s + 12);
              }}
              className="w-8 h-8 rounded-md hover:bg-gray-100 text-suaza-ink flex items-center justify-center"
              aria-label={mode === "days" ? "다음 달" : "다음 12년"}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {mode === "days" ? (
            <>
              {/* 요일 라벨 */}
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {DAY_LABELS.map((d, i) => (
                  <div
                    key={d}
                    className={`text-center text-[10px] py-1 font-medium ${
                      i === 0
                        ? "text-red-500"
                        : i === 6
                          ? "text-blue-500"
                          : "text-suaza-ink-muted"
                    }`}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* 날짜 그리드 */}
              <div className="grid grid-cols-7 gap-0.5">
                {days.map((d, i) => {
                  const dow = i % 7;
                  const isCurrentMonth = d.month === view.month;
                  const isSelected = d.iso === value;
                  const isToday = d.iso === today;
                  const baseColor = !isCurrentMonth
                    ? "text-suaza-ink-faint"
                    : dow === 0
                      ? "text-red-500"
                      : dow === 6
                        ? "text-blue-500"
                        : "text-suaza-ink";
                  return (
                    <button
                      key={d.iso + "-" + i}
                      type="button"
                      onClick={() => {
                        onChange(d.iso);
                        setOpen(false);
                      }}
                      className={`text-xs tabular-nums w-9 h-9 rounded-md transition flex items-center justify-center ${
                        isSelected
                          ? "bg-suaza-ink text-white font-bold"
                          : `${baseColor} ${
                              isToday ? "ring-1 ring-suaza-accent" : ""
                            } hover:bg-gray-100`
                      }`}
                    >
                      {d.day}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            // 연도 그리드 (4×3 = 12년)
            <div className="grid grid-cols-3 gap-1.5 py-2">
              {Array.from({ length: 12 }, (_, i) => yearPageStart + i).map(
                (y) => {
                  const isCurrent = y === view.year;
                  const isThisYear = y === new Date().getFullYear();
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => {
                        setView({ year: y, month: view.month });
                        setMode("days");
                      }}
                      className={`text-sm tabular-nums h-10 rounded-md transition ${
                        isCurrent
                          ? "bg-suaza-ink text-white font-bold"
                          : `text-suaza-ink ${
                              isThisYear ? "ring-1 ring-suaza-accent" : ""
                            } hover:bg-gray-100`
                      }`}
                    >
                      {y}
                    </button>
                  );
                },
              )}
            </div>
          )}

          {/* 푸터: 오늘 / 지우기 */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-suaza-border">
            <button
              type="button"
              onClick={() => {
                onChange(today);
                setOpen(false);
              }}
              className="text-xs font-medium text-suaza-ink hover:text-suaza-accent"
            >
              오늘
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-xs font-medium text-suaza-ink-muted hover:text-suaza-accent"
              >
                지우기
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
