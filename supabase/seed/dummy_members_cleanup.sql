-- ============================================================
-- 더미 회원 일괄 삭제 (개발/테스트용)
--   - auth.users 에서 @suaza.local 도메인 계정 삭제
--   - profiles 는 ON DELETE CASCADE 로 자동 정리됨
-- ============================================================

delete from auth.users
where email like '%@suaza.local';
