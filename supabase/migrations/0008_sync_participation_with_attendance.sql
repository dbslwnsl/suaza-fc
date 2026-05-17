-- ============================================================
-- 0008: 출석 투표 ↔ 선수별 기록 자동 동기화
--
-- - 참석으로 투표하면 match_participations 에 row 자동 생성 (기본 0)
-- - 참석 → 불참/미정 또는 미투표(row 삭제)로 바뀌면, 기록(골/어시/커스텀)이
--   아직 비어있는 경우에만 자동 제거. 데이터가 있으면 보존.
-- - security definer 로 RLS 우회 (일반 회원도 자기 출석 시 자동 추가됨)
-- ============================================================

create or replace function public.sync_participation_with_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'attending' then
      insert into public.match_participations (match_id, player_id)
      values (new.match_id, new.player_id)
      on conflict (match_id, player_id) do nothing;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'attending' then
      insert into public.match_participations (match_id, player_id)
      values (new.match_id, new.player_id)
      on conflict (match_id, player_id) do nothing;
    elsif old.status = 'attending' then
      -- 참석 -> 불참/미정 : 기록 없으면 정리
      delete from public.match_participations
      where match_id = new.match_id
        and player_id = new.player_id
        and goals = 0
        and assists = 0
        and (custom_stats is null or custom_stats = '{}'::jsonb);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'attending' then
      delete from public.match_participations
      where match_id = old.match_id
        and player_id = old.player_id
        and goals = 0
        and assists = 0
        and (custom_stats is null or custom_stats = '{}'::jsonb);
    end if;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists sync_participation_trg on public.match_attendances;
create trigger sync_participation_trg
  after insert or update or delete on public.match_attendances
  for each row execute function public.sync_participation_with_attendance();

-- 기존에 이미 참석으로 투표돼 있는데 participation row 없는 경우 일괄 추가
insert into public.match_participations (match_id, player_id)
select ma.match_id, ma.player_id
from public.match_attendances ma
left join public.match_participations mp
  on mp.match_id = ma.match_id and mp.player_id = ma.player_id
where ma.status = 'attending'
  and mp.id is null;
