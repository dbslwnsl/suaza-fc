import { createClient } from "@/lib/supabase/server";
import JoinTeamForm from "./join-team-form";

// 팀 추가 가입 — 이미 소속이 있는 회원이 팀 가입 번호(초대코드)로
// 다른 팀에 가입 신청한다. 승인은 그 팀 회장이 한다.
export default async function JoinTeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            팀 추가 가입
          </h1>
          <p className="text-sm text-suaza-ink-muted leading-relaxed">
            가입할 팀의 <span className="font-medium text-suaza-ink">팀 가입 번호</span>
            (6자리)를 입력하세요. 그 팀 회장의 승인 후 팀 전환에 나타납니다.
          </p>
        </header>

        <JoinTeamForm />
      </div>
    </main>
  );
}
