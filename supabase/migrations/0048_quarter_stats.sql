-- ============================================================
-- 쿼터별 기록 입력 지원
-- match_participations.quarter_stats 형태:
--   { "<quarterId>": { "goals": n, "assists": n, "clean_sheets": n, "referee_count": n }, ... }
--   (quarterId 는 포메이션 쿼터 id — 예: "1Q", "2Q")
--
-- 합계 컬럼(goals / assists / custom_stats)은 "모든 쿼터의 합"으로 유지된다.
--   → 시즌/회원명단 집계 로직은 합계 기준이라 그대로 동작 (변경 불필요).
--
-- 기존 경기: quarter_stats 가 NULL → 레거시 '합계 직접 입력' 모드로 동작.
--   (합계는 그대로 보존되며, 쿼터 분해는 하지 않는다.)
-- ============================================================

alter table public.match_participations
  add column if not exists quarter_stats jsonb;

notify pgrst, 'reload schema';
