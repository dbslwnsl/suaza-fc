import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addStatDefinition,
  removeStatDefinition,
} from "@/lib/stats/actions";

type StatDef = {
  key: string;
  label: string;
  sort_order: number;
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

  const { data: defs } = await supabase
    .from("stat_definitions")
    .select("key, label, sort_order")
    .order("sort_order", { ascending: true })
    .order("key", { ascending: true });

  const items = (defs ?? []) as StatDef[];

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-suaza-ink-muted hover:underline"
          >
            ← 홈
          </Link>
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            기록 항목 관리
          </h1>
        </header>

        <p className="text-sm text-suaza-ink-muted -mt-3">
          기본 항목(출전·골·어시) 외에 팀이 직접 추적하고 싶은 기록을 추가하세요.
        </p>

        {error && (
          <p className="-mt-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </p>
        )}

        {/* 추가 폼 */}
        <form
          action={addStatDefinition}
          className="flex flex-col gap-3 p-4 border border-suaza-border rounded-lg"
        >
          <h2 className="font-bold text-suaza-ink">새 항목 추가</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-suaza-ink-muted">
                key (영문)
              </span>
              <input
                type="text"
                name="key"
                required
                placeholder="referee_count"
                pattern="[a-z][a-z0-9_]*"
                className="px-3 py-2 rounded-md border border-suaza-border text-sm focus:outline-none focus:border-suaza-button"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-suaza-ink-muted">표시 이름</span>
              <input
                type="text"
                name="label"
                required
                placeholder="심판횟수"
                className="px-3 py-2 rounded-md border border-suaza-border text-sm focus:outline-none focus:border-suaza-button"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-suaza-ink-muted">정렬 순서</span>
              <input
                type="number"
                name="sort_order"
                defaultValue={items.length}
                min={0}
                className="px-3 py-2 rounded-md border border-suaza-border text-sm focus:outline-none focus:border-suaza-button"
              />
            </label>
          </div>
          <button
            type="submit"
            className="self-end text-sm bg-suaza-button text-white rounded-md px-3 py-1.5 font-medium hover:opacity-90"
          >
            추가
          </button>
        </form>

        {/* 정의 목록 */}
        <section className="flex flex-col gap-2">
          <h2 className="font-bold text-suaza-ink">현재 항목</h2>
          {items.length === 0 ? (
            <p className="text-suaza-ink-muted text-sm">
              아직 추가된 항목이 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((d) => (
                <li
                  key={d.key}
                  className="flex items-center justify-between gap-3 p-3 border border-suaza-border rounded-lg"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-suaza-ink">
                      {d.label}
                    </span>
                    <span className="text-xs text-suaza-ink-muted font-mono">
                      {d.key}
                    </span>
                  </div>
                  <form action={removeStatDefinition.bind(null, d.key)}>
                    <button
                      type="submit"
                      className="text-xs text-red-600 hover:underline"
                    >
                      삭제
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
