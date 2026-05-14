import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FormationEditor, { Field } from "./formation-editor";
import { buildSlots } from "@/lib/formations/helpers";

type Member = { id: string; name: string; jersey_number: number | null };

type FormationRow = {
  shape: string;
  positions: { player_ids?: (string | null)[] };
};

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

  const [
    { data: match },
    { data: me },
    { data: formation },
    { data: members },
  ] = await Promise.all([
    supabase
      .from("matches")
      .select("id, opponent, match_date")
      .eq("id", id)
      .single(),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("formations")
      .select("shape, positions")
      .eq("match_id", id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, name, jersey_number")
      .order("jersey_number", { ascending: true, nullsFirst: false }),
  ]);

  if (!match) notFound();

  const isStaff = me?.role === "manager" || me?.role === "coach";
  const f = formation as FormationRow | null;
  const shape = f?.shape ?? "4-4-2";
  const slots = buildSlots(shape);
  const stored = f?.positions?.player_ids ?? [];
  const playerIds: (string | null)[] = slots.map((_, i) => stored[i] ?? null);

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex items-center gap-3 flex-wrap">
          <Link
            href={`/matches/${id}`}
            className="text-sm text-suaza-ink-muted hover:underline"
          >
            ← 경기 상세
          </Link>
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            포메이션
          </h1>
          <span className="text-suaza-ink-muted text-sm">
            vs {match.opponent}
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

        {isStaff ? (
          <FormationEditor
            matchId={id}
            members={(members ?? []) as Member[]}
            initialShape={shape}
            initialPlayerIds={playerIds}
          />
        ) : !f ? (
          <p className="text-suaza-ink-muted text-sm">
            아직 포메이션이 등록되지 않았습니다.
          </p>
        ) : (
          <>
            <div className="text-suaza-ink-muted text-sm">
              <span className="font-medium text-suaza-ink">{shape}</span>{" "}
              포메이션
            </div>
            <Field
              slots={slots}
              members={(members ?? []) as Member[]}
              assignments={playerIds}
              editable={false}
            />
          </>
        )}
      </div>
    </main>
  );
}
