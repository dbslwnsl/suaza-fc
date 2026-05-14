import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  MEMBER_TITLES,
  POSITIONS,
  TITLE_BADGE,
  TITLE_LABEL,
  type MemberTitle,
  type Position,
} from "@/lib/members/positions";
import { updateProfile } from "./actions";

type StatDef = { key: string; label: string; sort_order: number };

type ParticipationRow = {
  goals: number;
  assists: number;
  custom_stats: Record<string, number> | null;
  match: { status: string } | null;
};

export default async function MemberDetailPage({
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

  const [
    { data: profile },
    { data: me },
    { data: statsRaw },
    { data: defs },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, name, nickname, role, title, positions, jersey_number, birth_date",
      )
      .eq("id", id)
      .single(),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("match_participations")
      .select("goals, assists, custom_stats, match:matches(status)")
      .eq("player_id", id),
    supabase
      .from("stat_definitions")
      .select("key, label, sort_order")
      .order("sort_order", { ascending: true })
      .order("key", { ascending: true }),
  ]);

  if (!profile) notFound();

  const isSelf = user.id === profile.id;
  const isManager = me?.role === "manager";
  const canEdit = isSelf || isManager;
  const positions = (profile.positions ?? []) as Position[];
  const title = (profile.title ?? "player") as MemberTitle;

  // 누적 통계 (종료된 경기만)
  const done = ((statsRaw ?? []) as unknown as ParticipationRow[]).filter(
    (s) => s.match?.status === "done",
  );
  const totals: { label: string; value: number }[] = [
    { label: "출전", value: done.length },
    { label: "골", value: done.reduce((a, s) => a + (s.goals ?? 0), 0) },
    { label: "어시", value: done.reduce((a, s) => a + (s.assists ?? 0), 0) },
  ];
  for (const d of (defs ?? []) as StatDef[]) {
    totals.push({
      label: d.label,
      value: done.reduce((a, s) => a + (s.custom_stats?.[d.key] ?? 0), 0),
    });
  }

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex items-center gap-3 flex-wrap">
          <Link
            href="/members"
            className="text-sm text-suaza-ink-muted hover:underline"
          >
            ← 명단
          </Link>
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            {profile.name}
          </h1>
          <span
            className={`text-xs px-2 py-0.5 rounded ${TITLE_BADGE[title] ?? TITLE_BADGE.player}`}
          >
            {TITLE_LABEL[title] ?? title}
          </span>
        </header>

        {message && (
          <p className="-mt-2 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
            {message}
          </p>
        )}
        {error && (
          <p className="-mt-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </p>
        )}

        <section className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {totals.map((t) => (
            <Stat key={t.label} label={t.label} value={t.value} />
          ))}
        </section>

        {!canEdit ? (
          <ReadOnlyView profile={profile} positions={positions} />
        ) : (
          <form
            action={updateProfile.bind(null, profile.id)}
            className="flex flex-col gap-4"
          >
            <Field label="이름">
              <input
                type="text"
                name="name"
                defaultValue={profile.name}
                required
                className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
              />
            </Field>

            <Field label="별명">
              <input
                type="text"
                name="nickname"
                defaultValue={profile.nickname ?? ""}
                className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
              />
            </Field>

            <Field label="포지션 (복수 선택)">
              <div className="flex gap-2 flex-wrap">
                {POSITIONS.map((p) => (
                  <label
                    key={p}
                    className="flex items-center gap-2 px-3 py-1.5 border border-suaza-border rounded-lg cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      name="positions"
                      value={p}
                      defaultChecked={positions.includes(p)}
                      className="accent-suaza-button"
                    />
                    <span className="text-suaza-ink">{p}</span>
                  </label>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="등번호">
                <input
                  type="number"
                  name="jersey_number"
                  defaultValue={profile.jersey_number ?? ""}
                  min={0}
                  max={999}
                  className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
                />
              </Field>
              <Field label="생년월일">
                <input
                  type="date"
                  name="birth_date"
                  defaultValue={profile.birth_date ?? ""}
                  className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
                />
              </Field>
            </div>

            {isManager && (
              <Field label="직책">
                <select
                  name="title"
                  defaultValue={title}
                  className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink bg-white focus:outline-none focus:border-suaza-button"
                >
                  {MEMBER_TITLES.map((t) => (
                    <option key={t} value={t}>
                      {TITLE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <button
              type="submit"
              className="h-[52px] rounded-lg bg-suaza-button text-white text-base font-medium hover:opacity-90 transition mt-2"
            >
              저장
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center justify-center p-3 border border-suaza-border rounded-lg">
      <span className="text-xs text-suaza-ink-muted">{label}</span>
      <span className="text-xl font-bold text-suaza-ink">{value}</span>
    </div>
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

function ReadOnlyView({
  profile,
  positions,
}: {
  profile: {
    nickname: string | null;
    jersey_number: number | null;
    birth_date: string | null;
  };
  positions: Position[];
}) {
  const rows: { label: string; value: string }[] = [];
  if (profile.nickname) rows.push({ label: "별명", value: profile.nickname });
  if (positions.length > 0)
    rows.push({ label: "포지션", value: positions.join(" / ") });
  if (profile.jersey_number != null)
    rows.push({ label: "등번호", value: `#${profile.jersey_number}` });
  if (profile.birth_date)
    rows.push({ label: "생년월일", value: profile.birth_date });

  if (rows.length === 0) {
    return (
      <p className="text-suaza-ink-muted text-sm">등록된 정보가 없습니다.</p>
    );
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map((r) => (
        <span key={r.label} className="contents">
          <dt className="font-medium text-suaza-ink-muted">{r.label}</dt>
          <dd className="text-suaza-ink">{r.value}</dd>
        </span>
      ))}
    </dl>
  );
}
