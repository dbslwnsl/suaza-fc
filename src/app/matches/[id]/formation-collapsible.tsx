"use client";

import { useState } from "react";

/**
 * 경기 상세에서 포메이션 임베드를 접고 펴는 wrapper.
 * 서버 자식(FormationEmbed)을 children 으로 받아 클라이언트 토글만 담당.
 * - 헤더 클릭 시 토글
 * - 접혀 있을 때 children 은 렌더되지 않아 무거운 데이터 로딩도 회피
 */
export default function FormationCollapsible({
  defaultExpanded = false,
  children,
}: {
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <section className="flex flex-col gap-4 desktop:bg-white desktop:rounded-2xl desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] desktop:p-8">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center justify-between gap-2 bg-white desktop:bg-transparent border border-suaza-border desktop:border-0 rounded-2xl desktop:rounded-none p-4 desktop:p-0 hover:bg-gray-50 desktop:hover:bg-transparent transition"
      >
        <span className="inline-flex items-center gap-2 font-bold text-suaza-ink text-lg">
          <span aria-hidden>⚽</span>
          포메이션
        </span>
        <span
          aria-hidden
          className={`text-suaza-ink-muted text-sm transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>
      {expanded && (
        <div className="desktop:h-[80vh] desktop:min-h-0 flex flex-col min-h-0 desktop:overflow-auto">
          {children}
        </div>
      )}
    </section>
  );
}
