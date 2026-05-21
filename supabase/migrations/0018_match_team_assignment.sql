-- ============================================================
-- 0018: 자체전 A/B 팀 편성
--
-- - match_attendances.team: 자체전에서 참석자를 A/B 팀으로 배정
--   · null: 미배정
--   · 'A' / 'B': 해당 팀
-- - 참석(attending) 회원만 편성 대상 (UI/액션에서 보장)
-- ============================================================

alter table public.match_attendances
  add column if not exists team text;

alter table public.match_attendances
  drop constraint if exists match_attendances_team_check;

alter table public.match_attendances
  add constraint match_attendances_team_check
    check (team is null or team in ('A', 'B'));
