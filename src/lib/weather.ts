/**
 * Open-Meteo 무료 API 기반 날씨 조회.
 * - geocoding: 장소명 → 위경도 (1일 cache)
 * - forecast: daily 예보 16일까지 (1시간 cache)
 */

export type WeatherInfo = {
  label: string;
  emoji: string;
  tempMax: number;
  tempMin: number;
  precipitationProbability: number;
  matchedLocation: string;
};

type GeocodingResult = {
  results?: {
    name: string;
    latitude: number;
    longitude: number;
    country_code?: string;
    admin1?: string;
    admin2?: string;
  }[];
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    county?: string;
    province?: string;
    state?: string;
    suburb?: string;
  };
};

type GeoMatch = {
  latitude: number;
  longitude: number;
  name: string;
};

/**
 * Open-Meteo geocoding (도시명 위주) → 실패 시 Nominatim (OSM, 시설명 포함) 시도.
 * Nominatim은 무료지만 User-Agent 필수.
 */
async function geocode(query: string): Promise<GeoMatch | null> {
  // 1) Open-Meteo
  try {
    const url =
      `https://geocoding-api.open-meteo.com/v1/search` +
      `?name=${encodeURIComponent(query)}` +
      `&count=1&language=ko&countryCode=KR`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (res.ok) {
      const data = (await res.json()) as GeocodingResult;
      const r = data.results?.[0];
      if (r) {
        return {
          latitude: r.latitude,
          longitude: r.longitude,
          name: r.admin2 ?? r.admin1 ?? r.name,
        };
      }
    }
  } catch {
    // ignore, fallback 시도
  }

  // 2) Nominatim (OSM) — 시설/학교명도 검색 가능
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(query)}` +
      `&format=json&accept-language=ko&countrycodes=kr&addressdetails=1&limit=1`;
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: {
        // Nominatim 정책상 User-Agent 필수
        "User-Agent": "SuazaFC/1.0 (https://ourmatch.kr)",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimResult[];
    const r = data[0];
    if (!r) return null;
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    const city =
      r.address?.city ??
      r.address?.town ??
      r.address?.county ??
      r.address?.province ??
      r.address?.state ??
      r.display_name.split(",")[0]?.trim() ??
      query;
    return { latitude: lat, longitude: lon, name: city };
  } catch {
    return null;
  }
}

type ForecastResult = {
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: number[];
  };
};

// 서버 타임존(보통 UTC)이 아니라 KST 기준의 YYYY-MM-DD 를 반환.
// 예: '2026-05-23T03:00:00+09:00' → '2026-05-23' (Vercel UTC 서버에서도 동일)
function seoulDateStr(d: Date): string {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // sv-SE 로케일이 ISO 형식 'YYYY-MM-DD' 반환
}

/**
 * WMO weather code → 한국어 라벨 + 이모지
 * https://open-meteo.com/en/docs#weather_code
 */
function weatherLabel(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: "맑음", emoji: "☀️" };
  if (code >= 1 && code <= 3) return { label: "구름", emoji: "⛅" };
  if (code === 45 || code === 48) return { label: "안개", emoji: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "이슬비", emoji: "🌦️" };
  if (code >= 61 && code <= 67) return { label: "비", emoji: "🌧️" };
  if (code >= 71 && code <= 77) return { label: "눈", emoji: "❄️" };
  if (code >= 80 && code <= 82) return { label: "소나기", emoji: "🌦️" };
  if (code === 85 || code === 86) return { label: "눈 소나기", emoji: "🌨️" };
  if (code >= 95) return { label: "천둥번개", emoji: "⛈️" };
  return { label: "—", emoji: "" };
}

export type WeatherFailure = {
  reason:
    | "no_location"
    | "invalid_date"
    | "out_of_range"
    | "geocoding_failed"
    | "no_geocoding_result"
    | "forecast_failed"
    | "incomplete_forecast";
  detail?: string;
};

export type WeatherResult =
  | { ok: true; data: WeatherInfo }
  | { ok: false; failure: WeatherFailure };

export async function fetchWeather(
  location: string | null | undefined,
  matchDateIso: string,
): Promise<WeatherInfo | null> {
  const r = await fetchWeatherDebug(location, matchDateIso);
  return r.ok ? r.data : null;
}

export async function fetchWeatherDebug(
  location: string | null | undefined,
  matchDateIso: string,
): Promise<WeatherResult> {
  if (!location || !location.trim()) {
    return { ok: false, failure: { reason: "no_location" } };
  }
  const matchDate = new Date(matchDateIso);
  if (Number.isNaN(matchDate.getTime())) {
    return { ok: false, failure: { reason: "invalid_date" } };
  }

  // forecast 범위: 오늘부터 +15일 까지
  const now = new Date();
  const daysAhead = Math.floor(
    (matchDate.getTime() - now.getTime()) / 86400000,
  );
  if (daysAhead < 0 || daysAhead > 15) {
    return {
      ok: false,
      failure: { reason: "out_of_range", detail: `D+${daysAhead}` },
    };
  }

  try {
    // 1. 위경도 lookup (Open-Meteo → Nominatim 순)
    const place = await geocode(location.trim());
    if (!place) {
      return {
        ok: false,
        failure: {
          reason: "no_geocoding_result",
          detail: location.trim(),
        },
      };
    }

    // 2. forecast (KST 기준 경기 당일)
    const dateStr = seoulDateStr(matchDate);
    const wxUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=Asia%2FSeoul` +
      `&start_date=${dateStr}&end_date=${dateStr}`;
    const wxRes = await fetch(wxUrl, { next: { revalidate: 3600 } });
    if (!wxRes.ok) {
      return {
        ok: false,
        failure: { reason: "forecast_failed", detail: `${wxRes.status}` },
      };
    }
    const wxData = (await wxRes.json()) as ForecastResult;
    const daily = wxData.daily;
    const code = daily?.weather_code?.[0];
    const tempMax = daily?.temperature_2m_max?.[0];
    const tempMin = daily?.temperature_2m_min?.[0];
    const pop = daily?.precipitation_probability_max?.[0] ?? 0;
    if (code == null || tempMax == null || tempMin == null) {
      return { ok: false, failure: { reason: "incomplete_forecast" } };
    }

    const { label, emoji } = weatherLabel(code);
    return {
      ok: true,
      data: {
        label,
        emoji,
        tempMax: Math.round(tempMax),
        tempMin: Math.round(tempMin),
        precipitationProbability: Math.round(pop),
        matchedLocation: place.name,
      },
    };
  } catch (e) {
    return {
      ok: false,
      failure: {
        reason: "forecast_failed",
        detail: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

export function failureMessage(f: WeatherFailure): string {
  switch (f.reason) {
    case "no_location":
      return "장소가 등록되지 않아 날씨를 표시할 수 없어요";
    case "invalid_date":
      return "경기 날짜가 올바르지 않아요";
    case "out_of_range":
      return "예보 범위 밖 (16일 초과)";
    case "geocoding_failed":
      return "장소 좌표 조회 실패";
    case "no_geocoding_result":
      return `'${f.detail}' 의 위치를 찾을 수 없어요 (도시명 권장)`;
    case "forecast_failed":
      return "날씨 조회 실패";
    case "incomplete_forecast":
      return "날씨 데이터 불완전";
  }
}
