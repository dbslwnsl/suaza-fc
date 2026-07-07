import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import BottomTabs from "@/components/bottom-tabs";
import DevRoleSwitcher from "@/components/dev-role-switcher";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeam, DEFAULT_TEAM_ID } from "@/lib/teams/context";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  // 공유 미리보기(OG)·아이콘의 상대경로를 이 도메인 기준 절대주소로 변환.
  metadataBase: new URL("https://ourmatch.kr"),
  title: "SUAZA FC",
  description: "SUAZA FC 축구 동호회 회원 전용 사이트",
  openGraph: {
    type: "website",
    siteName: "SUAZA FC",
    title: "SUAZA FC",
    description: "SUAZA FC 축구 동호회 회원 전용 사이트",
    url: "/",
    locale: "ko_KR",
    images: [
      {
        url: "/suaza-emblem-original.png",
        width: 1024,
        height: 1024,
        alt: "SUAZA FC 엠블럼",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "SUAZA FC",
    description: "SUAZA FC 축구 동호회 회원 전용 사이트",
    images: ["/suaza-emblem-original.png"],
  },
};

// 사이트가 라이트/다크를 직접 지원한다고 선언 → 삼성 인터넷 등이 자체 auto-dark 로
// 색을 덧칠하지 않고, 우리가 정의한 다크 팔레트를 그대로 사용하게 한다.
export const viewport: Viewport = {
  colorScheme: "light dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 새소식 탭 안읽음 알림 개수 (뱃지용)
  let newsBadge = 0;
  if (user) {
    const teamId = (await getCurrentTeam())?.id ?? DEFAULT_TEAM_ID;
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("team_id", teamId)
      .is("read_at", null);
    newsBadge = count ?? 0;
  }

  // 개발 전용 직책 전환기 — NEXT_PUBLIC_DEV_TOOLS=1 일 때만, 로그인 상태에서 표시.
  const devTools = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
  let devTitle: string | null = null;
  if (devTools && user) {
    const { data: meTitle } = await supabase
      .from("profiles")
      .select("title")
      .eq("id", user.id)
      .single();
    devTitle = (meTitle?.title as string | null) ?? "player";
  }

  return (
    <html
      lang="ko"
      className={`${notoSansKR.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <BottomTabs newsBadge={newsBadge} />
        {devTools && devTitle && <DevRoleSwitcher current={devTitle} />}
      </body>
    </html>
  );
}
