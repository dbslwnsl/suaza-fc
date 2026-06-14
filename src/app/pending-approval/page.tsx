import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/auth/actions";

export default async function PendingApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, approved_at")
    .eq("id", user.id)
    .single();

  // 이미 승인된 사용자는 홈으로
  if (profile?.approved_at) redirect("/");

  return (
    <main className="flex-1 bg-white desktop:bg-suaza-bg px-6 py-12 flex items-center justify-center">
      <div className="max-w-[480px] w-full bg-white rounded-2xl border border-suaza-border p-8 flex flex-col gap-5 items-center text-center">
        <span className="text-5xl" aria-hidden>
          ⏳
        </span>
        <h1 className="text-xl font-bold text-suaza-ink">승인 대기 중</h1>
        <p className="text-sm text-suaza-ink-muted leading-relaxed">
          {message ??
            `${profile?.name ?? "회원"} 님의 가입 신청이 접수되었습니다.`}
          <br />
          회장이 확인하고 승인하면 앱을 이용하실 수 있습니다.
        </p>
        <div className="w-full h-px bg-suaza-border my-1" />
        <p className="text-xs text-suaza-ink-faint">
          승인이 완료되면 다시 로그인해 주세요.
        </p>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm border border-suaza-border rounded-lg px-4 py-2 text-suaza-ink hover:bg-gray-50 transition"
          >
            로그아웃
          </button>
        </form>
      </div>
    </main>
  );
}
