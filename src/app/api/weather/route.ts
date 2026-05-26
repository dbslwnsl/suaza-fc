import { NextResponse } from "next/server";
import { fetchWeatherDebug } from "@/lib/weather";

/**
 * 클라이언트에서 호출하는 날씨 조회 엔드포인트.
 * 서버 액션 → revalidatePath 가 일어나도 페이지의 server component 트리에 영향이
 * 없는 별도 경로로 분리해서, 드래그/투표 후 transition pending 이 외부 API(Open-Meteo /
 * Nominatim) 응답까지 끌고 가지 않도록 한다.
 *
 * 사용: /api/weather?location=수원시&date=2026-05-30T15:00:00.000Z
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const location = searchParams.get("location");
  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json(
      { ok: false, failure: { reason: "invalid_date" } },
      { status: 400 },
    );
  }
  const result = await fetchWeatherDebug(location, date);
  // 성공 시 CDN/브라우저 캐시 1시간, stale-while-revalidate 24시간.
  // 실패는 캐시 안 함 (API 복구 시 즉시 반영되도록).
  const headers = result.ok
    ? { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" }
    : { "Cache-Control": "no-store" };
  return NextResponse.json(result, { headers });
}
