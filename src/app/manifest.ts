import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SUAZA FC",
    short_name: "SUAZA FC",
    description: "SUAZA FC 축구 동호회 회원 전용 사이트",
    start_url: "/",
    display: "standalone",
    background_color: "#1e293b",
    theme_color: "#1e293b",
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
