"use client";

import { useEffect, useRef, useState } from "react";

export default function TimePicker({
  value,
  onChange,
  options,
  required,
  placeholder = "시간 선택",
  rounded = "rounded-lg",
  textSize = "text-base",
  padding = "px-4 py-3",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
  placeholder?: string;
  /** 입력창 모서리 둥글기 클래스 (기본 rounded-lg) */
  rounded?: string;
  /** 입력창 글씨 크기 클래스 (기본 text-base) */
  textSize?: string;
  /** 입력창 패딩 클래스 (기본 px-4 py-3) */
  padding?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  // 열릴 때 현재 선택값으로 스크롤 (중앙 정렬)
  useEffect(() => {
    if (open && value && listRef.current) {
      const idx = options.indexOf(value);
      if (idx >= 0) {
        const child = listRef.current.children[idx] as
          | HTMLElement
          | undefined;
        if (child) {
          listRef.current.scrollTop =
            child.offsetTop - listRef.current.clientHeight / 2 + child.offsetHeight / 2;
        }
      }
    }
  }, [open, value, options]);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        readOnly
        required={required}
        value={value || ""}
        placeholder={placeholder}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className={`w-full ${padding} ${rounded} border border-suaza-border ${textSize} text-suaza-ink bg-white placeholder:text-suaza-placeholder focus:outline-none focus:border-suaza-button cursor-pointer`}
      />
      {open && (
        <div className="absolute z-30 top-full left-0 mt-2 w-full min-w-[140px] bg-white rounded-xl border border-suaza-border shadow-lg p-2">
          <div ref={listRef} className="max-h-[240px] overflow-y-auto">
            {options.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                }}
                className={`block w-full text-center px-3 py-2 rounded-md text-sm tabular-nums transition ${
                  t === value
                    ? "bg-suaza-ink text-white font-bold"
                    : "text-suaza-ink hover:bg-gray-100"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
