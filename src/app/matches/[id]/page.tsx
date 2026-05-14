import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addParticipant,
  deleteMatch,
  removeParticipant,
  setAttendance,
  updateMatch,
  updateParticipant,
} from "@/lib/matches/actions";
import AttendanceManagerBoard from "@/components/attendance-manager-board";
import {
  MATCH_STATUS,
  MATCH_STATUS_BADGE,
  MATCH_STATUS_LABEL,
  RESULT_BADGE,
  RESULT_LABEL,
  formatMatchDate,
  getResult,
  isoToLocalDatetime,
  type Match,
} from "@/lib/matches/helpers";

type StatDef = { key: string; label: string; sort_order: number };

type Participation = {
  id: string;
  match_id: string;
  player_id: string;
  goals: number;
  assists: number;
  custom_stats: Record<string, number> | null;
  player: {
    id: string;
    name: string;
    jersey_number: number | null;
  } | null;
};

type MemberOpt = {
  id: string;
  name: string;
  jersey_number: number | null;
};

export default async function MatchDetailPage({
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
    { data: participationsRaw },
    { data: allMembers },
    { data: statDefs },
    { data: attendancesRaw },
    { data: myAttendance },
  ] = await Promise.all([
    supabase.from("matches").select("*").eq("id", id).single(),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("match_participations")
      .select(
        "id, match_id, player_id, goals, assists, custom_stats, player:profiles(id, name, jersey_number)",
      )
      .eq("match_id", id),
    supabase
      .from("profiles")
      .select("id, name, jersey_number")
      .order("jersey_number", { ascending: true, nullsFirst: false }),
    supabase
      .from("stat_definitions")
      .select("key, label, sort_order")
      .order("sort_order", { ascending: true })
      .order("key", { ascending: true }),
    supabase
      .from("match_attendances")
      .select("status, player:profiles(id, name, jersey_number)")
      .eq("match_id", id),
    supabase
      .from("match_attendances")
      .select("status")
      .eq("match_id", id)
      .eq("player_id", user.id)
      .maybeSingle(),
  ]);

  type VotePlayer = { id: string; name: string; jersey_number: number | null };
  const byStatus: { attending: VotePlayer[]; absent: VotePlayer[]; undecided: VotePlayer[] } = {
    attending: [],
    absent: [],
    undecided: [],
  };
  const votedIds = new Set<string>();
  for (const row of ((attendancesRaw ?? []) as unknown as {
    status: keyof typeof byStatus;
    player: VotePlayer | null;
  }[])) {
    if (row.player && row.status in byStatus) {
      byStatus[row.status].push(row.player);
      votedIds.add(row.player.id);
    }
  }
  const nonVoters = ((allMembers ?? []) as VotePlayer[]).filter(
    (m) => !votedIds.has(m.id),
  );
  const myStatus = (myAttendance as { status: string } | null)?.status ?? null;

  if (!match) notFound();

  const m = match as Match;
  const isStaff = me?.role === "manager" || me?.role === "coach";
  const result =
    m.status === "done" ? getResult(m.our_score, m.opponent_score) : null;
  const defs = (statDefs ?? []) as StatDef[];

  const participations = ((participationsRaw ?? []) as unknown as Participation[])
    .slice()
    .sort((a, b) => {
      const aj = a.player?.jersey_number ?? 9999;
      const bj = b.player?.jersey_number ?? 9999;
      return aj - bj;
    });

  const participatedIds = new Set(participations.map((p) => p.player_id));
  const availableMembers = ((allMembers ?? []) as MemberOpt[]).filter(
    (mem) => !participatedIds.has(mem.id),
  );

  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              href="/matches"
              className="text-sm text-suaza-ink-muted hover:underline"
            >
              ← 목록
            </Link>
            <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
              vs {m.opponent}
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            {result && (
              <span
                className={`text-xs px-2 py-0.5 rounded ${RESULT_BADGE[result]}`}
              >
                {RESULT_LABEL[result]} {m.our_score}-{m.opponent_score}
              </span>
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded ${MATCH_STATUS_BADGE[m.status]}`}
            >
              {MATCH_STATUS_LABEL[m.status]}
            </span>
          </div>
        </header>

        <Link
          href={`/matches/${m.id}/formation`}
          className="-mt-2 self-start text-sm text-suaza-accent hover:underline font-medium"
        >
          포메이션 보기 →
        </Link>

        {m.status === "scheduled" && (
          <AttendanceVote
            matchId={m.id}
            redirectTo={`/matches/${m.id}`}
            myStatus={myStatus}
            byStatus={byStatus}
            nonVoters={nonVoters}
            isManager={me?.role === "manager"}
          />
        )}

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

        {!isStaff ? (
          <ReadOnlyView m={m} />
        ) : (
          <form
            action={updateMatch.bind(null, m.id)}
            className="flex flex-col gap-4"
          >
            <Field label="상대팀">
              <input
                type="text"
                name="opponent"
                defaultValue={m.opponent}
                required
                className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
              />
            </Field>

            <Field label="경기 일시">
              <input
                type="datetime-local"
                name="match_date"
                defaultValue={isoToLocalDatetime(m.match_date)}
                required
                className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
              />
            </Field>

            <Field label="장소">
              <input
                type="text"
                name="location"
                defaultValue={m.location ?? ""}
                className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
              />
            </Field>

            <Field label="상태">
              <select
                name="status"
                defaultValue={m.status}
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
              <Field label="우리팀 득점">
                <input
                  type="number"
                  name="our_score"
                  defaultValue={m.our_score ?? ""}
                  min={0}
                  max={99}
                  className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
                />
              </Field>
              <Field label="상대팀 득점">
                <input
                  type="number"
                  name="opponent_score"
                  defaultValue={m.opponent_score ?? ""}
                  min={0}
                  max={99}
                  className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink focus:outline-none focus:border-suaza-button"
                />
              </Field>
            </div>

            <Field label="메모">
              <textarea
                name="notes"
                rows={3}
                defaultValue={m.notes ?? ""}
                className="w-full px-4 py-3 rounded-lg border border-suaza-border text-base text-suaza-ink resize-none focus:outline-none focus:border-suaza-button"
              />
            </Field>

            <button
              type="submit"
              className="h-[52px] rounded-lg bg-suaza-button text-white text-base font-medium hover:opacity-90 transition mt-2"
            >
              경기 정보 저장
            </button>
          </form>
        )}

        {/* 선수별 기록 섹션 */}
        <section className="flex flex-col gap-3 pt-2 border-t border-suaza-border">
          <div className="flex items-center justify-between mt-3">
            <h2 className="font-bold text-suaza-ink text-lg">선수별 기록</h2>
            {isStaff && me?.role === "manager" && (
              <Link
                href="/settings/stats"
                className="text-xs text-suaza-accent hover:underline"
              >
                기록 항목 관리 →
              </Link>
            )}
          </div>

          {isStaff && availableMembers.length > 0 && (
            <form
              action={addParticipant.bind(null, m.id)}
              className="flex gap-2"
            >
              <select
                name="player_id"
                required
                defaultValue=""
                className="flex-1 px-4 py-2.5 rounded-lg border border-suaza-border text-sm text-suaza-ink bg-white focus:outline-none focus:border-suaza-button"
              >
                <option value="" disabled>
                  출전 선수 추가...
                </option>
                {availableMembers.map((mem) => (
                  <option key={mem.id} value={mem.id}>
                    {mem.jersey_number != null ? `#${mem.jersey_number} ` : ""}
                    {mem.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="text-sm bg-suaza-button text-white rounded-lg px-4 font-medium hover:opacity-90"
              >
                추가
              </button>
            </form>
          )}

          {participations.length === 0 ? (
            <p className="text-suaza-ink-muted text-sm">
              아직 출전 선수가 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {participations.map((p) =>
                isStaff ? (
                  <ParticipationEditRow
                    key={p.id}
                    p={p}
                    matchId={m.id}
                    defs={defs}
                  />
                ) : (
                  <ParticipationReadRow key={p.id} p={p} defs={defs} />
                ),
              )}
            </ul>
          )}
        </section>

        {isStaff && (
          <form action={deleteMatch.bind(null, m.id)}>
            <button
              type="submit"
              className="w-full h-[44px] rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition"
            >
              경기 삭제
            </button>
          </form>
        )}
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

function ReadOnlyView({ m }: { m: Match }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="font-medium text-suaza-ink-muted">일시</dt>
      <dd className="text-suaza-ink">{formatMatchDate(m.match_date)}</dd>
      {m.location && (
        <>
          <dt className="font-medium text-suaza-ink-muted">장소</dt>
          <dd className="text-suaza-ink">{m.location}</dd>
        </>
      )}
      {m.our_score != null && m.opponent_score != null && (
        <>
          <dt className="font-medium text-suaza-ink-muted">스코어</dt>
          <dd className="text-suaza-ink">
            {m.our_score} : {m.opponent_score}
          </dd>
        </>
      )}
      {m.notes && (
        <>
          <dt className="font-medium text-suaza-ink-muted">메모</dt>
          <dd className="text-suaza-ink whitespace-pre-wrap">{m.notes}</dd>
        </>
      )}
    </dl>
  );
}

function ParticipationReadRow({
  p,
  defs,
}: {
  p: Participation;
  defs: StatDef[];
}) {
  const stats: string[] = [];
  if (p.goals) stats.push(`골 ${p.goals}`);
  if (p.assists) stats.push(`어시 ${p.assists}`);
  for (const d of defs) {
    const v = p.custom_stats?.[d.key];
    if (v) stats.push(`${d.label} ${v}`);
  }
  return (
    <li className="border border-suaza-border rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
      <span className="font-medium text-suaza-ink">
        {p.player?.jersey_number != null ? `#${p.player.jersey_number} ` : ""}
        {p.player?.name ?? "(알 수 없음)"}
      </span>
      <span className="text-sm text-suaza-ink-muted">
        {stats.length > 0 ? stats.join(" · ") : "기록 없음"}
      </span>
    </li>
  );
}

function ParticipationEditRow({
  p,
  matchId,
  defs,
}: {
  p: Participation;
  matchId: string;
  defs: StatDef[];
}) {
  return (
    <li className="border border-suaza-border rounded-lg p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-suaza-ink">
          {p.player?.jersey_number != null ? `#${p.player.jersey_number} ` : ""}
          {p.player?.name ?? "(알 수 없음)"}
        </span>
        <form action={removeParticipant.bind(null, p.id, matchId)}>
          <button
            type="submit"
            className="text-xs text-red-600 hover:underline"
            aria-label="출전 명단에서 제외"
          >
            제외
          </button>
        </form>
      </div>
      <form
        action={updateParticipant.bind(null, p.id, matchId)}
        className="flex flex-col gap-2"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <NumberField name="goals" label="골" defaultValue={p.goals} />
          <NumberField name="assists" label="어시" defaultValue={p.assists} />
          {defs.map((d) => (
            <NumberField
              key={d.key}
              name={`custom__${d.key}`}
              label={d.label}
              defaultValue={p.custom_stats?.[d.key] ?? ""}
            />
          ))}
        </div>
        <button
          type="submit"
          className="self-end text-sm bg-suaza-button text-white rounded-md px-3 py-1.5 font-medium hover:opacity-90"
        >
          저장
        </button>
      </form>
    </li>
  );
}

type VotePlayer = {
  id: string;
  name: string;
  jersey_number: number | null;
};

export function AttendanceVote({
  matchId,
  redirectTo,
  myStatus,
  byStatus,
  nonVoters,
  isManager,
}: {
  matchId: string;
  redirectTo: string;
  myStatus: string | null;
  byStatus: {
    attending: VotePlayer[];
    absent: VotePlayer[];
    undecided: VotePlayer[];
  };
  nonVoters: VotePlayer[];
  isManager?: boolean;
}) {
  const opts: { value: string; label: string; activeClass: string }[] = [
    {
      value: "attending",
      label: "참석",
      activeClass: "bg-green-600 text-white border-green-600",
    },
    {
      value: "absent",
      label: "불참",
      activeClass: "bg-red-600 text-white border-red-600",
    },
    {
      value: "undecided",
      label: "미정",
      activeClass: "bg-gray-700 text-white border-gray-700",
    },
  ];

  return (
    <section className="flex flex-col gap-3 p-4 border border-suaza-border rounded-lg">
      <h2 className="font-bold text-suaza-ink">출석 투표</h2>

      <form action={setAttendance.bind(null, matchId, redirectTo)}>
        <div className="grid grid-cols-3 gap-2">
          {opts.map((o) => {
            const active = myStatus === o.value;
            return (
              <button
                key={o.value}
                type="submit"
                name="status"
                value={o.value}
                className={`h-10 rounded-lg border text-sm font-medium transition ${
                  active
                    ? o.activeClass
                    : "border-suaza-border text-suaza-ink hover:bg-gray-50"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </form>

      {isManager ? (
        <AttendanceManagerBoard
          matchId={matchId}
          byStatus={byStatus}
          nonVoters={nonVoters}
        />
      ) : (
        <div className="flex flex-col gap-2 pt-1">
          <AttendanceRow
            label="참석"
            count={byStatus.attending.length}
            badgeClass="bg-green-100 text-green-700"
            members={byStatus.attending}
          />
          <AttendanceRow
            label="불참"
            count={byStatus.absent.length}
            badgeClass="bg-red-100 text-red-700"
            members={byStatus.absent}
          />
          <AttendanceRow
            label="미정"
            count={byStatus.undecided.length}
            badgeClass="bg-gray-200 text-gray-700"
            members={byStatus.undecided}
          />
          <div className="h-px bg-suaza-border my-1" />
          <NonVoterRow members={nonVoters} />
        </div>
      )}
    </section>
  );
}

function AttendanceRow({
  label,
  count,
  badgeClass,
  members,
}: {
  label: string;
  count: number;
  badgeClass: string;
  members: VotePlayer[];
}) {
  const names = members.map((m) => m.name);
  return (
    <div className="flex items-start gap-2">
      <span
        className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${badgeClass}`}
      >
        {label} {count}
      </span>
      <span className="text-sm text-suaza-ink-muted leading-relaxed break-keep">
        {names.length > 0 ? names.join(", ") : "—"}
      </span>
    </div>
  );
}

function NonVoterRow({ members }: { members: VotePlayer[] }) {
  if (members.length === 0) {
    return (
      <p className="text-[11px] text-suaza-ink-faint">
        모두 투표를 완료했어요 ✓
      </p>
    );
  }
  const names = members.map((m) => m.name).join(", ");
  return (
    <div className="flex flex-col gap-0.5 text-[11px] text-suaza-ink-faint">
      <span className="font-medium">미투표 ({members.length})</span>
      <span className="break-keep">{names}</span>
    </div>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: number | string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-suaza-ink-muted">{label}</span>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={0}
        className="w-full px-2 py-1.5 rounded-md border border-suaza-border text-sm text-suaza-ink focus:outline-none focus:border-suaza-button"
      />
    </label>
  );
}
