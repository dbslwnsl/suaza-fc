-- ============================================================
-- 0003: 출석 투표 + 공지 게시글
--
-- A) match_attendances: 경기 출석 의사 (참석/불참/미정)
-- B) posts.is_notice: 공지 플래그 (manager 만 토글 가능, 트리거로 강제)
-- ============================================================

-- ---------- A. 출석 투표 ----------
create type public.attendance_status as enum ('attending', 'absent', 'undecided');

create table public.match_attendances (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  player_id   uuid not null references public.profiles(id) on delete cascade,
  status      public.attendance_status not null default 'undecided',
  updated_at  timestamptz not null default now(),
  unique (match_id, player_id)
);

create index match_attendances_match_idx  on public.match_attendances (match_id);
create index match_attendances_player_idx on public.match_attendances (player_id);

alter table public.match_attendances enable row level security;

create policy ma_select_authenticated on public.match_attendances
  for select to authenticated using (true);

create policy ma_insert_self on public.match_attendances
  for insert to authenticated
  with check (player_id = auth.uid());

create policy ma_update_self on public.match_attendances
  for update to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

create policy ma_delete_self on public.match_attendances
  for delete to authenticated
  using (player_id = auth.uid());

create policy ma_write_staff on public.match_attendances
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- B. 공지 플래그 ----------
alter table public.posts
  add column if not exists is_notice boolean not null default false;

create index if not exists posts_is_notice_idx
  on public.posts (is_notice, created_at desc);

create or replace function public.enforce_post_notice()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  caller_uid uuid := auth.uid();
  my_role public.user_role;
begin
  if caller_uid is null then return new; end if; -- 서버 컨텍스트 통과

  if tg_op = 'INSERT' then
    if new.is_notice then
      select role into my_role from public.profiles where id = caller_uid;
      if coalesce(my_role, 'player') <> 'manager' then
        raise exception 'Only managers can create notices';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.is_notice is distinct from new.is_notice then
      select role into my_role from public.profiles where id = caller_uid;
      if coalesce(my_role, 'player') <> 'manager' then
        raise exception 'Only managers can change notice flag';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_post_notice_trg on public.posts;
create trigger enforce_post_notice_trg
  before insert or update on public.posts
  for each row execute function public.enforce_post_notice();
