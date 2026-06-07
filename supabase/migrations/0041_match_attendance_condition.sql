-- ============================================================
-- 경기별 선수 컨디션
-- 기존엔 profiles.condition(전역)을 써서 모든 경기에 동일한 컨디션이 표시됐다.
-- 경기마다 독립적으로 표기되도록 match_attendances 에 condition 컬럼을 둔다.
-- ============================================================

alter table public.match_attendances
  add column if not exists condition smallint
  check (condition is null or condition between 1 and 5);

-- 기존 전역 컨디션(profiles.condition)을 현재 출석 행에 1회 복사한다.
-- (이후부터는 경기별로 독립 관리되며, 미설정 행은 NULL = "?" 로 표시)
update public.match_attendances ma
set condition = p.condition
from public.profiles p
where ma.player_id = p.id
  and ma.condition is null
  and p.condition is not null;
