-- ============================================================
-- 0012: 선수별 기록 soft-delete + 복원
--
-- match_participations 에 archived_at 컬럼 추가.
-- 출석이 '참석' 에서 빠지거나 매니저가 "제외" 를 누르면 row 를
-- 실제로 삭제하지 않고 archived_at 만 채움. 통계는 보존됨.
--
-- 매니저가 같은 선수를 다시 출전 등록하면 archived_at 이 null 로
-- 되돌아가고, 그동안 저장된 통계가 그대로 복원됨.
--
-- 트리거들 (sync_participation_with_attendance / sync_attendance_with_participation)
-- 도 archive/unarchive 의미에 맞게 갱신.
-- ============================================================

-- 1) 컬럼
alter table public.match_participations
  add column if not exists archived_at timestamptz;

create index if not exists match_participations_active_idx
  on public.match_participations (match_id, player_id)
  where archived_at is null;

-- 2) attendance → participation 정리 트리거: 삭제 대신 archive
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
    update public.match_participations
    set archived_at = now()
    where match_id = new.match_id
      and player_id = new.player_id
      and archived_at is null;
  end if;

  if tg_op = 'DELETE' and old.status = 'attending' then
    update public.match_participations
    set archived_at = now()
    where match_id = old.match_id
      and player_id = old.player_id
      and archived_at is null;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- 3) participation → attendance 역방향 sync: archive/unarchive 도 처리
create or replace function public.sync_attendance_with_participation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.archived_at is null then
    insert into public.match_attendances (match_id, player_id, status, updated_at)
    values (new.match_id, new.player_id, 'attending', now())
    on conflict (match_id, player_id) do update
      set status = 'attending', updated_at = now();
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.archived_at is not null and new.archived_at is null then
      -- 복원
      insert into public.match_attendances (match_id, player_id, status, updated_at)
      values (new.match_id, new.player_id, 'attending', now())
      on conflict (match_id, player_id) do update
        set status = 'attending', updated_at = now();
    elsif old.archived_at is null and new.archived_at is not null then
      -- archive
      update public.match_attendances
      set status = 'absent', updated_at = now()
      where match_id = new.match_id
        and player_id = new.player_id
        and status = 'attending';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.archived_at is null then
      update public.match_attendances
      set status = 'absent', updated_at = now()
      where match_id = old.match_id
        and player_id = old.player_id
        and status = 'attending';
    end if;
    return old;
  end if;

  return null;
end;
$$;

-- 4) UPDATE 시에도 트리거 실행되도록 재생성
drop trigger if exists sync_attendance_trg on public.match_participations;
create trigger sync_attendance_trg
  after insert or update of archived_at or delete on public.match_participations
  for each row execute function public.sync_attendance_with_participation();

-- 5) 기존 정합성 backfill: 출석이 attending 이 아닌데 participation 이 active 인 row archive
update public.match_participations mp
set archived_at = now()
from public.match_attendances ma
where mp.match_id = ma.match_id
  and mp.player_id = ma.player_id
  and mp.archived_at is null
  and ma.status <> 'attending';
