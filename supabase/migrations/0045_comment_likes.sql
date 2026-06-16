-- ============================================================
-- 0045: 게시글 댓글 좋아요 (comment_likes)
--
-- - post_likes(0044) 와 동일한 패턴 — 댓글 1개에 회원 1명당 좋아요 1번.
-- - 좋아요 수 = 행 개수, 본인 좋아요 여부 = 본인 행 존재 여부.
-- - 조회는 모든 로그인 회원, 추가/삭제(토글)는 본인 것만.
-- ============================================================

create table if not exists public.comment_likes (
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_likes_comment_idx on public.comment_likes (comment_id);

alter table public.comment_likes enable row level security;

create policy comment_likes_select_authenticated on public.comment_likes
  for select to authenticated using (true);

create policy comment_likes_insert_self on public.comment_likes
  for insert to authenticated with check (user_id = auth.uid());

create policy comment_likes_delete_self on public.comment_likes
  for delete to authenticated using (user_id = auth.uid());
