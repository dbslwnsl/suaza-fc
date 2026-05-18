-- ============================================================
-- 0006: 프로필 작성 완료 플래그
--
-- - 가입 직후의 프로필(트리거로 자동 생성된 빈 row)을
--   본인이 한 번도 수정하지 않았는지 판단할 boolean.
-- - 로그인 시 false 이면 프로필 수정 페이지로 강제 이동.
-- ============================================================

alter table public.profiles
  add column if not exists profile_completed boolean not null default false;
