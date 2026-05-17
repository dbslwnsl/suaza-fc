-- ============================================================
-- 0008: 매니저 수동 status 변경 우선
--
-- - matches.status_overridden boolean: status 가 한 번이라도 변경되면 true
--   (트리거로 자동 마킹)
-- - auto_progress_match 보완: status_overridden = false 인 매치만 자동 진행
--   (매니저가 수동으로 "예정" 으로 되돌리면 더 이상 자동으로 in_progress 안 됨)
-- ============================================================

alter table public.matches
  add column if not exists status_overridden boolean not null default false;

-- status 가 바뀔 때마다 마킹
create or replace function public.set_status_overridden()
returns trigger
language plpgsql
as $$
begin
  if old.status is distinct from new.status then
    new.status_overridden := true;
  end if;
  return new;
end;
$$;

drop trigger if exists matches_status_overridden_trg on public.matches;
create trigger matches_status_overridden_trg
  before update on public.matches
  for each row execute function public.set_status_overridden();

-- 자동 진행 함수: status_overridden=false 인 경우만 처리
create or replace function public.auto_progress_match(p_match_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.matches
  set status = 'in_progress', updated_at = now()
  where id = p_match_id
    and status = 'scheduled'
    and match_date <= now()
    and status_overridden = false;
$$;
