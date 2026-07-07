-- ============================================================
-- 멀티팀 전환 Phase 2a — 루트 테이블 team_id + 백필 + SELECT 팀 스코프
--
-- 대상(팀 소유 데이터의 루트): matches, posts, photos, stat_definitions,
--   coach_comments, notifications
-- 자식 테이블(match_*, post_comments, *_likes, formations)은 부모를 통해
--   팀이 결정되므로 컬럼을 두지 않는다. 자식 RLS 의 부모 조인 스코프는
--   Phase 2b(0051)에서 처리 — 두 번째 팀 온보딩 전까지만 완료하면 안전.
--
-- 전략:
--  1) team_id 추가 → 기존 행 수아자FC 로 백필 → NOT NULL
--  2) DEFAULT 수아자FC (임시) — 현재 앱 코드가 team_id 없이 insert 해도 동작.
--     Phase 3에서 앱이 팀 컨텍스트를 명시하게 되면 DEFAULT 제거.
--  3) 단순 "authenticated" SELECT 정책 → is_team_member(team_id) 로 교체.
--     (수아자 회원은 전원 active 멤버로 백필돼 있어 현재 동작 변화 없음)
-- ============================================================

-- 수아자FC 고정 UUID (0049 와 동일)
-- '00000000-0000-4000-8000-000000000001'

-- ── matches ─────────────────────────────────────────────────
alter table public.matches
  add column if not exists team_id uuid references public.teams(id);
update public.matches
  set team_id = '00000000-0000-4000-8000-000000000001'::uuid
  where team_id is null;
alter table public.matches
  alter column team_id set default '00000000-0000-4000-8000-000000000001'::uuid;
alter table public.matches alter column team_id set not null;
create index if not exists matches_team_idx on public.matches (team_id);

drop policy if exists matches_select_authenticated on public.matches;
create policy matches_select_authenticated on public.matches
  for select to authenticated
  using (public.is_team_member(team_id));

-- ── posts ───────────────────────────────────────────────────
alter table public.posts
  add column if not exists team_id uuid references public.teams(id);
update public.posts
  set team_id = '00000000-0000-4000-8000-000000000001'::uuid
  where team_id is null;
alter table public.posts
  alter column team_id set default '00000000-0000-4000-8000-000000000001'::uuid;
alter table public.posts alter column team_id set not null;
create index if not exists posts_team_idx on public.posts (team_id);

drop policy if exists posts_select_authenticated on public.posts;
create policy posts_select_authenticated on public.posts
  for select to authenticated
  using (public.is_team_member(team_id));

-- ── photos ──────────────────────────────────────────────────
alter table public.photos
  add column if not exists team_id uuid references public.teams(id);
update public.photos
  set team_id = '00000000-0000-4000-8000-000000000001'::uuid
  where team_id is null;
alter table public.photos
  alter column team_id set default '00000000-0000-4000-8000-000000000001'::uuid;
alter table public.photos alter column team_id set not null;
create index if not exists photos_team_idx on public.photos (team_id);

drop policy if exists photos_select_authenticated on public.photos;
create policy photos_select_authenticated on public.photos
  for select to authenticated
  using (public.is_team_member(team_id));

-- ── stat_definitions ────────────────────────────────────────
-- key 단독 PK → (team_id, key) 복합 PK. 팀마다 같은 key(goals 등)를 갖는다.
alter table public.stat_definitions
  add column if not exists team_id uuid references public.teams(id);
update public.stat_definitions
  set team_id = '00000000-0000-4000-8000-000000000001'::uuid
  where team_id is null;
alter table public.stat_definitions
  alter column team_id set default '00000000-0000-4000-8000-000000000001'::uuid;
alter table public.stat_definitions alter column team_id set not null;

do $$
begin
  -- 기존 PK(key 단독)를 복합 PK 로 교체 (재실행 안전)
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'stat_definitions'
      and c.contype = 'p'
      and array_length(c.conkey, 1) = 1
  ) then
    alter table public.stat_definitions drop constraint stat_definitions_pkey;
    alter table public.stat_definitions
      add constraint stat_definitions_pkey primary key (team_id, key);
  end if;
end $$;

drop policy if exists stat_def_select on public.stat_definitions;
create policy stat_def_select on public.stat_definitions
  for select to authenticated
  using (public.is_team_member(team_id));

-- ── coach_comments ──────────────────────────────────────────
-- 열람 정책(본인/코치진)은 유지 — 팀 단위 코치진 판정으로의 전환은 Phase 4.
alter table public.coach_comments
  add column if not exists team_id uuid references public.teams(id);
update public.coach_comments
  set team_id = '00000000-0000-4000-8000-000000000001'::uuid
  where team_id is null;
alter table public.coach_comments
  alter column team_id set default '00000000-0000-4000-8000-000000000001'::uuid;
alter table public.coach_comments alter column team_id set not null;
create index if not exists coach_comments_team_idx on public.coach_comments (team_id);

-- ── notifications ───────────────────────────────────────────
-- 정책은 이미 본인(user_id) 스코프 — team_id 는 "현재 팀" 필터용 컬럼만 추가.
alter table public.notifications
  add column if not exists team_id uuid references public.teams(id);
update public.notifications
  set team_id = '00000000-0000-4000-8000-000000000001'::uuid
  where team_id is null;
alter table public.notifications
  alter column team_id set default '00000000-0000-4000-8000-000000000001'::uuid;
alter table public.notifications alter column team_id set not null;
create index if not exists notifications_team_idx on public.notifications (team_id);

notify pgrst, 'reload schema';
