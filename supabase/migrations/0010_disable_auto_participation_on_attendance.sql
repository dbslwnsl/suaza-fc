-- ============================================================
-- 0010: 출석 '참석' → match_participations 자동 추가 동작 제거
--
-- 0008 의 정방향 트리거가 참석 시 자동으로 participation row 를
-- 만들어줬지만, 새 UX 에서는:
--   1) 참석 = 출전 "후보" 단계 (출전 선수 추가 영역의 칩으로 표시)
--   2) 매니저가 칩을 클릭해서 직접 participation 으로 추가
-- 따라서 자동 INSERT 로직은 제거.
--
-- 단, 참석에서 불참/미정으로 바뀌거나 출석 row 가 삭제될 때
-- 기록 없는 participation 은 정리하는 cleanup 로직은 유지.
-- ============================================================

create or replace function public.sync_participation_with_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.status = 'attending'
     and new.status <> 'attending' then
    delete from public.match_participations
    where match_id = new.match_id
      and player_id = new.player_id
      and goals = 0
      and assists = 0
      and (custom_stats is null or custom_stats = '{}'::jsonb);
  end if;

  if tg_op = 'DELETE' and old.status = 'attending' then
    delete from public.match_participations
    where match_id = old.match_id
      and player_id = old.player_id
      and goals = 0
      and assists = 0
      and (custom_stats is null or custom_stats = '{}'::jsonb);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
