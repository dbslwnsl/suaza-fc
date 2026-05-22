-- 선수 컨디션 (1~5단계, 기본 3). 1=최상, 5=최하.
-- 각 계정이 본인 컨디션을 변경. 포메이션 명단에 표시.

alter table public.profiles
  add column if not exists condition smallint not null default 3;

alter table public.profiles
  drop constraint if exists profiles_condition_check;

alter table public.profiles
  add constraint profiles_condition_check check (condition between 1 and 5);
