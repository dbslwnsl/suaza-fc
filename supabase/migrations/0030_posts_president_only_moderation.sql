-- ============================================================
-- 0030: 게시글 모더레이션을 "회장(president)" 전용으로 제한
--
-- - 기존: role='manager' 인 사람(회장·감독 모두)이 타인 글 수정/삭제 가능
-- - 변경: title='president'(회장) 만 타인 글 수정/삭제 가능.
--         그 외(감독 포함)는 본인 글만 수정/삭제.
-- ============================================================

create or replace function public.is_president() returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select title = 'president' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- posts: 본인 글은 누구나, 타인 글은 회장만 수정/삭제
drop policy if exists posts_update_self_or_manager on public.posts;
create policy posts_update_self_or_president on public.posts
  for update to authenticated
  using (author_id = auth.uid() or public.is_president())
  with check (author_id = auth.uid() or public.is_president());

drop policy if exists posts_delete_self_or_manager on public.posts;
create policy posts_delete_self_or_president on public.posts
  for delete to authenticated
  using (author_id = auth.uid() or public.is_president());

notify pgrst, 'reload schema';
