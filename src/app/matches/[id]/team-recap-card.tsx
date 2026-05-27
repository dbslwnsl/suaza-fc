import { displayMemberName } from "@/lib/members/name";

type RecapMember = { id: string; name: string; team: "A" | "B" | null };

export default function TeamRecapCard({
  attendees,
  teamAName,
  teamBName,
}: {
  attendees: RecapMember[];
  teamAName: string;
  teamBName: string;
}) {
  const sortByName = (a: RecapMember, b: RecapMember) =>
    a.name.localeCompare(b.name, "ko");
  const teamA = attendees.filter((m) => m.team === "A").sort(sortByName);
  const teamB = attendees.filter((m) => m.team === "B").sort(sortByName);
  const unassigned = attendees.filter((m) => m.team == null).sort(sortByName);

  return (
    <section className="bg-white rounded-2xl border border-suaza-border desktop:border-0 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-5 desktop:p-8 flex flex-col gap-4 desktop:h-full">
      <h3 className="font-bold text-suaza-ink text-lg">A & B 팀 편성 결과</h3>

      {/* 데스크탑: A | 세로선 | B 3열, 모바일: 세로로 쌓임 (구분선 숨김) */}
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-[1fr_1px_1fr] desktop:gap-x-6">
        <TeamColumn
          label={teamAName}
          dotColor="#EF3E3E"
          chipClass="bg-red-50 text-suaza-accent border-red-200"
          members={teamA}
        />
        <div
          aria-hidden
          className="hidden desktop:block w-px bg-suaza-border self-stretch"
        />
        <TeamColumn
          label={teamBName}
          dotColor="#3B82F6"
          chipClass="bg-blue-50 text-blue-600 border-blue-200"
          members={teamB}
        />
      </div>

      {unassigned.length > 0 && (
        <>
          <div className="h-px bg-suaza-border" />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold text-suaza-ink">
              미편성 인원{" "}
              <span className="text-xs text-suaza-ink-muted font-normal">
                ({unassigned.length}명)
              </span>
            </span>
            <div className="flex flex-wrap items-start content-start gap-2">
              {unassigned.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full border border-dashed border-gray-300 bg-gray-100 text-suaza-ink-muted"
                >
                  {displayMemberName(m.name)}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function TeamColumn({
  label,
  dotColor,
  chipClass,
  members,
}: {
  label: string;
  dotColor: string;
  chipClass: string;
  members: RecapMember[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 font-bold text-suaza-ink">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
          {label}
        </span>
        <span className="text-sm text-suaza-ink-muted font-normal leading-none">
          {members.length}명
        </span>
      </div>
      <div className="flex flex-wrap items-start content-start gap-2 min-h-[36px]">
        {members.length === 0 ? (
          <span className="text-xs text-suaza-ink-faint">—</span>
        ) : (
          members.map((m) => (
            <span
              key={m.id}
              className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full border ${chipClass}`}
            >
              {displayMemberName(m.name)}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
