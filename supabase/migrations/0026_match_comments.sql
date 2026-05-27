-- ============================================================
-- 0026: 경기 댓글
--
-- - match_comments: 경기 상세 페이지에 달리는 댓글 (post_comments 와 동일 구조)
-- - RLS: 로그인 회원은 SELECT/INSERT, 본인 글은 UPDATE/DELETE,
--        매니저는 모든 행 수정/삭제 가능 (운영용)
-- - parent_id: 답글 (self-reference)
-- ============================================================

create table public.match_comments (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  parent_id   uuid references public.match_comments(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index match_comments_match_idx
  on public.match_comments (match_id, created_at asc);
create index match_comments_author_idx
  on public.match_comments (author_id);
create index match_comments_parent_idx
  on public.match_comments (parent_id);

alter table public.match_comments enable row level security;

create policy mc_select_authenticated on public.match_comments
  for select to authenticated using (true);

create policy mc_insert_self on public.match_comments
  for insert to authenticated
  with check (author_id = auth.uid());

create policy mc_update_self on public.match_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy mc_delete_self on public.match_comments
  for delete to authenticated
  using (author_id = auth.uid());

-- 매니저는 모든 행에 대해 update/delete 가능
create policy mc_update_manager on public.match_comments
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  )
  with check (true);

create policy mc_delete_manager on public.match_comments
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  );
