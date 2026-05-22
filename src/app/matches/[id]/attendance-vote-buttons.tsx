"use client";

import { useOptimistic, useTransition } from "react";
import { voteAttendance } from "@/lib/matches/actions";

type Status = "attending" | "absent" | "undecided";

const OPTS: {
  value: Status;
  label: string;
  icon?: string;
  activeClass: string;
}[] = [
  {
    value: "attending",
    label: "참석",
    icon: "✓",
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

export default function AttendanceVoteButtons({
  matchId,
  myStatus,
}: {
  matchId: string;
  myStatus: string | null;
}) {
  const [, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(myStatus);

  const vote = (value: Status) => {
    // 토글: 이미 선택된 항목을 다시 누르면 미투표(null)
    const next = optimisticStatus === value ? null : value;
    startTransition(async () => {
      setOptimisticStatus(next);
      await voteAttendance(matchId, value);
    });
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTS.map((o) => {
        const active = optimisticStatus === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => vote(o.value)}
            className={`h-11 rounded-lg border text-sm font-medium transition flex items-center justify-center gap-1 ${
              active
                ? o.activeClass
                : "bg-white border-suaza-border text-suaza-ink hover:bg-gray-50"
            }`}
          >
            {o.icon && active && <span>{o.icon}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
