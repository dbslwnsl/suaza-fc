-- ============================================================
-- 0012: 회원(profile) Soft Delete
--
-- - profiles.deleted_at timestamptz (null = 활성)
-- - 인덱스: 활성 회원 조회 가속용 partial index
-- - 과거 경기 기록(match_participations, match_attendances)에서의
--   player join 은 그대로 유지 → 삭제된 회원도 과거 기록엔 이름 남음
-- - 회원 목록 / 후보 목록 쿼리에서만 app-level 로 deleted_at IS NULL 필터링
-- ============================================================

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create index if not exists profiles_active_idx
  on public.profiles (id)
  where deleted_at is null;
