import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/back-button";
import NewMatchForm from "./new-match-form";

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "manager" && me?.role !== "coach") {
    redirect(`/matches?error=${encodeURIComponent("경기 관리 권한이 없습니다")}`);
  }

  // 자주 만난 팀 / 최근 장소 추출 (최근 30경기 기준 unique)
  const { data: pastMatches } = await supabase
    .from("matches")
    .select("opponent, location, match_date")
    .order("match_date", { ascending: false })
    .limit(30);

  const recentOpponents = unique(
    (pastMatches ?? []).map((m) => m.opponent),
    4,
  );
  const recentLocations = unique(
    (pastMatches ?? []).map((m) => m.location ?? ""),
    3,
  );

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <BackButton
            label="← 경기 목록"
            fallbackHref="/matches"
            className="text-sm text-suaza-ink-muted hover:underline self-start"
          />
          <div className="flex items-center gap-3">
            <Link
              href="/matches"
              aria-label="일정 & 결과로"
              className="block hover:opacity-80 transition shrink-0 text-suaza-ink"
            >
              <svg
                className="w-9 h-9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </Link>
            <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
              경기 등록
            </h1>
          </div>
          <p className="hidden pointer-fine:block text-sm text-suaza-ink-muted">
            경기 정보를 입력하면 일정 캘린더와 출석 투표가 자동 생성됩니다
          </p>
        </header>

        {error && (
          <p className="-mt-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </p>
        )}

        <NewMatchForm
          recentOpponents={recentOpponents}
          recentLocations={recentLocations}
        />
      </div>
    </main>
  );
}

function unique(arr: (string | null)[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of arr) {
    const s = (v ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    result.push(s);
    if (result.length >= limit) break;
  }
  return result;
}
