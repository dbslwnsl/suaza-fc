"use client";

import { useEffect, useRef, useState } from "react";

// 색 점 + 텍스트 + ▾ 형태의 커스텀 드롭다운 (프로필/회원가입 공용).
// readonly 면 정적 박스로 표시. options.color 가 있으면 좌측에 색 점을 표시한다.
export default function Dropdown<T extends string>({
  value,
  options,
  onChange,
  placeholder = "선택",
  readonly = false,
  allowClear = false,
  clearLabel = "없음",
  rounded = "rounded-xl",
  textSize = "text-xs",
  padding = "px-2.5 py-1.5",
}: {
  value: T | null;
  options: { value: T; label: string; color?: string }[];
  onChange: (v: T | null) => void;
  placeholder?: string;
  readonly?: boolean;
  allowClear?: boolean;
  clearLabel?: string;
  /** 박스 모서리 둥글기 클래스 (기본 rounded-xl) */
  rounded?: string;
  /** 트리거 글자 크기 (기본 text-xs) */
  textSize?: string;
  /** 트리거 안쪽 여백 (기본 px-2.5 py-1.5) */
  padding?: string;
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
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? null;
  const label = selected ? selected.label : readonly ? "미설정" : placeholder;

  const inner = (
    <>
      {selected?.color ? (
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: selected.color }}
        />
      ) : null}
      <span className={selected ? "" : "text-suaza-ink-faint font-normal"}>
        {label}
      </span>
    </>
  );

  if (readonly) {
    return (
      <span
        className={`flex w-full items-center gap-2 ${rounded} border border-suaza-border bg-white ${padding} ${textSize} font-medium text-suaza-ink`}
      >
        {inner}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center gap-2 ${rounded} border border-suaza-border bg-white ${padding} ${textSize} font-medium text-suaza-ink hover:bg-gray-50 transition`}
      >
        {inner}
        <span aria-hidden className="ml-auto text-[10px] text-suaza-ink-faint">
          ▾
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-20 left-0 mt-1 max-h-60 min-w-full overflow-y-auto whitespace-nowrap rounded-xl border border-suaza-border bg-white shadow-lg py-1"
        >
          {allowClear && (
            <li>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-suaza-ink-muted hover:bg-gray-50"
              >
                {clearLabel}
              </button>
            </li>
          )}
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                  o.value === value
                    ? "bg-gray-50 font-medium text-suaza-ink"
                    : "text-suaza-ink"
                }`}
              >
                {o.color ? (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: o.color }}
                  />
                ) : null}
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
