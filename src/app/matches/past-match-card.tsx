import Link from "next/link";
import { getTeamName, type Match } from "@/lib/matches/helpers";

/**
 * 지난 경기(또는 취소된 경기) 카드 — `일정&결과` 페이지 및 홈에서 공통 사용.
 * 점수 + 결과 라벨 + 상대 정보 + 일시·장소를 한 줄 카드로 표시한다.
 */
export default function PastMatchCard({ match }: { match: Match }) {
  const isIntra = match.opponent === "자체전";
  // 좌측 세로 컬러바 — 자체전(보라) / 상대전(빨강). 예정된 경기 카드와 동일.
  const accent = isIntra ? "#8B5CF6" : "#F0524F";
  const ourScore = match.our_score ?? 0;
  const oppScore = match.opponent_score ?? 0;
  // 표시되는 점수 기준으로 결과 산출 — 둘 다 미입력(=0/0)이어도 동률이면 무승부.
  const result: "win" | "draw" | "lose" =
    ourScore > oppScore ? "win" : ourScore < oppScore ? "lose" : "draw";
  const dateStr = formatLongDate(match.match_date);
  const timeStr = formatTime(match.match_date);
  // 매치업 — A팀 3 종료 1 B팀 (상대전은 수아자FC vs 상대팀). 취소 경기는 점수 없이.
  // 자체전 팀명은 "팀" 접미사를 유지한다.
  const teamLabel = (t: "A" | "B") => getTeamName(match, t);
  const homeName = isIntra ? teamLabel("A") : "수아자FC";
  const awayName = isIntra ? teamLabel("B") : match.opponent;
  const statusWord = match.status === "canceled" ? "취소" : "종료";
  const resultLabel =
    match.status === "canceled"
      ? "취소"
      : isIntra
        ? result === "draw"
          ? "무승부"
          : `${teamLabel(result === "win" ? "A" : "B")}승`
        : result === "win"
          ? "승"
          : result === "lose"
            ? "패"
            : "무";
  const resultClass =
    match.status === "canceled"
      ? "bg-gray-100 text-gray-500"
      : result === "win"
        ? "bg-green-100 text-green-700"
        : result === "lose"
          ? "bg-red-100 text-red-700"
          : "bg-gray-100 text-gray-700";

  return (
    <Link
      href={`/matches/${match.id}`}
      className="block transition hover:opacity-70"
    >
      <div className="flex gap-3">
        <span
          aria-hidden
          className="w-1 shrink-0 self-stretch rounded-full"
          style={{ backgroundColor: accent }}
        />
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-suaza-ink truncate min-w-0 tabular-nums">
              {homeName}{" "}
              {match.status !== "canceled" ? (
                <>
                  <span className="text-lg text-[#338CF2]">{ourScore}</span>{" "}
                  <span className="text-xs font-normal text-suaza-ink-muted">
                    {statusWord}
                  </span>{" "}
                  <span className="text-lg text-[#338CF2]">{oppScore}</span>{" "}
                </>
              ) : (
                "vs "
              )}
              {awayName}
            </span>
            <span
              className={`ml-auto shrink-0 text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap ${resultClass}`}
            >
              {resultLabel}
            </span>
          </div>
          <div className="text-xs text-suaza-ink-muted flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span>{dateStr} {timeStr}</span>
              <span
                className="ml-auto shrink-0 text-xs font-medium"
                style={{ color: accent }}
              >
                {isIntra ? "자체전" : "상대전"}
              </span>
            </div>
            {match.location && <span>{match.location}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}

function formatLongDate(iso: string): string {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  });
  const parts = fmt.formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  return `${year}년 ${month} ${day}일 (${weekday})`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(d);
}
