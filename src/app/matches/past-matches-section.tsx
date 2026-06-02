"use client";

import { useState } from "react";
import { type Match } from "@/lib/matches/helpers";
import PastMatchCard from "./past-match-card";

type Filter = "all" | "external" | "intra";

const INITIAL_LIMIT = 4;

export default function PastMatchesSection({
  matches,
}: {
  matches: Match[];
}) {
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
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
            전체
          </FilterButton>
          <FilterButton
            active={filter === "external"}
            onClick={() => setFilter("external")}
          >
            상대전
          </FilterButton>
          <FilterButton active={filter === "intra"} onClick={() => setFilter("intra")}>
            자체전
          </FilterButton>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {visible.length === 0 ? (
          <p className="text-sm text-suaza-ink-muted text-center py-8">
            해당 조건의 경기가 없습니다.
          </p>
        ) : (
          visible.map((m) => <PastMatchCard key={m.id} match={m} />)
        )}
      </div>
      {filtered.length > INITIAL_LIMIT && !expanded && (
        <div className="flex justify-center mt-2">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-sm text-suaza-ink border border-suaza-border rounded-full px-5 py-2 hover:bg-gray-50 transition"
          >
            지난 경기 더 보기
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
      className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
        active
          ? "bg-suaza-ink text-white"
          : "text-suaza-ink-muted hover:text-suaza-ink"
      }`}
    >
      {children}
    </button>
  );
}

