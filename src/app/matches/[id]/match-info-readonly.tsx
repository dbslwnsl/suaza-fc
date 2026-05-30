import {
  DEFAULT_TEAM_COLOR,
  DEFAULT_VS_COLOR,
  QUARTER_ACTION_COLOR,
  QUARTER_ACTION_LABEL,
  formatDurationLabel,
  formatMatchDate,
  isQuarterAction,
  type Match,
} from "@/lib/matches/helpers";

/**
 * 종료/취소 경기 — 경기 정보 조회용. 폼이 아니라 텍스트로만 표시.
 * NewMatchForm 의 필드 구성을 동일하게 따라가되 입력 컨트롤 없음.
 */
export default function MatchInfoReadonly({ match }: { match: Match }) {
  const isIntra = match.opponent === "자체전";
  const status = match.status;
  const statusLabel: Record<typeof status, string> = {
    scheduled: "예정",
    in_progress: "진행중",
    done: "완료",
    canceled: "취소",
  };
  const quarterActions = (match.quarter_actions ?? []) as (
    | string
    | null
  )[];

  return (
    <div className="flex flex-col gap-6">
      <Field label="경기 종류">
        <p className="text-suaza-ink font-medium">
          {isIntra ? "자체전" : "상대전"}
        </p>
      </Field>

      {!isIntra && (
        <Field label="상대팀">
          <p className="text-suaza-ink font-medium">{match.opponent}</p>
        </Field>
      )}

      <Field label="경기 일시">
        <p className="text-suaza-ink font-medium">
          {formatMatchDate(match.match_date)}
        </p>
      </Field>

      {match.location && (
        <Field label="장소">
          <p className="text-suaza-ink font-medium">{match.location}</p>
        </Field>
      )}

      {match.duration_hours != null && (
        <Field label="경기 시간">
          <p className="text-suaza-ink font-medium">
            {formatDurationLabel(match.duration_hours)}
          </p>
        </Field>
      )}

      <Field label="상태">
        <p className="text-suaza-ink font-medium">{statusLabel[status]}</p>
      </Field>

      {isIntra && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="A팀">
            <div className="flex items-center gap-2">
              <ColorChip
                color={match.team_a_color ?? DEFAULT_TEAM_COLOR.A}
              />
              <p className="text-suaza-ink font-medium">
                {match.team_a_name?.trim() || "A팀"}
              </p>
            </div>
          </Field>
          <Field label="B팀">
            <div className="flex items-center gap-2">
              <ColorChip
                color={match.team_b_color ?? DEFAULT_TEAM_COLOR.B}
              />
              <p className="text-suaza-ink font-medium">
                {match.team_b_name?.trim() || "B팀"}
              </p>
            </div>
          </Field>
        </div>
      )}

      {!isIntra && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="우리팀 유니폼">
            <ColorChip color={match.team_a_color ?? DEFAULT_VS_COLOR.A} />
          </Field>
          <Field label="상대팀 유니폼">
            <ColorChip color={match.team_b_color ?? DEFAULT_VS_COLOR.B} />
          </Field>
        </div>
      )}

      {match.total_quarters != null && (
        <Field label="쿼터">
          <div className="flex flex-col gap-2">
            <p className="text-suaza-ink font-medium">
              총 {match.total_quarters}쿼터
            </p>
            {quarterActions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {quarterActions.map((a, i) => {
                  const action = a && isQuarterAction(a) ? a : null;
                  const color = action
                    ? QUARTER_ACTION_COLOR[action]
                    : "#9CA3AF";
                  const label = action
                    ? QUARTER_ACTION_LABEL[action]
                    : "—";
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: color }}
                      title={`${i + 1}쿼터: ${label}`}
                    >
                      {i + 1}Q · {label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </Field>
      )}

      {match.vote_deadline && (
        <Field label="출석 투표 마감">
          <p className="text-suaza-ink font-medium">
            {formatMatchDate(match.vote_deadline)}
          </p>
        </Field>
      )}

      {match.notes && (
        <Field label="메모">
          <p className="text-suaza-ink whitespace-pre-wrap leading-relaxed">
            {match.notes}
          </p>
        </Field>
      )}

      <p className="text-xs text-suaza-ink-faint pt-2 border-t border-suaza-border">
        🔒 종료/취소된 경기는 정보를 변경할 수 없습니다 (조회 전용).
      </p>
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
    <div className="flex flex-col gap-1.5">
      <span className="text-suaza-ink-muted text-sm font-medium">
        {label}
      </span>
      {children}
    </div>
  );
}

function ColorChip({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-6 h-6 rounded-md ring-1 ring-suaza-border"
      style={{ backgroundColor: color }}
      aria-label={color}
      title={color}
    />
  );
}
