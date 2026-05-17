-- ============================================================
-- 0005: 이메일 중복 확인 RPC
--
-- - 회원가입 폼에서 onBlur 시 이메일이 이미 가입되었는지 즉시 표시
-- - SECURITY DEFINER 로 auth.users 조회 (anon 도 호출 가능해야 함)
-- - 비교 시 lower(trim()) 으로 정규화
-- ============================================================

create or replace function public.email_exists(p_email text)
returns boolean
language sql stable security definer set search_path = public, auth
as $$
  select exists(
    select 1 from auth.users
    where lower(email) = lower(trim(p_email))
  );
$$;

grant execute on function public.email_exists(text) to authenticated, anon;
