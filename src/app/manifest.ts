import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SUAZA FC",
    short_name: "SUAZA FC",
    description: "SUAZA FC 축구 동호회 회원 전용 사이트",
    start_url: "/",
    display: "standalone",
    // PWA 스플래시(첫 실행 로딩) 배경색 — 앱 화면(흰색)과 이어지도록 흰색.
    background_color: "#ffffff",
    // 안드로이드 상태바 색 — 앱 헤더(흰색)와 자연스럽게 이어지도록 흰색.
    // (iOS 는 매니페스트 theme_color 를 상태바에 적용하지 않음)
    theme_color: "#ffffff",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
