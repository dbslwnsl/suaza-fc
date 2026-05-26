"use client";

import { useEffect, useState } from "react";
import {
  failureMessage,
  type WeatherInfo,
  type WeatherResult,
} from "@/lib/weather";

type Status =
  | { kind: "loading" }
  | { kind: "ok"; data: WeatherInfo }
  | { kind: "fail"; message: string };

function useWeather(location: string | null, matchDate: string): Status {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ date: matchDate });
    if (location) params.set("location", location);
    fetch(`/api/weather?${params.toString()}`)
      .then((r) => r.json() as Promise<WeatherResult>)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setStatus({ kind: "ok", data: result.data });
        } else {
          setStatus({
            kind: "fail",
            message: failureMessage(result.failure),
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus({ kind: "fail", message: "날씨 조회 실패" });
      });
    return () => {
      cancelled = true;
    };
  }, [location, matchDate]);
  return status;
}

function forecastLabel(matchDateIso: string): string {
  const matchDate = new Date(matchDateIso);
  if (Number.isNaN(matchDate.getTime())) return "경기일 예보";
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = new Date(fmt.format(new Date()) + "T00:00:00+09:00");
  const target = new Date(fmt.format(matchDate) + "T00:00:00+09:00");
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "오늘 예보";
  if (diff === 1) return "내일 예보";
  if (diff > 1) return `D-${diff} 예보`;
  return "경기일 예보";
}

/**
 * 홈 화면용 카드형 날씨. fetch 가 끝날 때까지 아무것도 표시 안 함 (fallback null).
 */
export function WeatherCardClient({
  location,
  matchDate,
}: {
  location: string | null;
  matchDate: string;
}) {
  const status = useWeather(location, matchDate);
  if (status.kind === "loading") return null;
  if (status.kind === "ok") {
    const weather = status.data;
    return (
      <div className="flex flex-col gap-1 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
        <div className="flex items-center justify-between gap-2 text-[11px] text-sky-700 font-medium">
          <span>{forecastLabel(matchDate)}</span>
          <span className="text-suaza-ink-faint font-normal truncate max-w-[60%]">
            {weather.matchedLocation}
          </span>
        </div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xl">{weather.emoji}</span>
          <span className="text-sm font-bold text-suaza-ink">
            {weather.label}
          </span>
          <span className="text-xs text-suaza-ink-muted tabular-nums">
            {weather.tempMin}° / {weather.tempMax}°
          </span>
          {weather.precipitationProbability > 0 && (
            <span className="text-xs text-sky-700 tabular-nums">
              💧 {weather.precipitationProbability}%
            </span>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 bg-gray-50 border border-suaza-border rounded-lg px-3 py-2 text-xs text-suaza-ink-muted">
      <span>🌤️</span>
      <span>날씨 정보 없음</span>
      <span className="text-suaza-ink-faint truncate">· {status.message}</span>
    </div>
  );
}

/**
 * 경기 상세용 인라인 날씨. 위치 옆에 작은 한 줄로 표시.
 */
export function WeatherInlineClient({
  location,
  matchDate,
}: {
  location: string | null;
  matchDate: string;
}) {
  const status = useWeather(location, matchDate);
  if (status.kind === "loading") return null;
  if (status.kind === "ok") {
    const weather = status.data;
    return (
      <span className="inline-flex items-center gap-1 ml-2 tabular-nums">
        <span className="text-base">{weather.emoji}</span>
        <span className="text-suaza-ink font-medium">{weather.label}</span>
        <span>· {weather.tempMax}°</span>
        <span className="ml-1 text-sky-700">
          강수 {weather.precipitationProbability}%
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 ml-2 text-suaza-ink-faint">
      <span>🌤️</span>
      <span>날씨 정보 없음</span>
      <span className="hidden desktop:inline truncate max-w-[260px]">
        · {status.message}
      </span>
    </span>
  );
}
