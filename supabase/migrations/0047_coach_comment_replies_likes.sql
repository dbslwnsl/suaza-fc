-- ============================================================
-- 0047: 감독&코치 코멘트에 답글 + 좋아요 추가
--
-- - 답글: coach_comments.parent_id (self-reference, 0016 게시판 패턴과 동일)
--     · null = 최상위 코멘트, not null = 그 코멘트의 답글 (1단계)
--     · on delete cascade: 코멘트 삭제 시 답글도 함께 삭제
-- - 권한 변경: "보는 사람 전부"
--     · 코멘트/답글 작성 = 대상 회원 본인(member_id = 나) 또는 감독/코치
--     · 좋아요 = 그 코멘트를 볼 수 있는 사람만 (대상 회원 또는 감독/코치)
-- - coach_comment_likes: 코멘트 1개에 회원 1명당 좋아요 1번 (0045 패턴)
-- ============================================================

-- ── 답글 컬럼 ──────────────────────────────────────────────
alter table public.coach_comments
  add column if not exists parent_id uuid
    references public.coach_comments(id) on delete cascade;

create index if not exists coach_comments_parent_idx
  on public.coach_comments (parent_id);

-- ── 작성 권한: 대상 회원 본인 또는 감독/코치 (author 는 본인) ──
drop policy if exists cc_insert_staff on public.coach_comments;
create policy cc_insert_member_or_staff on public.coach_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (member_id = auth.uid() or public.is_coaching_staff())
  );

-- ── 수정/삭제: 작성자 본인 (감독/코치 제한 해제 → 회원도 자기 글 수정/삭제) ──
drop policy if exists cc_update_author on public.coach_comments;
create policy cc_update_author on public.coach_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists cc_delete_author on public.coach_comments;
create policy cc_delete_author on public.coach_comments
  for delete to authenticated
  using (author_id = auth.uid());

-- ── 좋아요 테이블 ──────────────────────────────────────────
create table if not exists public.coach_comment_likes (
  comment_id uuid not null references public.coach_comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists coach_comment_likes_comment_idx
  on public.coach_comment_likes (comment_id);

alter table public.coach_comment_likes enable row level security;

-- 좋아요 조회: 그 코멘트를 볼 수 있는 사람만 (대상 회원 또는 감독/코치)
create policy ccl_select_visible on public.coach_comment_likes
  for select to authenticated
  using (
    exists (
      select 1 from public.coach_comments cc
      where cc.id = comment_id
        and (cc.member_id = auth.uid() or public.is_coaching_staff())
    )
  );

-- 좋아요 추가: 본인 + 볼 수 있는 코멘트만
create policy ccl_insert_self on public.coach_comment_likes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.coach_comments cc
      where cc.id = comment_id
        and (cc.member_id = auth.uid() or public.is_coaching_staff())
    )
  );

-- 좋아요 삭제(토글): 본인
create policy ccl_delete_self on public.coach_comment_likes
  for delete to authenticated
  using (user_id = auth.uid());

notify pgrst, 'reload schema';
