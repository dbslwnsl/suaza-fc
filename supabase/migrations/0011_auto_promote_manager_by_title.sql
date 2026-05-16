-- ============================================================
-- 0011: 회장(president) / 감독(head_coach) 직책에게 자동 매니저 권한
--
-- - 기존 데이터: 위 두 직책인데 role 이 manager 가 아닌 경우 일괄 승격
-- - 향후: title 이 위 두 값으로 변경되면 BEFORE 트리거에서 role 을
--   manager 로 자동 설정. enforce_profile_role_change 트리거가 같이
--   동작해서, 매니저가 아닌 사용자가 자기 title 을 president/head_coach
--   로 바꾸려 시도하면 role 변경 시점에 거부됨 → 권한 상승 시도 차단.
-- - 강등은 자동으로 일어나지 않음 (직책에서 빠지더라도 role 은 유지).
-- ============================================================

-- 1) 기존 회장/감독 일괄 승격
update public.profiles
set role = 'manager'
where title in ('president', 'head_coach')
  and role <> 'manager';

-- 2) 향후 자동 승격 트리거
create or replace function public.auto_promote_manager_by_title()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.title in ('president', 'head_coach')
     and coalesce(new.role, 'player') <> 'manager' then
    new.role := 'manager';
  end if;
  return new;
end;
$$;

drop trigger if exists auto_promote_manager_by_title_trg on public.profiles;
create trigger auto_promote_manager_by_title_trg
  before insert or update of title on public.profiles
  for each row execute function public.auto_promote_manager_by_title();
