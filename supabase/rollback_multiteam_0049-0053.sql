-- ============================================================
-- 멀티팀 전환(0049~0053) DB 롤백 — 1회 실행용 (마이그레이션 아님)
--
-- 실행 순서 중요: 정책 원복 → 함수 원복/제거 → 컬럼 제거 → 테이블 제거
-- 전체가 한 트랜잭션으로 실행되므로 중간 에러 시 자동 롤백됨.
--
-- ⚠️ 테스트로 만든 "다른 팀"의 데이터(팀·경기·글·알림 등)는 함께 삭제된다.
--    수아자FC 데이터는 그대로 보존된다.
-- ============================================================

-- ── 0) 테스트로 생긴 타 팀 데이터 정리 (수아자 고정 UUID 외 전부) ──
delete from public.notifications
  where team_id <> '00000000-0000-4000-8000-000000000001';
delete from public.coach_comments
  where team_id <> '00000000-0000-4000-8000-000000000001';
delete from public.posts
  where team_id <> '00000000-0000-4000-8000-000000000001';
delete from public.photos
  where team_id <> '00000000-0000-4000-8000-000000000001';
delete from public.matches
  where team_id <> '00000000-0000-4000-8000-000000000001';
delete from public.stat_definitions
  where team_id <> '00000000-0000-4000-8000-000000000001';

-- ── 1) SELECT 정책 원복 (전부 "로그인하면 열람") ──────────────
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);

drop policy if exists matches_select_authenticated on public.matches;
create policy matches_select_authenticated on public.matches
  for select to authenticated using (true);

drop policy if exists posts_select_authenticated on public.posts;
create policy posts_select_authenticated on public.posts
  for select to authenticated using (true);

drop policy if exists photos_select_authenticated on public.photos;
create policy photos_select_authenticated on public.photos
  for select to authenticated using (true);

drop policy if exists stat_def_select on public.stat_definitions;
create policy stat_def_select on public.stat_definitions
  for select to authenticated using (true);

drop policy if exists ma_select_authenticated on public.match_attendances;
create policy ma_select_authenticated on public.match_attendances
  for select to authenticated using (true);

drop policy if exists mp_select_authenticated on public.match_participations;
create policy mp_select_authenticated on public.match_participations
  for select to authenticated using (true);

drop policy if exists mc_select_authenticated on public.match_comments;
create policy mc_select_authenticated on public.match_comments
  for select to authenticated using (true);

drop policy if exists formations_select_authenticated on public.formations;
create policy formations_select_authenticated on public.formations
  for select to authenticated using (true);

drop policy if exists "match_mercenaries_select" on public.match_mercenaries;
create policy "match_mercenaries_select" on public.match_mercenaries
  for select to authenticated using (true);

drop policy if exists pc_select_authenticated on public.post_comments;
create policy pc_select_authenticated on public.post_comments
  for select to authenticated using (true);

drop policy if exists post_likes_select_authenticated on public.post_likes;
create policy post_likes_select_authenticated on public.post_likes
  for select to authenticated using (true);

drop policy if exists comment_likes_select_authenticated on public.comment_likes;
create policy comment_likes_select_authenticated on public.comment_likes
  for select to authenticated using (true);

drop policy if exists match_comment_likes_select_authenticated on public.match_comment_likes;
create policy match_comment_likes_select_authenticated on public.match_comment_likes
  for select to authenticated using (true);

-- ── 2) 쓰기 정책 원복 (0053 이전 원본) ─────────────────────────
drop policy if exists matches_write_staff on public.matches;
create policy matches_write_staff on public.matches
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists ma_write_staff on public.match_attendances;
create policy ma_write_staff on public.match_attendances
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists mp_write_staff on public.match_participations;
create policy mp_write_staff on public.match_participations
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "match_mercenaries_write" on public.match_mercenaries;
create policy "match_mercenaries_write" on public.match_mercenaries
  for all to authenticated using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('manager', 'coach') or p.title in ('president', 'head_coach'))
    )
    or exists (
      select 1 from public.matches m
      where m.id = match_mercenaries.match_id
        and (m.team_a_captain = auth.uid() or m.team_b_captain = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('manager', 'coach') or p.title in ('president', 'head_coach'))
    )
    or exists (
      select 1 from public.matches m
      where m.id = match_mercenaries.match_id
        and (m.team_a_captain = auth.uid() or m.team_b_captain = auth.uid())
    )
  );

drop policy if exists stat_def_write_manager on public.stat_definitions;
create policy stat_def_write_manager on public.stat_definitions
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

drop policy if exists formations_write_staff on public.formations;
create policy formations_write_staff on public.formations
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists formations_insert_coaching_staff on public.formations;
create policy formations_insert_coaching_staff on public.formations
  for insert to authenticated
  with check (public.is_coaching_staff());

drop policy if exists formations_update_coaching_staff on public.formations;
create policy formations_update_coaching_staff on public.formations
  for update to authenticated
  using (public.is_coaching_staff())
  with check (public.is_coaching_staff());

-- posts: 0053이 만든 scoped 정책 제거 → 원본(자신 또는 매니저) 복원
-- (0030의 회장 전용 정책은 이 DB에 적용된 적 없음 → 0001 버전으로 복원)
drop policy if exists posts_update_scoped on public.posts;
drop policy if exists posts_update_self_or_president on public.posts;
drop policy if exists posts_update_self_or_manager on public.posts;
create policy posts_update_self_or_manager on public.posts
  for update to authenticated
  using (author_id = auth.uid() or public.is_manager())
  with check (author_id = auth.uid() or public.is_manager());

drop policy if exists posts_delete_scoped on public.posts;
drop policy if exists posts_delete_self_or_president on public.posts;
drop policy if exists posts_delete_self_or_manager on public.posts;
create policy posts_delete_self_or_manager on public.posts
  for delete to authenticated
  using (author_id = auth.uid() or public.is_manager());

drop policy if exists pc_update_manager on public.post_comments;
create policy pc_update_manager on public.post_comments
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  );

drop policy if exists pc_delete_manager on public.post_comments;
create policy pc_delete_manager on public.post_comments
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  );

drop policy if exists mc_update_manager on public.match_comments;
create policy mc_update_manager on public.match_comments
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  );

drop policy if exists mc_delete_manager on public.match_comments;
create policy mc_delete_manager on public.match_comments
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  );

drop policy if exists photos_update_self_or_manager on public.photos;
create policy photos_update_self_or_manager on public.photos
  for update to authenticated
  using (uploader_id = auth.uid() or public.is_manager())
  with check (uploader_id = auth.uid() or public.is_manager());

drop policy if exists photos_delete_self_or_manager on public.photos;
create policy photos_delete_self_or_manager on public.photos
  for delete to authenticated
  using (uploader_id = auth.uid() or public.is_manager());

drop policy if exists profiles_update_by_manager on public.profiles;
create policy profiles_update_by_manager on public.profiles
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- ── 3) 판정 함수 원복 (0053 이전 profiles 기반 정의) ───────────
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'manager' from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'manager' from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_coaching_staff() returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (
      select role in ('manager', 'coach')
          or title in ('president', 'head_coach', 'coach')
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$$;

-- ── 4) 멀티팀 전용 함수 제거 ───────────────────────────────────
drop function if exists public.is_team_staff(uuid);
drop function if exists public.is_team_coaching_staff(uuid);
drop function if exists public.is_manager_of_shared_team(uuid);
drop function if exists public.shares_team_with(uuid);
drop function if exists public.create_team_with_owner(text, text);

-- ── 5) team_id 컬럼 제거 (0050 원복) ──────────────────────────
-- stat_definitions: 복합 PK → key 단독 PK 복원 후 컬럼 제거
alter table public.stat_definitions drop constraint if exists stat_definitions_pkey;
alter table public.stat_definitions add constraint stat_definitions_pkey primary key (key);
alter table public.stat_definitions drop column if exists team_id;

alter table public.matches drop column if exists team_id;
alter table public.posts drop column if exists team_id;
alter table public.photos drop column if exists team_id;
alter table public.coach_comments drop column if exists team_id;
alter table public.notifications drop column if exists team_id;

-- ── 6) 팀 테이블·헬퍼 제거 (0049 원복) ────────────────────────
-- 테이블을 먼저 삭제해야 그 위의 정책(is_team_member 참조)이 함께 제거되어
-- 함수 drop 이 의존성 에러 없이 통과한다.
drop table if exists public.team_members;
drop table if exists public.teams;
drop function if exists public.is_team_member(uuid);
drop function if exists public.is_team_manager(uuid);

notify pgrst, 'reload schema';
