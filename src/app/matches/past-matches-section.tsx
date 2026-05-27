"use client";

import Link from "next/link";
import { useState } from "react";
import { getTeamName, type Match } from "@/lib/matches/helpers";

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

function PastMatchCard({ match }: { match: Match }) {
  const isIntra = match.opponent === "자체전";
  const ourScore = match.our_score ?? 0;
  const oppScore = match.opponent_score ?? 0;
  // 표시되는 점수 기준으로 결과 산출 — 둘 다 미입력(=0/0)이어도 동률이면 무승부.
  const result: "win" | "draw" | "lose" =
    ourScore > oppScore ? "win" : ourScore < oppScore ? "lose" : "draw";
  const dateStr = formatLongDate(match.match_date);
  const timeStr = formatTime(match.match_date);
  const resultLabel =
    match.status === "canceled"
      ? "취소"
      : result === "draw"
        ? "무승부"
        : isIntra
          ? `${getTeamName(match, result === "win" ? "A" : "B")}승`
          : result === "win"
            ? "수아자FC승"
            : "수아자FC패";
  const resultClass =
    match.status === "canceled"
      ? "bg-gray-100 text-gray-500"
      : result === "win"
        ? "bg-green-100 text-green-700"
        : result === "lose"
          ? "bg-red-100 text-red-700"
          : "bg-gray-100 text-gray-700";

  return (
    <Link
      href={`/matches/${match.id}`}
      className="block bg-white rounded-xl border border-suaza-border p-4 hover:bg-gray-50 transition"
    >
      <div className="flex items-center gap-5">
        <div className="flex flex-col items-center gap-1 w-16 shrink-0">
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap ${resultClass}`}
          >
            {resultLabel}
          </span>
          {match.status !== "canceled" && (
            <span className="text-xl font-bold text-suaza-ink tabular-nums">
              {ourScore} : {oppScore}
            </span>
          )}
        </div>
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-suaza-ink truncate min-w-0">
              {isIntra
                ? `${getTeamName(match, "A")} vs ${getTeamName(match, "B")}`
                : `vs ${match.opponent}`}
            </span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${
                isIntra
                  ? "bg-purple-100 text-purple-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {isIntra ? "자체전" : "상대전"}
            </span>
          </div>
          <div className="text-xs text-suaza-ink-muted flex flex-col gap-0.5">
            <span>📅 {dateStr} {timeStr}</span>
            {match.location && <span>📍 {match.location}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}

function formatLongDate(iso: string): string {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  });
  const parts = fmt.formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  return `${year}년 ${month} ${day}일 (${weekday})`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(d);
}
