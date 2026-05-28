-- ============================================================
-- 0032: 감독&코치 코멘트에 "경기 연결" 추가
--
-- - match_id: 종료된 경기와 연결해 "그날의 코멘트"로 남길 수 있음 (선택)
--   NULL 이면 특정 경기와 무관한 일반 코멘트.
--   경기가 삭제되면 코멘트는 남기고 연결만 해제 (on delete set null).
-- ============================================================

alter table public.coach_comments
  add column if not exists match_id uuid
    references public.matches(id) on delete set null;

create index if not exists coach_comments_match_idx
  on public.coach_comments (match_id);

notify pgrst, 'reload schema';
