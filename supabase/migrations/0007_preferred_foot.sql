-- ============================================================
-- 0007: 주발 (preferred_foot) 필드 추가
--
-- - left  / right / both
-- - 없을 수 있음 (NULL 허용)
-- ============================================================

create type public.preferred_foot as enum ('left', 'right', 'both');

alter table public.profiles
  add column if not exists preferred_foot public.preferred_foot;
