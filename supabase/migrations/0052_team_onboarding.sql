-- ============================================================
-- 멀티팀 전환 Phase 3 — 팀 생성 온보딩 RPC
--
-- create_team_with_owner(name, slug):
--   1) 팀 생성
--   2) 생성자를 회장(manager/president, active) 멤버로 등록
--   3) 기본 기록 항목 시딩 (골/어시/출석 + 합계 포인트 — 수아자 기본과 동일)
--   4) 생성자가 가입 승인 대기(approved_at null)면 즉시 승인
--      (자기 팀을 만든 사람을 승인해 줄 사람이 없으므로)
-- ============================================================

create or replace function public.create_team_with_owner(
  p_name text,
  p_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_uid  uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception '팀 이름을 입력해 주세요';
  end if;

  insert into public.teams (name, slug)
  values (trim(p_name), p_slug)
  returning id into v_team;

  insert into public.team_members (team_id, user_id, role, title, status)
  values (v_team, v_uid, 'manager', 'president', 'active');

  insert into public.stat_definitions (team_id, key, label, sort_order, point_value)
  values
    (v_team, 'goals',      '골',     0, 3),
    (v_team, 'assists',    '어시',   1, 2),
    (v_team, 'attendance', '출석',   2, 1),
    (v_team, 'points',     '포인트', 99, 0);

  update public.profiles
     set approved_at = now()
   where id = v_uid and approved_at is null;

  return v_team;
end;
$$;

grant execute on function public.create_team_with_owner(text, text) to authenticated;

notify pgrst, 'reload schema';
