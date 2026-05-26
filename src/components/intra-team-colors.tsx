"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

type IntraColorsContextValue = {
  colorA: string;
  colorB: string;
  setColorA: (color: string) => void;
  setColorB: (color: string) => void;
};

const IntraColorsContext = createContext<IntraColorsContextValue | null>(null);

/**
 * 자체전 A·B 팀 유니폼 색을 페이지 트리 내에서 공유한다.
 * - TeamBuilder 의 색 선택이 즉시 VSCard 상단 동그라미에도 반영되도록 한다.
 * - 서버 액션은 백그라운드로 진행되므로, server revalidate 응답을 기다리지 않는다.
 */
export function IntraTeamColorsProvider({
  initialA,
  initialB,
  children,
}: {
  initialA: string;
  initialB: string;
  children: ReactNode;
}) {
  const [colorA, setColorA] = useState(initialA);
  const [colorB, setColorB] = useState(initialB);
  return (
    <IntraColorsContext.Provider
      value={{ colorA, colorB, setColorA, setColorB }}
    >
      {children}
    </IntraColorsContext.Provider>
  );
}

export function useIntraTeamColors(): IntraColorsContextValue | null {
  return useContext(IntraColorsContext);
}

// hex 색상의 밝기 판단 (page.tsx 의 isLightHex 와 동일 로직)
function isLightHex(hex: string): boolean {
  const m = hex.match(/^#([0-9A-Fa-f]{6})$/);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b > 200;
}

/**
 * 자체전 VSCard 의 A·B 팀 동그라미. Provider 가 있으면 context 색을 즉시 반영,
 * 없으면 서버 prop(fallbackColor) 그대로 표시.
 */
export function IntraTeamCircle({
  letter,
  subtitle,
  fallbackColor,
}: {
  letter: "A" | "B";
  subtitle: string;
  fallbackColor: string;
}) {
  const ctx = useIntraTeamColors();
  const color =
    ctx == null
      ? fallbackColor
      : letter === "A"
        ? ctx.colorA
        : ctx.colorB;
  const letterTextCls = isLightHex(color) ? "text-suaza-ink" : "text-white";
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-16 h-16 desktop:w-24 desktop:h-24 rounded-full flex items-center justify-center transition-colors"
        style={{ backgroundColor: color }}
      >
        <span
          className={`text-2xl desktop:text-4xl font-bold ${letterTextCls}`}
        >
          {letter}
        </span>
      </div>
      <span className="text-sm desktop:text-lg font-bold text-suaza-ink text-center break-keep">
        {subtitle}
      </span>
    </div>
  );
}
