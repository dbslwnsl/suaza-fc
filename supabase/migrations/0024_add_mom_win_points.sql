-- ============================================================
-- 0024: 기록에 MOM·승리포인트 추가
--
-- stat_definitions 시드:
--   - mom        (MOM)     sort_order 3
--   - win_points (승리포인트) sort_order 4
-- 기존 points 는 마지막(5)으로 밀어 둠.
-- ============================================================

insert into public.stat_definitions (key, label, sort_order)
values
  ('mom',        'MOM',      3),
  ('win_points', '승리포인트', 4)
on conflict (key) do update set
  label = excluded.label,
  sort_order = excluded.sort_order;

update public.stat_definitions set sort_order = 5 where key = 'points';
