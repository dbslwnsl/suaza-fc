-- 자체전 A/B 팀 유니폼 색상 (경기별)
-- null 이면 앱에서 기본색(A=빨강, B=파랑) 사용.

alter table public.matches
  add column if not exists team_a_color text;

alter table public.matches
  add column if not exists team_b_color text;
