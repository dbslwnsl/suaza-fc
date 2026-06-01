import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/back-button";
import { addStatDefinition } from "@/lib/stats/actions";
import StatList from "./stat-list";

type StatDef = {
  key: string;
  label: string;
  sort_order: number;
  point_value: number;
};

export default async function StatSettingsPage({
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
  if (me?.role !== "manager") {
    redirect(`/?error=${encodeURIComponent("감독만 접근할 수 있습니다")}`);
  }

  const { data: defs, error: defsError } = await supabase
    .from("stat_definitions")
    .select("key, label, sort_order, point_value")
    .order("sort_order", { ascending: true })
    .order("key", { ascending: true });

  const items = (defs ?? []) as StatDef[];
  // point_value 컬럼은 마이그레이션 0033 에서 추가됨. 미적용 시 쿼리가 실패한다.
  const loadError = defsError?.message ?? null;
  // 항목 수 제한 — 기본 4개(골/어시/출석/포인트) + 추가 4개 = 최대 8개.
  const MAX_TOTAL = 8;
  const canAdd = items.length < MAX_TOTAL;

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <BackButton label="← 이전" className="text-sm text-suaza-ink-muted hover:underline self-start" />
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            기록 항목 관리
          </h1>
        </header>

        <p className="text-sm text-suaza-ink-muted -mt-3">
          항목별 <span className="font-medium text-suaza-ink">기준점수</span>를
          정하면 회원이 그 기록을 올릴 때마다 포인트가 누적됩니다. (예: 클린시트
          1점, 승리포인트 2점) 기본 항목(골·어시·출석·포인트) 외에 팀이 직접
          추적할 기록을{" "}
          <span className="font-medium text-suaza-ink">최대 4개</span>까지
          추가할 수 있어요.
        </p>

        {error && (
          <p className="-mt-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </p>
        )}
        {loadError && (
          <div className="-mt-2 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm flex flex-col gap-1">
            <span className="font-medium">
              항목을 불러오지 못했습니다.
            </span>
            <span className="text-xs">
              마이그레이션 0033(point_value 컬럼)이 적용되지 않았을 수 있어요.
              Supabase SQL Editor 에서 0033 을 실행해 주세요.
            </span>
            <span className="text-[11px] text-amber-700/80 break-all">
              {loadError}
            </span>
          </div>
        )}

        {/* 정의 목록 */}
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-bold text-suaza-ink">현재 항목</h2>
            <span className="text-[11px] text-suaza-ink-faint">
              우측 ☰ 를 길게 눌러 순서 변경
            </span>
          </div>
          {items.length === 0 ? (
            <p className="text-suaza-ink-muted text-sm">
              아직 추가된 항목이 없습니다.
            </p>
          ) : (
            <StatList initial={items} />
          )}
        </section>

        {/* 추가 폼 */}
        <form
          action={addStatDefinition}
          className={`flex flex-col gap-3 p-4 border border-suaza-border rounded-lg ${
            canAdd ? "" : "opacity-60"
          }`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-bold text-suaza-ink">새 항목 추가</h2>
            <span className="text-[11px] text-suaza-ink-faint">
              {items.length} / {MAX_TOTAL}
            </span>
          </div>
          {!canAdd && (
            <p className="text-xs text-suaza-accent">
              최대 4개까지 추가할 수 있어요. 항목을 삭제한 뒤 다시 추가해 주세요.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-suaza-ink-muted">이름</span>
              <input
                type="text"
                name="label"
                required
                disabled={!canAdd}
                placeholder="예: 심판횟수"
                className="px-3 py-2 rounded-md border border-suaza-border text-sm focus:outline-none focus:border-suaza-button disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-suaza-ink-muted">정렬 순서</span>
              <input
                type="number"
                name="sort_order"
                defaultValue={items.length}
                min={0}
                disabled={!canAdd}
                className="w-24 px-3 py-2 rounded-md border border-suaza-border text-sm focus:outline-none focus:border-suaza-button disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={!canAdd}
            className="self-end text-sm bg-suaza-button text-white rounded-md px-3 py-1.5 font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
          >
            추가
          </button>
        </form>
      </div>
    </main>
  );
}
