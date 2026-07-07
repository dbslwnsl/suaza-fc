import { createClient } from "@/lib/supabase/server";
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
    .select("id, name, emblem_url")
    .order("name", { ascending: true });

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

        <OnboardingForm teams={(teams ?? []) as TeamOption[]} />
      </div>
    </main>
  );
}
