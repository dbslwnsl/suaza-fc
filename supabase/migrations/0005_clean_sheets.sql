-- ============================================================
-- 0005: 클린시트 기록 항목 추가
--
-- - stat_definitions 에 clean_sheets (클린시트) 시드
-- - 표시 순서: 어시 다음 → 클린시트 → 심판횟수 → 포인트
-- - 기록은 manager 가 경기별로 직접 입력 (다른 custom stat 과 동일)
-- ============================================================

-- 클린시트는 어시 바로 다음에 오도록 sort_order = 1
insert into public.stat_definitions (key, label, sort_order)
values ('clean_sheets', '클린시트', 1)
on conflict (key) do update set sort_order = 1;

-- 기존 항목들은 뒤로 한 칸씩 밀기
update public.stat_definitions set sort_order = 2 where key = 'referee_count';
update public.stat_definitions set sort_order = 3 where key = 'points';
