-- ============================================================
-- 0044: 게시글 좋아요 (post_likes)
--
-- - 회원 1명당 글 1개에 좋아요 1번 (post_id + user_id 복합 PK)
-- - 좋아요 수 = 행 개수, 본인 좋아요 여부 = 본인 행 존재 여부
-- - 조회는 모든 로그인 회원, 추가/삭제(토글)는 본인 것만
-- ============================================================

create table if not exists public.post_likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_post_idx on public.post_likes (post_id);

alter table public.post_likes enable row level security;

create policy post_likes_select_authenticated on public.post_likes
  for select to authenticated using (true);

create policy post_likes_insert_self on public.post_likes
  for insert to authenticated with check (user_id = auth.uid());

create policy post_likes_delete_self on public.post_likes
  for delete to authenticated using (user_id = auth.uid());
