"use client";

import Link from "next/link";
import { useState } from "react";
import type { Match } from "@/lib/matches/helpers";
import type { WeatherInfo } from "@/lib/weather";

const MOBILE_LIMIT = 2;
const DESKTOP_LIMIT = 3;

export default function UpcomingMatchesSection({
  matches,
  weathers,
}: {
  matches: Match[];
  weathers: (WeatherInfo | null)[];
}) {
  const [expanded, setExpanded] = useState(false);
  const moreOnMobile = matches.length > MOBILE_LIMIT;
  const moreOnDesktop = matches.length > DESKTOP_LIMIT;
  const showButton = !expanded && (moreOnMobile || moreOnDesktop);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-suaza-ink">예정된 경기</h2>
        <span className="text-sm text-suaza-ink-muted">· {matches.length}경기</span>
      </div>
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-3">
        {matches.map((m, i) => {
          let hideCls = "";
          if (!expanded) {
            if (i >= DESKTOP_LIMIT) {
              hideCls = "hidden";
            } else if (i >= MOBILE_LIMIT) {
              hideCls = "hidden desktop:block";
            }
          }
          return (
            <div key={m.id} className={hideCls}>
              <UpcomingMatchCard match={m} weather={weathers[i] ?? null} />
            </div>
          );
        })}
      </div>
      {showButton && (
        <div
          className={`flex justify-center mt-2 ${
            moreOnDesktop ? "" : "desktop:hidden"
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
  const dDay = computeDDay(match.match_date);
  const dateStr = formatLongDate(match.match_date);
  const timeStr = formatTime(match.match_date);

  return (
    <Link
      href={`/matches/${match.id}`}
      className="block bg-white rounded-xl border border-suaza-border p-5 hover:shadow-md transition"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-suaza-ink truncate min-w-0">
            {isIntra ? "A팀 vs B팀" : `vs ${match.opponent}`}
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            {dDay && (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                {dDay}
              </span>
            )}
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded ${
                isIntra
                  ? "bg-purple-100 text-purple-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {isIntra ? "자체전" : "상대전"}
            </span>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 flex flex-col gap-1.5">
          <div className="text-sm text-suaza-ink font-medium flex items-center justify-between gap-2">
            <span className="truncate">{dateStr}</span>
            <span className="shrink-0 tabular-nums">{timeStr}</span>
          </div>
          {(match.location || weather) && (
            <div className="text-xs text-suaza-ink-muted flex items-center justify-between gap-2">
              {match.location ? (
                <span className="flex items-center gap-1 min-w-0">
                  <span>📍</span>
                  <span className="truncate">{match.location}</span>
                </span>
              ) : (
                <span />
              )}
              {weather && (
                <span className="flex items-center gap-1.5 shrink-0 tabular-nums">
                  <span className="text-sm">{weather.emoji}</span>
                  <span className="text-suaza-ink font-medium">
                    {weather.label}
                  </span>
                  <span>· {weather.tempMax}°</span>
                  <span className="ml-1 text-sky-700">
                    강수 {weather.precipitationProbability}%
                  </span>
                </span>
              )}
            </div>
          )}
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
