import type { Metadata } from "next";
import { Inter, Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import BottomTabs from "@/components/bottom-tabs";
import { createClient } from "@/lib/supabase/server";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "SUAZA FC",
  description: "SUAZA FC 축구 동호회 회원 전용 사이트",
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

  let isManager = false;
  // 감독 설정 탭 활성화 대상: 회장(president) / 감독(head_coach)
  let canOpenSettings = false;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("role, title")
      .eq("id", user.id)
      .single();
    isManager = data?.role === "manager";
    canOpenSettings =
      data?.title === "president" || data?.title === "head_coach";
  }

  return (
    <html
      lang="ko"
      className={`${notoSansKR.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <BottomTabs isManager={isManager} canOpenSettings={canOpenSettings} />
      </body>
    </html>
  );
}
