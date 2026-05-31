import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FormationEmbed from "./embed";
import { formatMatchDate } from "@/lib/matches/helpers";

// 포메이션 데이터가 자주 바뀌므로 매 요청 fresh 로드 (cache 우회)
export const dynamic = "force-dynamic";

export default async function FormationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const { error, message } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // 헤더용 매치 정보만 조회 (편집기에 필요한 데이터는 FormationEmbed 가 직접 가져옴)
  const { data: match } = await supabase
    .from("matches")
    .select("opponent, match_date, location")
    .eq("id", id)
    .single();
  if (!match) notFound();

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg desktop-lg:overflow-x-auto desktop-lg:overflow-y-hidden">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-6 sm:py-10 desktop-lg:pb-0 flex flex-col gap-5 sm:gap-6 desktop-lg:h-[calc(100dvh-64px)] desktop-lg:min-h-0">
        <header className="flex items-center gap-3">
          <Link
            href={`/matches/${id}`}
            className="text-sm text-suaza-ink-muted hover:underline"
          >
            ← 경기 상세
          </Link>
        </header>

        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] sm:text-[28px] font-bold text-suaza-ink">
            포메이션 설정
          </h1>
          <p className="text-sm text-suaza-ink-muted">
            vs {match.opponent} · {formatMatchDate(match.match_date)}
            {match.location ? ` · ${match.location}` : ""}
          </p>
        </div>

        {message && (
          <p className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">
            {message}
          </p>
        )}
        {error && (
          <p className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </p>
        )}

        <FormationEmbed matchId={id} />
      </div>
    </main>
  );
}
