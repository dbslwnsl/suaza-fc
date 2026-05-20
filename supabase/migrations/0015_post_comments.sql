-- ============================================================
-- 0015: 게시글 댓글
--
-- - post_comments: 게시글 본문 아래 달리는 댓글
-- - RLS: 로그인 회원은 SELECT/INSERT, 본인 글은 UPDATE/DELETE,
--        매니저는 모든 행 수정/삭제 가능 (운영용)
-- - 인덱스: post_id, created_at
-- ============================================================

create table public.post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index post_comments_post_idx
  on public.post_comments (post_id, created_at asc);
create index post_comments_author_idx
  on public.post_comments (author_id);

alter table public.post_comments enable row level security;

create policy pc_select_authenticated on public.post_comments
  for select to authenticated using (true);

create policy pc_insert_self on public.post_comments
  for insert to authenticated
  with check (author_id = auth.uid());

create policy pc_update_self on public.post_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy pc_delete_self on public.post_comments
  for delete to authenticated
  using (author_id = auth.uid());

-- 매니저는 모든 행에 대해 update/delete 가능
create policy pc_update_manager on public.post_comments
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  )
  with check (true);

create policy pc_delete_manager on public.post_comments
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  );
