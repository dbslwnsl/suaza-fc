import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CreateTeamForm from "./create-team-form";

// 새 팀 만들기 — 팀 선택 화면에서 분리된 전용 페이지.
// 신청하면 팀이 pending 으로 생성되고, 플랫폼 관리자 승인 후 시작된다.
export default async function CreateTeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Link
            href="/onboarding/team"
            className="inline-flex w-fit items-center gap-1 text-sm text-suaza-ink-muted transition hover:text-suaza-ink"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
            팀 선택
          </Link>
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            새 팀 만들기
          </h1>
          <p className="text-sm text-suaza-ink-muted leading-relaxed">
            신청하면 관리자 승인 후 회장으로 팀을 시작합니다.
            <br />
            팀 이름·엠블럼은 나중에 팀 설정에서 바꿀 수 있어요.
          </p>
        </header>

        <CreateTeamForm />
      </div>
    </main>
  );
}
