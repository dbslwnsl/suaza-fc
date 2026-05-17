-- ============================================================
-- 0009: 선수별 기록 → 출석 투표 자동 동기화 (역방향)
--
-- - 참가 INSERT (선수 추가) → 출석을 'attending' 으로 자동 변경/생성
-- - 참가 DELETE (선수 제외) → 'attending' 이었다면 'absent' 로 자동 변경
-- - 0008 의 정방향 트리거와 짝을 이뤄 양방향 sync 가 완성됨
-- - 두 트리거는 idempotent (on conflict do nothing / where 조건 매칭)으로
--   짜여있어 무한 재귀 없음
-- ============================================================

create or replace function public.sync_attendance_with_participation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.match_attendances (match_id, player_id, status, updated_at)
    values (new.match_id, new.player_id, 'attending', now())
    on conflict (match_id, player_id) do update
      set status = 'attending', updated_at = now();
    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.match_attendances
    set status = 'absent', updated_at = now()
    where match_id = old.match_id
      and player_id = old.player_id
      and status = 'attending';
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists sync_attendance_trg on public.match_participations;
create trigger sync_attendance_trg
  after insert or delete on public.match_participations
  for each row execute function public.sync_attendance_with_participation();

-- 기존 데이터 정합: 참가 row 가 있는데 attendance 가 'attending' 이 아닌 경우 보정
update public.match_attendances ma
set status = 'attending', updated_at = now()
from public.match_participations mp
where ma.match_id = mp.match_id
  and ma.player_id = mp.player_id
  and ma.status <> 'attending';

-- 참가 row 가 있는데 attendance row 자체가 없는 경우 생성
insert into public.match_attendances (match_id, player_id, status, updated_at)
select mp.match_id, mp.player_id, 'attending', now()
from public.match_participations mp
left join public.match_attendances ma
  on ma.match_id = mp.match_id and ma.player_id = mp.player_id
where ma.id is null;
