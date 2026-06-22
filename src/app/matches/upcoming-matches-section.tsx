"use client";

import Link from "next/link";
import { useState } from "react";
import { getTeamName, type Match } from "@/lib/matches/helpers";
import type { WeatherInfo } from "@/lib/weather";

const MOBILE_LIMIT = 2;
const DESKTOP_LIMIT = 4;

export default function UpcomingMatchesSection({
  matches,
  weathers,
  isStaff = false,
}: {
  matches: Match[];
  weathers: (WeatherInfo | null)[];
  /** true 면 헤더 우측에 "+ 새 경기" 버튼 표시 */
  isStaff?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const moreOnMobile = matches.length > MOBILE_LIMIT;
  const moreOnDesktop = matches.length > DESKTOP_LIMIT;
  const showButton = !expanded && (moreOnMobile || moreOnDesktop);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-suaza-ink">예정된 경기</h2>
          <span className="text-sm text-suaza-ink-muted">
            · {matches.length}경기
          </span>
        </div>
        {isStaff && (
          <Link
            href="/matches/new"
            className="shrink-0 whitespace-nowrap text-xs font-medium px-3 py-1.5 rounded-md bg-suaza-ink text-white hover:opacity-90 transition"
          >
            + 새 경기
          </Link>
        )}
      </div>
      {matches.length === 0 && (
        <p className="text-sm text-suaza-ink-muted py-2">
          예정된 경기가 없습니다.
        </p>
      )}
      <div className="grid grid-cols-1 gap-0 divide-y divide-suaza-border sm:grid-cols-2 sm:gap-4 sm:divide-y-0">
        {matches.map((m, i) => {
          let hideCls = "";
          if (!expanded) {
            if (i >= DESKTOP_LIMIT) {
              hideCls = "hidden";
            } else if (i >= MOBILE_LIMIT) {
              hideCls = "hidden sm:block";
            }
          }
          return (
            <div
              key={m.id}
              className={`${hideCls} py-4 first:pt-0 sm:py-0`.trim()}
            >
              <UpcomingMatchCard match={m} weather={weathers[i] ?? null} />
            </div>
          );
        })}
      </div>
      {showButton && (
        <div
          className={`flex justify-center mt-2 ${
            moreOnDesktop ? "" : "sm:hidden"
          }`}
        >
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-sm text-suaza-ink border border-suaza-border rounded-full px-5 py-2 hover:bg-gray-50 transition"
          >
            예정된 경기 더 보기
          </button>
        </div>
      )}
    </section>
  );
}

function UpcomingMatchCard({
  match,
  weather,
}: {
  match: Match;
  weather: WeatherInfo | null;
}) {
  const isIntra = match.opponent === "자체전";
  // 좌측 컬러바·태그 색 — 자체전(보라) / 상대전(빨강)
  const accent = isIntra ? "#8B5CF6" : "#F0524F";
  const dDay = computeDDay(match.match_date);
  const dateStr = formatLongDate(match.match_date);
  const timeStr = formatTime(match.match_date);

  return (
    <Link
      href={`/matches/${match.id}`}
      className="block transition hover:opacity-70"
    >
      <div className="flex gap-3">
        <span
          aria-hidden
          className="w-1 shrink-0 self-stretch rounded-full"
          style={{ backgroundColor: accent }}
        />
        <div className="flex flex-1 min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold text-suaza-ink truncate min-w-0">
              {isIntra
                ? `${getTeamName(match, "A")} vs ${getTeamName(match, "B")}`
                : `vs ${match.opponent}`}
            </h3>
            <span
              className="shrink-0 text-xs font-medium"
              style={{ color: accent }}
            >
              {isIntra ? "자체전" : "상대전"}
            </span>
          </div>
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-suaza-ink-muted flex items-center gap-2 min-w-0">
            <span className="shrink-0">{dateStr}</span>
            <span className="shrink-0 tabular-nums">{timeStr}</span>
            {dDay && (
              <span className="ml-auto shrink-0 text-xs font-medium text-amber-700">
                {dDay}
              </span>
            )}
          </div>
          {(match.location || weather) && (
            <div className="text-xs flex items-center gap-2 tabular-nums">
              {match.location && (
                <span className="truncate min-w-0 text-suaza-ink-muted">
                  {match.location}
                </span>
              )}
              {weather && (
                <span className="inline-flex items-center gap-1.5 shrink-0 ml-auto">
                  <span className="text-suaza-ink font-medium">
                    {weather.tempMax}°
                  </span>
                  <span className="text-sm">{weather.emoji}</span>
                  <span className="text-sky-700">
                    강수 {weather.precipitationProbability}%
                  </span>
                </span>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function computeDDay(iso: string): string | null {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 86400000);
  if (diff === 0) return "D-DAY";
  if (diff > 0) return `D-${diff}`;
  return null;
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
