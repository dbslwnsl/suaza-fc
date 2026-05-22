-- ============================================================
-- 0023: 경기 출석 투표 마감 시각
--
-- matches.vote_deadline (timestamptz, nullable)
-- - 이 시각 이후로는 출석 투표를 변경할 수 없게 하는 기준 (앱 로직에서 활용)
-- - null = 마감 미설정
-- ============================================================

alter table public.matches
  add column if not exists vote_deadline timestamptz;
