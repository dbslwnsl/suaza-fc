import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createMatch } from "@/lib/matches/actions";
import { MATCH_STATUS, MATCH_STATUS_LABEL } from "@/lib/matches/helpers";

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

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex items-center gap-3">
          <Link
            href="/matches"
            className="text-sm text-suaza-ink-muted hover:underline"
          >
            ← 목록
          </Link>
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            새 경기 등록
          </h1>
        </header>

        {error && (
          <p className="-mt-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </p>
        )}

        <form action={createMatch} className="flex flex-col gap-4">
          <Field label="상대팀">
            <input
              type="text"
              name="opponent"
              required
              placeholder="예: 잠실 FC"
              className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink placeholder:text-suaza-placeholder focus:outline-none focus:border-suaza-button"
            />
          </Field>

          <Field label="경기 일시">
            <input
              type="datetime-local"
              name="match_date"
              required
              className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
            />
          </Field>

          <Field label="장소 (선택)">
            <input
              type="text"
              name="location"
              placeholder="예: 수원종합운동장"
              className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink placeholder:text-suaza-placeholder focus:outline-none focus:border-suaza-button"
            />
          </Field>

          <Field label="상태">
            <select
              name="status"
              defaultValue="scheduled"
              className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink bg-white focus:outline-none focus:border-suaza-button"
            >
              {MATCH_STATUS.map((s) => (
                <option key={s} value={s}>
                  {MATCH_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="우리팀 득점 (선택)">
              <input
                type="number"
                name="our_score"
                min={0}
                max={99}
                className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
              />
            </Field>
            <Field label="상대팀 득점 (선택)">
              <input
                type="number"
                name="opponent_score"
                min={0}
                max={99}
                className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
              />
            </Field>
          </div>

          <Field label="메모 (선택)">
            <textarea
              name="notes"
              rows={3}
              className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink placeholder:text-suaza-placeholder focus:outline-none focus:border-suaza-button resize-none"
            />
          </Field>

          <button
            type="submit"
            className="h-[52px] rounded-lg bg-suaza-button text-white text-base font-medium hover:opacity-90 transition mt-2"
          >
            등록
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-suaza-ink text-base">{label}</span>
      {children}
    </label>
  );
}
