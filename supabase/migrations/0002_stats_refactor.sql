-- ============================================================
-- 0002: 선수 기록 컬럼 리팩토링
--
-- - match_participations: yellow/red/minutes 제거
-- - match_participations: custom_stats jsonb 추가 (자유 키-값)
-- - stat_definitions 신설: 팀이 사용할 커스텀 기록 항목 정의
--   ex) referee_count(심판횟수), points(포인트)
-- ============================================================

alter table public.match_participations drop column if exists yellow_cards;
alter table public.match_participations drop column if exists red_cards;
alter table public.match_participations drop column if exists minutes_played;
alter table public.match_participations
  add column if not exists custom_stats jsonb not null default '{}'::jsonb;

create table if not exists public.stat_definitions (
  key         text        primary key,
  label       text        not null,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.stat_definitions enable row level security;

create policy stat_def_select on public.stat_definitions
  for select to authenticated using (true);

create policy stat_def_write_manager on public.stat_definitions
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- 기본 커스텀 항목
insert into public.stat_definitions (key, label, sort_order)
values
  ('referee_count', '심판횟수', 1),
  ('points',        '포인트',   2)
on conflict (key) do nothing;
