import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FormationEditor from "./formation-editor";
import { formatMatchDate } from "@/lib/matches/helpers";
import {
  DEFAULT_QUARTER_IDS,
  type SavedQuarter,
} from "@/lib/formations/helpers";
import type { Position, MemberTitle } from "@/lib/members/positions";

export type EditorMember = {
  id: string;
  name: string;
  jersey_number: number | null;
  positions: Position[] | null;
  title: MemberTitle | null;
  avatar_url: string | null;
};

type FormationRow = {
  shape: string;
  positions: {
    player_ids?: (string | null)[];
    quarters?: SavedQuarter[];
  };
};

function quarterNum(id: string): number {
  const m = id.match(/^(\d+)Q$/);
  return m ? parseInt(m[1], 10) : 0;
}

function buildInitialQuarters(f: FormationRow | null): SavedQuarter[] {
  let saved: SavedQuarter[] = [];
  if (f) {
    if (Array.isArray(f.positions?.quarters)) {
      saved = f.positions.quarters
        .filter((q) => q && typeof q.shape === "string" && q.id)
        .map((q) => ({
          id: q.id,
          shape: q.shape,
          player_ids: q.player_ids ?? [],
        }));
    } else if (f.positions?.player_ids) {
      saved = [
        {
          id: "1Q",
          shape: f.shape ?? "4-4-2",
          player_ids: f.positions.player_ids,
        },
      ];
    }
  }
  const defaults = DEFAULT_QUARTER_IDS.map<SavedQuarter>((id) => {
    const found = saved.find((q) => q.id === id);
    return found ?? { id, shape: "4-4-2", player_ids: [] };
  });
  const extras = saved
    .filter((q) => !DEFAULT_QUARTER_IDS.includes(q.id as never))
    .sort((a, b) => quarterNum(a.id) - quarterNum(b.id));
  return [...defaults, ...extras];
}

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
    { data: attendances },
  ] = await Promise.all([
    supabase
      .from("matches")
      .select("id, opponent, match_date, location, status")
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
      .select("id, name, jersey_number, positions, title, avatar_url")
      .is("deleted_at", null)
      .order("jersey_number", { ascending: true, nullsFirst: false }),
    supabase
      .from("match_attendances")
      .select("player_id, status")
      .eq("match_id", id)
      .eq("status", "attending"),
  ]);

  if (!match) notFound();

  const isStaff = me?.role === "manager" || me?.role === "coach";
  const f = formation as FormationRow | null;
  const initialQuarters = buildInitialQuarters(f);
  const attendingIds = (attendances ?? []).map(
    (a: { player_id: string }) => a.player_id,
  );

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg desktop:overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-6 sm:py-10 desktop:pb-0 flex flex-col gap-5 sm:gap-6 desktop:h-[calc(100dvh-64px)] desktop:min-h-0">
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

        <FormationEditor
          matchId={id}
          members={(members ?? []) as EditorMember[]}
          attendingIds={attendingIds}
          initialQuarters={initialQuarters}
          readonly={!isStaff}
        />
      </div>
    </main>
  );
}
