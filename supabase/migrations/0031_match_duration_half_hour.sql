-- 경기 시간을 30분 단위로 허용 (2, 2.5, 3, 3.5, 4 시간).
-- smallint → numeric(3,1) 로 변경. RPC 의 duration_hours * interval '1 hour' 는 numeric 도 그대로 동작.

alter table public.matches
  alter column duration_hours type numeric(3,1) using duration_hours::numeric;

alter table public.matches
  drop constraint if exists matches_duration_hours_check;

alter table public.matches
  add constraint matches_duration_hours_check
  check (duration_hours between 0.5 and 4);
