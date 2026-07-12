-- ============================================================
-- 멀티팀 전환 Phase 2b — 자식 테이블·프로필 SELECT 를 팀 스코프로 교체
--
-- 자식 테이블은 team_id 컬럼 없이 부모(matches/posts/...)의 team_id 를
-- 조인해 "그 팀 멤버만 열람"으로 좁힌다. 쓰기 정책(본인/스태프)은 유지 —
-- 열람이 팀으로 좁혀지면 쓰기 대상도 자연히 자기 팀 데이터로 제한된다.
-- (수아자 회원은 전원 active 멤버라 현재 동작 변화 없음)
-- ============================================================

-- ── 프로필: "나와 같은 팀을 공유하는 회원"만 열람 ─────────────
create or replace function public.shares_team_with(target uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members a
    join public.team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and a.status = 'active'
      and b.user_id = target   and b.status = 'active'
  );
$$;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_team_with(id));

-- ── matches 자식들 ───────────────────────────────────────────
drop policy if exists ma_select_authenticated on public.match_attendances;
create policy ma_select_authenticated on public.match_attendances
  for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_member(m.team_id)
  ));

drop policy if exists mp_select_authenticated on public.match_participations;
create policy mp_select_authenticated on public.match_participations
  for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_member(m.team_id)
  ));

drop policy if exists mc_select_authenticated on public.match_comments;
create policy mc_select_authenticated on public.match_comments
  for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_member(m.team_id)
  ));

drop policy if exists formations_select_authenticated on public.formations;
create policy formations_select_authenticated on public.formations
  for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_member(m.team_id)
  ));

drop policy if exists "match_mercenaries_select" on public.match_mercenaries;
create policy "match_mercenaries_select" on public.match_mercenaries
  for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_member(m.team_id)
  ));

drop policy if exists match_comment_likes_select_authenticated on public.match_comment_likes;
create policy match_comment_likes_select_authenticated on public.match_comment_likes
  for select to authenticated
  using (exists (
    select 1
    from public.match_comments c
    join public.matches m on m.id = c.match_id
    where c.id = comment_id and public.is_team_member(m.team_id)
  ));

-- ── posts 자식들 ─────────────────────────────────────────────
drop policy if exists pc_select_authenticated on public.post_comments;
create policy pc_select_authenticated on public.post_comments
  for select to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and public.is_team_member(p.team_id)
  ));

drop policy if exists post_likes_select_authenticated on public.post_likes;
create policy post_likes_select_authenticated on public.post_likes
  for select to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and public.is_team_member(p.team_id)
  ));

drop policy if exists comment_likes_select_authenticated on public.comment_likes;
create policy comment_likes_select_authenticated on public.comment_likes
  for select to authenticated
  using (exists (
    select 1
    from public.post_comments c
    join public.posts p on p.id = c.post_id
    where c.id = comment_id and public.is_team_member(p.team_id)
  ));

-- coach_comment_likes(ccl_select_visible)는 코치 코멘트 가시성 정책에 종속 —
-- coach_comments 의 팀 단위 재작성(Phase 4)과 함께 처리한다.

notify pgrst, 'reload schema';
