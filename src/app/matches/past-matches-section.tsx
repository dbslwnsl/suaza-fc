"use client";

import { useState } from "react";
import { type Match } from "@/lib/matches/helpers";
import PastMatchCard from "./past-match-card";

type Filter = "all" | "external" | "intra";

const INITIAL_LIMIT = 4;

export default function PastMatchesSection({ matches }: { matches: Match[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(false);

  const filtered = matches.filter((m) => {
    if (filter === "all") return true;
    if (filter === "intra") return m.opponent === "자체전";
    return m.opponent !== "자체전";
  });
  const visible = expanded ? filtered : filtered.slice(0, INITIAL_LIMIT);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-suaza-ink">지난 경기</h2>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <FilterButton
            active={filter === "all"}
            onClick={() => setFilter("all")}
          >
            전체
          </FilterButton>
          <FilterButton
            active={filter === "external"}
            onClick={() => setFilter("external")}
          >
            상대전
          </FilterButton>
          <FilterButton
            active={filter === "intra"}
            onClick={() => setFilter("intra")}
          >
            자체전
          </FilterButton>
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-suaza-ink-muted text-center py-8">
          해당 조건의 경기가 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-0 divide-y divide-suaza-border sm:grid-cols-2 sm:gap-4 sm:divide-y-0">
          {visible.map((m) => (
            <div key={m.id} className="py-4 first:pt-0 sm:py-0">
              <PastMatchCard match={m} />
            </div>
          ))}
        </div>
      )}
      {filtered.length > INITIAL_LIMIT && !expanded && (
        <div className="flex justify-center -mt-3">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="지난 경기 더 보기"
            className="w-9 h-9 inline-flex items-center justify-center rounded-full text-suaza-ink-muted hover:text-suaza-ink hover:bg-gray-50 transition"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center h-6 px-3 text-[11px] font-medium rounded-md transition ${
        active
          ? "bg-suaza-ink text-white"
          : "text-suaza-ink-muted hover:text-suaza-ink"
      }`}
    >
      {children}
    </button>
  );
}
