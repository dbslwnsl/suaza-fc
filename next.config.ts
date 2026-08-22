import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

// Codespaces 는 프록시를 거치면서 x-forwarded-host 를 codespace 도메인으로 덮어쓴다.
// 반면 브라우저가 보내는 origin 은 접속 경로에 따라 localhost:3000 이거나
// codespace 도메인이라 둘이 어긋나고, Server Action 이
// "Invalid Server Actions request" 로 거부된다. 두 경우를 모두 허용한다.
// 로컬 개발 중 Codespace 안에서만 채워지고, Vercel/프로덕션에서는 빈 배열이다.
const codespaceOrigins =
  process.env.NODE_ENV === "development" && process.env.CODESPACE_NAME
    ? [
        // VS Code 포트 포워딩으로 localhost 접속하는 경우
        "localhost:3000",
        // app.github.dev 주소로 직접 접속하는 경우
        `${process.env.CODESPACE_NAME}-3000.${
          process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? "app.github.dev"
        }`,
      ]
    : [];

const nextConfig: NextConfig = {
  // dev 서버의 HMR 등 개발 전용 엔드포인트도 같은 이유로 차단되므로 함께 허용한다.
  allowedDevOrigins: codespaceOrigins,
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
      allowedOrigins: codespaceOrigins,
    },
  },
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
  // 서비스 워커는 항상 최신본을 받도록 캐시 금지 + 올바른 MIME 타입.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
