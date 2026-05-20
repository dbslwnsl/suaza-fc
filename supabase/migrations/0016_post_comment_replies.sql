-- ============================================================
-- 0016: 댓글의 답글 (1단계)
--
-- - post_comments.parent_id 추가 (self-reference)
--   · null: 최상위 댓글
--   · not null: 그 댓글에 대한 답글
-- - on delete cascade: 부모 댓글 삭제 시 답글도 함께 삭제
-- - 인덱스: parent_id (답글 조회 가속)
-- ============================================================

alter table public.post_comments
  add column if not exists parent_id uuid
    references public.post_comments(id) on delete cascade;

create index if not exists post_comments_parent_idx
  on public.post_comments (parent_id);
