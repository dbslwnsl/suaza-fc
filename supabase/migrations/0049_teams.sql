-- ============================================================
-- 멀티팀(멀티테넌트) 전환 Phase 1 — 팀/소속 테이블 + 수아자FC 백필
--
-- 설계 결정 (2026-07):
--  - 한 사용자가 여러 팀에 소속 가능 (team_members 조인 테이블)
--  - role(manager/player)·title(회장/감독/...)은 "팀 소속"의 속성으로 이동
--    (profiles 의 role/title 은 Phase 2~3 전환 완료 후 제거 예정 — 당분간 병행)
--  - 가입: 팀 목록에서 선택 또는 초대코드 입력 → status='pending' → 회장 승인
--  - 이 마이그레이션은 순수 추가(additive) — 기존 앱 동작에 영향 없음
-- ============================================================

-- 팀
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  emblem_url  text,
  -- 가입용 초대코드 (6자리 대문자). 재발급 시 update.
  invite_code text not null unique
              default upper(substr(md5(random()::text), 1, 6)),
  created_at  timestamptz not null default now()
);

-- 팀 소속 (사용자 1명이 여러 팀 가능)
create table if not exists public.team_members (
  team_id    uuid not null references public.teams(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  -- 시스템 권한: manager(회장·감독) | player
  role       text not null default 'player',
  -- 직책: president | vice_president | treasurer | auditor | head_coach | coach | player
  title      text not null default 'player',
  -- pending(가입 신청, 승인 대기) | active(정식 멤버)
  status     text not null default 'pending',
  joined_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists team_members_user_idx on public.team_members (user_id);

-- ── 멤버십 헬퍼 (RLS 정책에서 공용 사용) ─────────────────────
-- security definer: team_members 자체의 RLS 를 우회해 재귀 없이 판정.
create or replace function public.is_team_member(t uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = t and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_team_manager(t uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = t and user_id = auth.uid()
      and status = 'active' and role = 'manager'
  );
$$;

-- ── RLS ─────────────────────────────────────────────────────
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- 팀 목록: 로그인한 누구나 열람 (가입 시 팀 선택 화면에 필요)
create policy teams_select on public.teams
  for select to authenticated using (true);

-- 팀 생성: 로그인한 누구나 (생성 직후 본인을 회장 멤버로 넣는 것은 서버 액션에서 처리)
create policy teams_insert on public.teams
  for insert to authenticated with check (true);

-- 팀 정보 수정(이름·엠블럼·초대코드 재발급): 그 팀 매니저만
create policy teams_update on public.teams
  for update to authenticated
  using (public.is_team_manager(id))
  with check (public.is_team_manager(id));

-- 소속 조회: 본인 행 + 내가 속한 팀의 멤버 목록
create policy team_members_select on public.team_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_team_member(team_id));

-- 가입 신청: 본인이 pending 으로만 insert 가능
create policy team_members_insert on public.team_members
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

-- 승인/권한·직책 변경: 그 팀 매니저만
create policy team_members_update on public.team_members
  for update to authenticated
  using (public.is_team_manager(team_id))
  with check (public.is_team_manager(team_id));

-- 탈퇴(본인) 또는 강제 탈퇴/신청 거절(매니저)
create policy team_members_delete on public.team_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_team_manager(team_id));

-- ── 수아자FC 백필 ────────────────────────────────────────────
-- 고정 UUID — Phase 2 에서 기존 데이터(matches/posts/...)의 team_id 백필에 재사용.
insert into public.teams (id, name, slug, emblem_url)
values (
  '00000000-0000-4000-8000-000000000001'::uuid,
  '수아자FC',
  'suaza-fc',
  '/suaza-emblem.png'
)
on conflict (id) do nothing;

-- 기존 회원 전원(탈퇴 제외)을 수아자FC 정식 멤버로 — 현재 role/title 그대로 복사.
insert into public.team_members (team_id, user_id, role, title, status, joined_at)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  p.id,
  coalesce(p.role::text, 'player'),
  coalesce(p.title, 'player'),
  'active',
  coalesce(p.joined_at, now())
from public.profiles p
where p.deleted_at is null
on conflict (team_id, user_id) do nothing;

notify pgrst, 'reload schema';
