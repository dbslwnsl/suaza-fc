-- 자체전 A/B 팀 이름 (경기별)
-- null 또는 빈 값이면 앱에서 기본명("A팀", "B팀") 사용.

alter table public.matches
  add column if not exists team_a_name text;

alter table public.matches
  add column if not exists team_b_name text;
