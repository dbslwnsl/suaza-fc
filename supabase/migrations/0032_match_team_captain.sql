-- 자체전 A/B 팀별 주장(캡틴) 지정. profiles 참조, 회원 삭제 시 NULL.
alter table public.matches
  add column if not exists team_a_captain uuid references public.profiles(id) on delete set null,
  add column if not exists team_b_captain uuid references public.profiles(id) on delete set null;
