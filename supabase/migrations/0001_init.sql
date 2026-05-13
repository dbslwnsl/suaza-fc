-- ============================================================
-- SUAZA FC 초기 스키마
-- ============================================================

-- ------------------------------------------------------------
-- 1. ENUM 타입
-- ------------------------------------------------------------
create type public.user_role as enum ('manager', 'coach', 'player');
create type public.match_status as enum ('scheduled', 'done', 'canceled');

-- ------------------------------------------------------------
-- 2. profiles : auth.users 확장
-- ------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  name         text not null,
  nickname     text,
  role         public.user_role not null default 'player',
  positions    text[] not null default '{}',
  jersey_number int,
  birth_date   date,
  avatar_url   text,
  joined_at    timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 가입 시 자동으로 profiles 행 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 셀프 업데이트 시 role 변경 차단 (manager 만 허용)
-- SQL Editor / service_role 컨텍스트에서는 auth.uid() 가 NULL 이므로 통과
create or replace function public.enforce_profile_role_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  my_role public.user_role;
  caller_uid uuid := auth.uid();
begin
  -- 서버측(service_role, SQL Editor, 마이그레이션) 호출은 그대로 통과
  if caller_uid is null then
    return new;
  end if;

  if old.role is distinct from new.role then
    select role into my_role from public.profiles where id = caller_uid;
    if coalesce(my_role, 'player') <> 'manager' then
      raise exception 'Only managers can change a user role';
    end if;
  end if;

  return new;
end;
$$;

create trigger enforce_profile_role_change_trg
  before update on public.profiles
  for each row execute function public.enforce_profile_role_change();

-- ------------------------------------------------------------
-- 3. matches : 경기 일정/결과
-- ------------------------------------------------------------
create table public.matches (
  id              uuid primary key default gen_random_uuid(),
  opponent        text not null,
  match_date      timestamptz not null,
  location        text,
  our_score       int,
  opponent_score  int,
  status          public.match_status not null default 'scheduled',
  notes           text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index matches_match_date_idx on public.matches (match_date desc);

-- ------------------------------------------------------------
-- 4. match_participations : 선수별 경기 기록
-- ------------------------------------------------------------
create table public.match_participations (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references public.matches(id) on delete cascade,
  player_id       uuid not null references public.profiles(id) on delete cascade,
  goals           int not null default 0,
  assists         int not null default 0,
  yellow_cards    int not null default 0,
  red_cards       int not null default 0,
  minutes_played  int,
  created_at      timestamptz not null default now(),
  unique (match_id, player_id)
);

create index mp_match_idx  on public.match_participations (match_id);
create index mp_player_idx on public.match_participations (player_id);

-- ------------------------------------------------------------
-- 5. formations : 경기별 1개
-- ------------------------------------------------------------
create table public.formations (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null unique references public.matches(id) on delete cascade,
  shape       text not null,                              -- 예: '4-3-3'
  positions   jsonb not null default '[]'::jsonb,         -- [{player_id, x, y, role}, ...]
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 6. posts : 게시판
-- ------------------------------------------------------------
create table public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index posts_created_idx on public.posts (created_at desc);

-- ------------------------------------------------------------
-- 7. photos : 사진 갤러리 (Storage 연동)
-- ------------------------------------------------------------
create table public.photos (
  id            uuid primary key default gen_random_uuid(),
  uploader_id   uuid not null references public.profiles(id) on delete cascade,
  storage_path  text not null,
  caption       text,
  match_id      uuid references public.matches(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index photos_created_idx on public.photos (created_at desc);

-- ============================================================
-- 권한 헬퍼 함수
-- ============================================================
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('manager','coach') from public.profiles where id = auth.uid()),
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

-- ============================================================
-- RLS 정책
-- ============================================================

-- profiles -----------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_by_manager on public.profiles
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- matches -----------------------------------------------------
alter table public.matches enable row level security;

create policy matches_select_authenticated on public.matches
  for select to authenticated using (true);

create policy matches_write_staff on public.matches
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- match_participations ---------------------------------------
alter table public.match_participations enable row level security;

create policy mp_select_authenticated on public.match_participations
  for select to authenticated using (true);

create policy mp_write_staff on public.match_participations
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- formations -------------------------------------------------
alter table public.formations enable row level security;

create policy formations_select_authenticated on public.formations
  for select to authenticated using (true);

create policy formations_write_staff on public.formations
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- posts ------------------------------------------------------
alter table public.posts enable row level security;

create policy posts_select_authenticated on public.posts
  for select to authenticated using (true);

create policy posts_insert_self on public.posts
  for insert to authenticated
  with check (author_id = auth.uid());

create policy posts_update_self_or_manager on public.posts
  for update to authenticated
  using (author_id = auth.uid() or public.is_manager())
  with check (author_id = auth.uid() or public.is_manager());

create policy posts_delete_self_or_manager on public.posts
  for delete to authenticated
  using (author_id = auth.uid() or public.is_manager());

-- photos -----------------------------------------------------
alter table public.photos enable row level security;

create policy photos_select_authenticated on public.photos
  for select to authenticated using (true);

create policy photos_insert_self on public.photos
  for insert to authenticated
  with check (uploader_id = auth.uid());

create policy photos_update_self_or_manager on public.photos
  for update to authenticated
  using (uploader_id = auth.uid() or public.is_manager())
  with check (uploader_id = auth.uid() or public.is_manager());

create policy photos_delete_self_or_manager on public.photos
  for delete to authenticated
  using (uploader_id = auth.uid() or public.is_manager());

-- ============================================================
-- 첫 manager 지정 안내
--   회원가입 후 Supabase SQL Editor 에서 1회 실행:
--   update public.profiles set role = 'manager' where id = '<auth user id>';
-- ============================================================
