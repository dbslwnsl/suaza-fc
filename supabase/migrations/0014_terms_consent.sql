-- ============================================================
-- 회원가입 약관 동의 시각 추적
-- ============================================================
-- 이용약관 / 개인정보 수집·이용 동의 시각을 profiles 에 기록.
-- 분쟁 발생 시 동의 증거로 활용.

alter table public.profiles
  add column if not exists terms_agreed_at   timestamptz,
  add column if not exists privacy_agreed_at timestamptz;

-- handle_new_user 트리거 업데이트 — auth.users.raw_user_meta_data 에 동의 시각을
-- 담아 가입 호출하면 profiles 에 함께 저장.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, terms_agreed_at, privacy_agreed_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    (new.raw_user_meta_data->>'terms_agreed_at')::timestamptz,
    (new.raw_user_meta_data->>'privacy_agreed_at')::timestamptz
  );
  return new;
end;
$$;
