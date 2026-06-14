import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { approveSignup } from "@/lib/auth/signup-approval";

type Candidate = {
  id: string;
  name: string;
  jersey_number: number | null;
  deleted_at: string | null;
  approved_at: string | null;
};

type PendingSignup = {
  id: string;
  name: string;
  jersey_number: number | null;
  joined_at: string;
  candidates: Candidate[];
};

export default async function AdminSignupsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("title")
    .eq("id", user.id)
    .single();
  if (me?.title !== "president") {
    redirect("/?error=권한이 없습니다");
  }

  // 승인 대기 중인 신규 가입자 (approved_at = NULL, 본인 제외)
  const { data: pendingRaw } = await supabase
    .from("profiles")
    .select("id, name, jersey_number, joined_at")
    .is("approved_at", null)
    .is("deleted_at", null)
    .neq("id", user.id)
    .order("joined_at", { ascending: true });

  // 같은 이름의 soft-deleted 프로필 후보 (= 이관 가능 옛 기록)
  const { data: softDeletedRaw } = await supabase
    .from("profiles")
    .select("id, name, jersey_number, deleted_at, approved_at")
    .not("deleted_at", "is", null);

  const softDeleted = (softDeletedRaw ?? []) as Candidate[];
  const pendingItems: PendingSignup[] = ((pendingRaw ?? []) as PendingSignup[]).map(
    (p) => ({
      ...p,
      candidates: softDeleted.filter((c) => c.name === p.name),
    }),
  );

  return (
    <main className="flex-1 bg-white desktop:bg-suaza-bg px-6 desktop:px-8 py-8 desktop:py-12">
      <div className="max-w-[800px] mx-auto flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl desktop:text-[28px] font-bold text-suaza-ink">
            신규 가입 승인
          </h1>
          <p className="text-sm text-suaza-ink-muted">
            가입을 신청한 회원을 승인하거나, 이름이 같은 옛 프로필의 기록을
            이관할 수 있습니다.
          </p>
        </header>

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

        {pendingItems.length === 0 ? (
          <p className="text-sm text-suaza-ink-muted text-center py-12 bg-white rounded-xl border border-suaza-border">
            승인 대기 중인 가입자가 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pendingItems.map((p) => (
              <SignupCard key={p.id} signup={p} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function SignupCard({ signup }: { signup: PendingSignup }) {
  const dateStr = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(signup.joined_at));

  return (
    <li className="bg-white rounded-xl border border-suaza-border p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-suaza-ink">{signup.name}</span>
          {signup.jersey_number != null && (
            <span className="text-xs text-suaza-ink-muted">
              #{signup.jersey_number}
            </span>
          )}
        </div>
        <span className="text-xs text-suaza-ink-faint">신청 {dateStr}</span>
      </div>

      {signup.candidates.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-suaza-ink-muted">
            이름이 동일한 옛 프로필이 발견됐습니다. 이관할 프로필을 선택하거나
            새로 시작할 수 있어요.
          </p>
          <form
            action={approveSignup}
            className="flex flex-col gap-2 bg-suaza-bg/50 rounded-lg p-3"
          >
            <input type="hidden" name="new_id" value={signup.id} />
            {signup.candidates.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 cursor-pointer text-sm"
              >
                <input
                  type="radio"
                  name="old_id"
                  value={c.id}
                  required
                  className="accent-suaza-button"
                />
                <span className="text-suaza-ink">
                  {c.name}
                  {c.jersey_number != null && ` · #${c.jersey_number}`}
                </span>
                <span className="text-xs text-suaza-ink-faint ml-auto">
                  옛 ID {c.id.slice(0, 8)}…
                </span>
              </label>
            ))}
            <label className="flex items-center gap-2 cursor-pointer text-sm border-t border-suaza-border pt-2 mt-1">
              <input
                type="radio"
                name="old_id"
                value=""
                className="accent-suaza-button"
              />
              <span className="text-suaza-ink-muted">
                옛 기록 이관 없이 새로 시작
              </span>
            </label>
            <div className="flex justify-end gap-2 mt-1">
              <button
                type="submit"
                className="text-sm bg-suaza-ink text-white rounded-lg px-4 py-2 font-medium hover:opacity-90 transition"
              >
                승인
              </button>
            </div>
          </form>
        </div>
      ) : (
        <form action={approveSignup} className="flex justify-end">
          <input type="hidden" name="new_id" value={signup.id} />
          <input type="hidden" name="old_id" value="" />
          <button
            type="submit"
            className="text-sm bg-suaza-ink text-white rounded-lg px-4 py-2 font-medium hover:opacity-90 transition"
          >
            승인
          </button>
        </form>
      )}
    </li>
  );
}
