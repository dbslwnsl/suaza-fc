import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logout } from "@/lib/auth/actions";
import OnboardingForm, { type TeamOption } from "./onboarding-form";

// 가입 온보딩 — 팀 선택(목록/초대코드) 또는 새 팀 만들기.
// 신규 가입자(소속 없음)는 미들웨어가 이 페이지로 보낸다.
// 이미 소속이 있는 회원도 접근 가능 (다른 팀 추가 가입/팀 생성).
export default async function TeamOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, emblem_url, region, description")
    .eq("status", "active") // 승인 대기 팀은 목록에서 숨김
    .order("name", { ascending: true });

  // 팀별 활성 멤버 수 — 신규 가입자는 RLS 로 타 팀 멤버를 못 읽으므로 서버(admin)에서 집계.
  const admin = createAdminClient();
  const { data: memberRows } = await admin
    .from("team_members")
    .select("team_id")
    .eq("status", "active");
  const counts = new Map<string, number>();
  for (const r of (memberRows ?? []) as { team_id: string }[]) {
    counts.set(r.team_id, (counts.get(r.team_id) ?? 0) + 1);
  }

  const list: TeamOption[] = (
    (teams ?? []) as {
      id: string;
      name: string;
      emblem_url: string | null;
      region: string | null;
      description: string | null;
    }[]
  ).map((t) => ({
    ...t,
    memberCount: counts.get(t.id) ?? 0,
  }));

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            팀 선택
          </h1>
          <p className="text-sm text-suaza-ink-muted leading-relaxed">
            활동할 팀에 가입을 신청하거나, 새 팀을 만들어 시작하세요.
            <br />
            가입 신청은 그 팀 회장의 승인 후 완료됩니다.
          </p>
        </header>

        <OnboardingForm teams={list} />

        {/* 하단 — 팀 생성 신청(새 페이지) + 로그아웃 */}
        <div aria-hidden className="h-px bg-suaza-border" />
        <div className="flex items-center justify-center gap-2">
          <Link
            href="/onboarding/team/create"
            className="text-sm bg-suaza-accent text-white rounded-lg px-4 py-2 font-medium hover:opacity-90 transition"
          >
            팀 생성 신청
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="text-sm border border-suaza-border rounded-lg px-4 py-2 text-suaza-ink hover:bg-gray-50 transition"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
