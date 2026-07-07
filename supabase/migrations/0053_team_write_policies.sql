-- ============================================================
-- 멀티팀 전환 Phase 4 — 쓰기 권한을 team_members 기준으로 이관
--
-- 1) 공용 판정 함수(is_staff/is_manager/is_coaching_staff)를
--    전역 profiles.role → team_members(활성 소속) 기준으로 재정의.
--    → 새 팀의 회장·코치도 (profiles.role=player 이지만) 권한 동작.
--    → 이 함수들을 쓰는 기존 정책(코치 코멘트·스토리지 등)은 그대로 동작.
-- 2) 팀 스코프 판정 함수 추가: is_team_staff / is_team_coaching_staff
-- 3) 핵심 쓰기 정책을 "그 행의 팀" 기준으로 재작성
--    → A팀 매니저가 B팀 데이터를 id 로 직접 조작하는 것을 서버에서 차단.
-- ============================================================

-- ── 1) 공용 함수 재정의 (내가 속한 '어느' 활성 팀에서든 해당 권한) ──
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where user_id = auth.uid() and status = 'active' and role = 'manager'
  );
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where user_id = auth.uid() and status = 'active' and role = 'manager'
  );
$$;

create or replace function public.is_coaching_staff() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where user_id = auth.uid() and status = 'active'
      and (role = 'manager'
           or title in ('president', 'head_coach', 'coach'))
  );
$$;

-- ── 2) 팀 스코프 판정 ────────────────────────────────────────
-- 그 팀의 회장·감독(manager)
create or replace function public.is_team_staff(t uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = t and user_id = auth.uid()
      and status = 'active' and role = 'manager'
  );
$$;

-- 그 팀의 코칭스태프(회장·감독·코치)
create or replace function public.is_team_coaching_staff(t uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = t and user_id = auth.uid()
      and status = 'active'
      and (role = 'manager'
           or title in ('president', 'head_coach', 'coach'))
  );
$$;

-- 대상 회원과 같은 팀에서 내가 매니저인가 (프로필 수정 권한)
create or replace function public.is_manager_of_shared_team(target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.team_members a
    join public.team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and a.status = 'active' and a.role = 'manager'
      and b.user_id = target   and b.status = 'active'
  );
$$;

-- ── 3) 핵심 쓰기 정책 재작성 (그 행의 팀 기준) ─────────────────

-- matches: 그 팀의 회장·감독만 쓰기
drop policy if exists matches_write_staff on public.matches;
create policy matches_write_staff on public.matches
  for all to authenticated
  using (public.is_team_staff(team_id))
  with check (public.is_team_staff(team_id));

-- match_attendances: 스태프 쓰기 → 그 경기 팀의 스태프
drop policy if exists ma_write_staff on public.match_attendances;
create policy ma_write_staff on public.match_attendances
  for all to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_staff(m.team_id)
  ))
  with check (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_staff(m.team_id)
  ));

-- match_participations
drop policy if exists mp_write_staff on public.match_participations;
create policy mp_write_staff on public.match_participations
  for all to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_staff(m.team_id)
  ))
  with check (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_staff(m.team_id)
  ));

-- match_mercenaries
drop policy if exists "match_mercenaries_write" on public.match_mercenaries;
create policy "match_mercenaries_write" on public.match_mercenaries
  for all to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_staff(m.team_id)
  ))
  with check (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_staff(m.team_id)
  ));

-- stat_definitions: 그 팀의 회장·감독만
drop policy if exists stat_def_write_manager on public.stat_definitions;
create policy stat_def_write_manager on public.stat_definitions
  for all to authenticated
  using (public.is_team_staff(team_id))
  with check (public.is_team_staff(team_id));

-- formations: 스태프 전체 쓰기 + 코칭스태프 insert/update → 그 경기 팀 기준
drop policy if exists formations_write_staff on public.formations;
create policy formations_write_staff on public.formations
  for all to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_staff(m.team_id)
  ))
  with check (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_staff(m.team_id)
  ));

drop policy if exists formations_insert_coaching_staff on public.formations;
create policy formations_insert_coaching_staff on public.formations
  for insert to authenticated
  with check (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_coaching_staff(m.team_id)
  ));

drop policy if exists formations_update_coaching_staff on public.formations;
create policy formations_update_coaching_staff on public.formations
  for update to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_coaching_staff(m.team_id)
  ))
  with check (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_coaching_staff(m.team_id)
  ));

-- posts: 본인 또는 그 팀 스태프만 수정/삭제 (과거 두 정책명 모두 정리)
drop policy if exists posts_update_self_or_manager on public.posts;
drop policy if exists posts_update_self_or_president on public.posts;
create policy posts_update_scoped on public.posts
  for update to authenticated
  using (author_id = auth.uid() or public.is_team_staff(team_id))
  with check (author_id = auth.uid() or public.is_team_staff(team_id));

drop policy if exists posts_delete_self_or_manager on public.posts;
drop policy if exists posts_delete_self_or_president on public.posts;
create policy posts_delete_scoped on public.posts
  for delete to authenticated
  using (author_id = auth.uid() or public.is_team_staff(team_id));

-- post_comments: 매니저 수정/삭제 → 그 글 팀의 스태프
drop policy if exists pc_update_manager on public.post_comments;
create policy pc_update_manager on public.post_comments
  for update to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and public.is_team_staff(p.team_id)
  ))
  with check (exists (
    select 1 from public.posts p
    where p.id = post_id and public.is_team_staff(p.team_id)
  ));

drop policy if exists pc_delete_manager on public.post_comments;
create policy pc_delete_manager on public.post_comments
  for delete to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and public.is_team_staff(p.team_id)
  ));

-- match_comments: 매니저 수정/삭제 → 그 경기 팀의 스태프
drop policy if exists mc_update_manager on public.match_comments;
create policy mc_update_manager on public.match_comments
  for update to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_staff(m.team_id)
  ))
  with check (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_staff(m.team_id)
  ));

drop policy if exists mc_delete_manager on public.match_comments;
create policy mc_delete_manager on public.match_comments
  for delete to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_team_staff(m.team_id)
  ));

-- photos: 본인 또는 그 팀 스태프
drop policy if exists photos_update_self_or_manager on public.photos;
create policy photos_update_self_or_manager on public.photos
  for update to authenticated
  using (user_id = auth.uid() or public.is_team_staff(team_id))
  with check (user_id = auth.uid() or public.is_team_staff(team_id));

drop policy if exists photos_delete_self_or_manager on public.photos;
create policy photos_delete_self_or_manager on public.photos
  for delete to authenticated
  using (user_id = auth.uid() or public.is_team_staff(team_id));

-- profiles: 매니저의 타인 수정 → "같은 팀"의 매니저만
drop policy if exists profiles_update_by_manager on public.profiles;
create policy profiles_update_by_manager on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_manager_of_shared_team(id))
  with check (id = auth.uid() or public.is_manager_of_shared_team(id));

-- coach_comments / coach_comment_likes 정책은 재정의된 is_coaching_staff()
-- (활성 소속 팀 기준)로 동작 — 행 단위 팀 정밀화는 추후 과제.

notify pgrst, 'reload schema';
