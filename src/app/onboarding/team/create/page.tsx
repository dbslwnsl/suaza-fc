import { createClient } from "@/lib/supabase/server";
import { getMyTeams } from "@/lib/teams/context";
import CreateTeamForm from "./create-team-form";

// 새 팀 만들기 — 팀 선택 화면에서 분리된 전용 페이지.
// 신청하면 팀이 pending 으로 생성되고, 플랫폼 관리자 승인 후 시작된다.
export default async function CreateTeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // 돌아가기 버튼(폼 하단) 목적지 — 진입 경로에 따라 다르다.
  // 소속 팀이 있는 기존 회원(로그인 배너/링크로 직행)은 홈으로,
  // 무소속 신규 가입자(팀 선택 화면에서 진입)는 팀 선택으로.
  const hasTeam = (await getMyTeams()).length > 0;
  const back = hasTeam
    ? { href: "/", label: "홈으로" }
    : { href: "/onboarding/team", label: "팀 선택으로" };

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            새 팀 만들기
          </h1>
          <p className="text-sm text-suaza-ink-muted leading-relaxed">
            신청하면 관리자 승인 후 회장으로 팀을 시작합니다.
            <br />
            팀 이름·엠블럼은 나중에 팀 설정에서 바꿀 수 있어요.
          </p>
        </header>

        <CreateTeamForm backHref={back.href} backLabel={back.label} />
      </div>
    </main>
  );
}
