-- ============================================================
-- 0031: 감독&코치 코멘트
--
-- - coach_comments: 회원 프로필에 감독(head_coach)/코치(coach)가 남기는 개인 조언
--   - member_id : 코멘트 대상 회원
--   - author_id : 작성한 감독/코치
-- - 조회(RLS): 대상 본인(member_id = 나) 또는 감독/코치만 가능.
--   → 감독/코치가 아닌 회원은 '내 프로필의 코멘트'만 보이고 타인 것은 안 보임.
-- - 작성/수정/삭제: 감독/코치만, 본인이 쓴 코멘트만 수정/삭제.
-- ============================================================

-- 감독/코치 여부 (title 기준)
create or replace function public.is_coaching_staff() returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (
      select title in ('head_coach', 'coach')
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$$;

create table public.coach_comments (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index coach_comments_member_idx
  on public.coach_comments (member_id, created_at asc);
create index coach_comments_author_idx
  on public.coach_comments (author_id);

alter table public.coach_comments enable row level security;

-- 조회: 대상 본인 또는 감독/코치
create policy cc_select_self_or_staff on public.coach_comments
  for select to authenticated
  using (member_id = auth.uid() or public.is_coaching_staff());

-- 작성: 감독/코치만, author 는 본인
create policy cc_insert_staff on public.coach_comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_coaching_staff());

-- 수정: 작성한 감독/코치 본인 글만
create policy cc_update_author on public.coach_comments
  for update to authenticated
  using (author_id = auth.uid() and public.is_coaching_staff())
  with check (author_id = auth.uid() and public.is_coaching_staff());

-- 삭제: 작성한 감독/코치 본인 글만
create policy cc_delete_author on public.coach_comments
  for delete to authenticated
  using (author_id = auth.uid() and public.is_coaching_staff());

notify pgrst, 'reload schema';
