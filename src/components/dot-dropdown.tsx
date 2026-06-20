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
  weight = "font-medium",
  colorText = false,
  bordered = true,
  tint = false,
  showChevron = true,
  fit = false,
  triggerClassName = "",
  belowChevron = false,
  mutedPill = false,
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
  /** 글자 굵기 클래스 (기본 font-medium) */
  weight?: string;
  /** true 면 좌측 색 점 대신 라벨 글자 자체에 color 를 입힌다 */
  colorText?: boolean;
  /** false 면 트리거 테두리 제거 (기본 true) */
  bordered?: boolean;
  /** true 면 트리거 배경을 선택값 color 의 12% 알파로 (없으면 투명) */
  tint?: boolean;
  /** false 면 우측 ▾ 화살표 숨김 (기본 true) */
  showChevron?: boolean;
  /** true 면 트리거 너비를 내용에 맞춤(w-auto). 기본은 w-full */
  fit?: boolean;
  /** 트리거에 추가할 클래스 (고정 크기 등). 지정 시 기본 너비 클래스는 적용 안 함 */
  triggerClassName?: string;
  /** true 면 트리거 아래에 ▾를 두고, 그 ▾도 클릭 시 드롭다운을 연다 */
  belowChevron?: boolean;
  /** true 면 색 없이 회색 12% 알파 캡슐(내용 너비, 가운데)로 표시 — 주발 등 */
  mutedPill?: boolean;
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
      {!colorText && selected?.color ? (
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: selected.color }}
        />
      ) : null}
      {mutedPill ? (
        // 회색 12% 알파 캡슐 (내용 너비) — 주발 등
        <span
          className="inline-flex items-center justify-center px-3 h-[29px] rounded-full text-[14px] font-bold leading-none"
          style={{ color: "#99A3B8", backgroundColor: "#99A3B81F" }}
        >
          {label}
        </span>
      ) : colorText && !selected ? (
        // 비었을 때(예: 부포지션 없음): 회색 12% 알파 캡슐
        <span
          className="inline-flex items-center justify-center w-[41px] h-[29px] rounded-full text-[14px] font-bold leading-none"
          style={{ color: "#99A3B8", backgroundColor: "#99A3B81F" }}
        >
          {label}
        </span>
      ) : (
        <span
          className={selected ? "" : "text-suaza-ink-faint font-normal"}
          style={
            colorText && selected?.color ? { color: selected.color } : undefined
          }
        >
          {label}
        </span>
      )}
    </>
  );

  const tintStyle =
    tint && selected?.color
      ? { backgroundColor: `${selected.color}1F` }
      : undefined;
  const borderCls = bordered ? "border border-suaza-border" : "";
  const bgCls = tint ? "" : "bg-white";
  const widthCls = triggerClassName ? "" : fit ? "w-auto" : "w-full";
  const inlineWrap = fit || triggerClassName;

  if (readonly) {
    return (
      <span
        className={`flex ${widthCls} items-center gap-2 ${rounded} ${borderCls} ${bgCls} ${padding} ${textSize} ${weight} text-suaza-ink ${triggerClassName}`}
        style={tintStyle}
      >
        {inner}
      </span>
    );
  }

  return (
    <div
      ref={ref}
      className={
        belowChevron
          ? "relative inline-flex flex-col items-center"
          : inlineWrap
            ? "relative inline-block"
            : "relative"
      }
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={tintStyle}
        className={`flex ${widthCls} items-center gap-2 ${showChevron ? "" : "justify-center"} ${rounded} ${borderCls} ${bgCls} ${padding} ${textSize} ${weight} text-suaza-ink ${tint ? "" : "hover:bg-gray-50"} transition ${triggerClassName}`}
      >
        {inner}
        {showChevron && (
          <span aria-hidden className="ml-auto text-[10px] text-suaza-ink-faint">
            ▾
          </span>
        )}
      </button>
      {belowChevron && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="목록 열기"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-[10px] leading-none text-suaza-ink-faint"
        >
          ▾
        </button>
      )}
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
                className={`flex w-full items-center hover:bg-gray-50 ${
                  colorText
                    ? "justify-center px-2 py-1.5"
                    : "gap-2 px-3 py-2 text-sm text-left text-suaza-ink-muted"
                }`}
              >
                {colorText ? (
                  <span
                    className="inline-flex items-center justify-center w-[41px] h-[29px] rounded-full text-[14px] font-bold leading-none"
                    style={{ color: "#99A3B8", backgroundColor: "#99A3B81F" }}
                  >
                    {clearLabel}
                  </span>
                ) : (
                  clearLabel
                )}
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
                className={`flex w-full items-center ${
                  (colorText && o.color) || mutedPill
                    ? "justify-center px-2 py-1.5"
                    : "gap-2 px-3 py-2 text-sm text-left"
                } hover:bg-gray-50 ${
                  o.value === value ? "bg-gray-50" : ""
                }`}
              >
                {!colorText && !mutedPill && o.color ? (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: o.color }}
                  />
                ) : null}
                {mutedPill ? (
                  // 회색 12% 알파 캡슐 (내용 너비) — 주발 등
                  <span
                    className="inline-flex items-center justify-center px-3 h-[29px] rounded-full text-[14px] font-bold leading-none"
                    style={{ color: "#99A3B8", backgroundColor: "#99A3B81F" }}
                  >
                    {o.label}
                  </span>
                ) : colorText && o.color ? (
                  // 카드의 포지션 칩과 동일한 색 캡슐로 후보 표시
                  <span
                    className="inline-flex items-center justify-center w-[41px] h-[29px] rounded-full text-[14px] font-bold leading-none"
                    style={{ color: o.color, backgroundColor: `${o.color}1F` }}
                  >
                    {o.label}
                  </span>
                ) : (
                  <span className="text-suaza-ink">{o.label}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
