-- ============================================================
-- 0033: 기록 항목별 포인트 기준점수(point_value)
--
-- - 각 기록 항목에 "1회당 포인트" 를 부여 → 회원 포인트 = Σ(항목 횟수 × 기준점수).
-- - 골/어시/출석을 기본 항목으로 시드 (앱에서 삭제 불가).
-- - 기존 하드코딩 가중치(골3·어시2·출석1·클린2·심판1·MOM0·승점0)를 초기값으로.
-- - points(포인트) 항목은 합계 자체 → 기준점수 없음(설정에서 숨김), 합산에서 제외.
-- ============================================================

alter table public.stat_definitions
  add column if not exists point_value int not null default 0;

-- 기본 항목(골·어시·출석) — 항상 존재, 앱에서 삭제 불가
insert into public.stat_definitions (key, label, sort_order, point_value) values
  ('goals',      '골',   0, 3),
  ('assists',    '어시', 1, 2),
  ('attendance', '출석', 2, 1)
on conflict (key) do nothing;

-- 항목 정렬 정리 (기본 → 기록 → 합계)
update public.stat_definitions set sort_order = 3 where key = 'clean_sheets';
update public.stat_definitions set sort_order = 4 where key = 'referee_count';
update public.stat_definitions set sort_order = 5 where key = 'mom';
update public.stat_definitions set sort_order = 6 where key = 'win_points';
update public.stat_definitions set sort_order = 7 where key = 'points';

-- 기존 하드코딩 가중치를 초기 기준점수로 (아직 0 인 경우에만 — 재실행/수동변경 보존)
update public.stat_definitions set point_value = 2 where key = 'clean_sheets' and point_value = 0;
update public.stat_definitions set point_value = 1 where key = 'referee_count' and point_value = 0;
-- mom, win_points 는 0 유지 / points 는 합계라 0

notify pgrst, 'reload schema';
