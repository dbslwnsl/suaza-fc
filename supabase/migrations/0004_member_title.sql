-- ============================================================
-- 0004: 회원 카테고리 재정의
--
-- - 시스템 권한 (profiles.role): 'manager' (앱 운영자) / 'player' (일반회원)
-- - 동호회 직책 (profiles.title): 회장/부회장/총무/감사/감독/코치/선수
--
-- 기존 'coach' role 데이터는 player + title='coach' 로 자동 이전
-- is_staff() 는 이제 manager 단독
-- ============================================================

create type public.member_title as enum (
  'president',       -- 회장
  'vice_president',  -- 부회장
  'treasurer',       -- 총무
  'auditor',         -- 감사
  'head_coach',      -- 감독
  'coach',           -- 코치
  'player'           -- 선수 (default)
);

alter table public.profiles
  add column if not exists title public.member_title not null default 'player';

-- 기존 role='coach' → player + title='coach'
update public.profiles
   set title = 'coach', role = 'player'
 where role = 'coach' and title = 'player';

-- is_staff() = manager 단독
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'manager' from public.profiles where id = auth.uid()),
    false
  );
$$;
