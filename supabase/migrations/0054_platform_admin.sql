-- ============================================================
-- 플랫폼 관리자 + 팀 생성 승인제
--
-- 1) profiles.is_platform_admin — 앱 전체 관장 계정 (부여는 SQL로만)
--      update public.profiles set is_platform_admin = true, approved_at = now()
--       where id = '<관리자 uuid>';
-- 2) teams.status: pending(승인 대기) | active — 팀 생성은 신청제로 전환.
--    region / description — 신청 시 받는 부가 정보.
-- 3) 관리자 열람: is_team_member / shares_team_with 에 관리자 우회 추가
--    → 기존 화면 그대로 모든 팀 열람 가능. 쓰기(is_team_staff)는 우회 없음.
-- ============================================================

-- ── 1) 플랫폼 관리자 플래그 ──────────────────────────────────
alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select is_platform_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ── 2) 팀 상태·신청 정보 ─────────────────────────────────────
alter table public.teams
  add column if not exists status text not null default 'active',
  add column if not exists region text,
  add column if not exists description text;

-- 기존 팀(수아자 등)은 active 유지 (default 가 active 라 신규만 pending 으로 생성)

-- ── 3) 열람 우회 (쓰기 함수 is_team_staff 는 그대로 — 열람 전용) ──
create or replace function public.is_team_member(t uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_platform_admin()
      or exists (
        select 1 from public.team_members
        where team_id = t and user_id = auth.uid() and status = 'active'
      );
$$;

create or replace function public.shares_team_with(target uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_platform_admin()
      or exists (
        select 1
        from public.team_members a
        join public.team_members b on a.team_id = b.team_id
        where a.user_id = auth.uid() and a.status = 'active'
          and b.user_id = target   and b.status = 'active'
      );
$$;

-- ── 4) 팀 생성 RPC — 승인제(pending)로 전환 + 신청 정보 수집 ──
drop function if exists public.create_team_with_owner(text, text);

create or replace function public.create_team_with_owner(
  p_name text,
  p_slug text,
  p_region text default null,
  p_description text default null
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

  insert into public.teams (name, slug, region, description, status)
  values (
    trim(p_name),
    p_slug,
    nullif(trim(coalesce(p_region, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    'pending'
  )
  returning id into v_team;

  -- 생성자는 회장으로 등록되지만, 팀이 승인(active)되기 전까지는
  -- 팀 목록/전환에 노출되지 않는다 (앱에서 team.status='active' 필터).
  insert into public.team_members (team_id, user_id, role, title, status)
  values (v_team, v_uid, 'manager', 'president', 'active');

  insert into public.stat_definitions (team_id, key, label, sort_order, point_value)
  values
    (v_team, 'goals',      '골',     0, 3),
    (v_team, 'assists',    '어시',   1, 2),
    (v_team, 'attendance', '출석',   2, 1),
    (v_team, 'points',     '포인트', 99, 0);

  -- 주의: 신규 가입자의 전역 승인(approved_at)은 여기서 하지 않는다.
  -- 팀 승인(approve) 시점에 함께 처리 → 그 전까지 승인 대기 화면에 머문다.

  return v_team;
end;
$$;

grant execute on function public.create_team_with_owner(text, text, text, text) to authenticated;

-- ── 5) 관리자 지정/해제 편의 함수 — 이메일로 지정 (SQL 에디터 전용) ──
-- 사용:  select public.set_platform_admin('someone@example.com');        -- 지정
--        select public.set_platform_admin('someone@example.com', false); -- 해제
create or replace function public.set_platform_admin(
  p_email text,
  p_admin boolean default true
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from auth.users
   where lower(email) = lower(trim(p_email));
  if v_id is null then
    return '해당 이메일의 계정이 없습니다: ' || p_email;
  end if;

  update public.profiles
     set is_platform_admin = p_admin,
         -- 관리자 지정 시 가입 승인 대기도 함께 해제
         approved_at = coalesce(approved_at, now()),
         -- 관리자 계정 이름은 무조건 "관리자" 로 표기 (아바타 폴백 = "관")
         name = case when p_admin then '관리자' else name end
   where id = v_id;

  return (case when p_admin
           then '플랫폼 관리자 지정 완료: '
           else '플랫폼 관리자 해제 완료: ' end) || p_email;
end;
$$;

-- ⚠️ 앱(클라이언트)에서 호출 불가 — SQL 에디터(관리 콘솔)에서만 실행 가능.
revoke all on function public.set_platform_admin(text, boolean)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
