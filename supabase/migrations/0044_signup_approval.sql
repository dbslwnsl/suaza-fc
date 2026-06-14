-- ============================================================
-- 0044: 신규 가입자 승인 흐름 (임시 기능: 팀 오픈 시점 1회성).
-- 회장이 승인 전까지 앱 사용 차단. 옛 기록(이름 동일 soft-deleted 프로필) 머지 옵션 포함.
-- 기능 일몰 시: approved_at 컬럼 제거 + 함수 drop 만 하면 됨.
-- ============================================================

-- 1) approved_at: NULL 이면 가입 대기.
-- 컬럼이 새로 만들어진 경우(=최초 적용)에만 기존 프로필을 joined_at 으로 backfill.
-- 재실행해도 새 가입자(approved_at=NULL)가 잘못 승인되지 않도록 분리.
do $$
declare
  v_col_exists boolean;
begin
  select exists(
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'profiles'
      and column_name  = 'approved_at'
  ) into v_col_exists;

  if not v_col_exists then
    alter table public.profiles add column approved_at timestamptz;
    update public.profiles
      set approved_at = coalesce(joined_at, now());
  end if;
end $$;

comment on column public.profiles.approved_at is
  '회장 승인 시각. NULL 이면 가입 대기(앱 사용 차단). 기능 일몰 시 제거.';

-- 2) 가입 직후 회장 전원에게 알림 발송 (RLS 우회).
create or replace function public.notify_signup_pending(
  p_new_user_id uuid,
  p_new_user_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, url)
  select p.id,
         'signup_pending',
         '신규 가입 승인 대기',
         coalesce(p_new_user_name, '회원') || ' 님이 가입을 요청했습니다.',
         '/admin/signups'
  from public.profiles p
  where p.title = 'president'
    and p.deleted_at is null
    and p.approved_at is not null;
end;
$$;

grant execute on function public.notify_signup_pending(uuid, text) to authenticated;

-- 3) 승인 (+ 옵션: 옛 프로필 머지) 함수. 회장만 호출 가능.
create or replace function public.approve_and_merge_profile(
  p_new_id uuid,
  p_old_id uuid    -- NULL 이면 머지 없이 승인만
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approver uuid := auth.uid();
  v_approver_title text;
begin
  -- 권한: 회장만
  select title into v_approver_title
  from public.profiles
  where id = v_approver
    and deleted_at is null;
  if v_approver_title is null or v_approver_title <> 'president' then
    raise exception '회장만 승인할 수 있습니다';
  end if;

  if p_new_id is null then
    raise exception 'p_new_id 가 비어있습니다';
  end if;

  -- 옛 프로필 머지: 모든 FK 를 새 id 로 옮긴 뒤 옛 프로필 삭제.
  -- 신규 가입자는 승인 전 앱 사용 차단이므로 자체 FK row 가 없어 충돌 없음.
  -- 각 테이블은 존재 시에만 update (스키마 차이로 인한 실패 회피).
  if p_old_id is not null and p_old_id <> p_new_id then
    if to_regclass('public.match_attendances') is not null then
      update public.match_attendances    set player_id = p_new_id where player_id = p_old_id;
    end if;
    if to_regclass('public.match_participations') is not null then
      update public.match_participations set player_id = p_new_id where player_id = p_old_id;
    end if;
    if to_regclass('public.matches') is not null then
      update public.matches set team_a_captain = p_new_id where team_a_captain = p_old_id;
      update public.matches set team_b_captain = p_new_id where team_b_captain = p_old_id;
      update public.matches set created_by     = p_new_id where created_by     = p_old_id;
    end if;
    if to_regclass('public.formations') is not null then
      update public.formations           set created_by  = p_new_id where created_by  = p_old_id;
    end if;
    if to_regclass('public.posts') is not null then
      update public.posts                set author_id   = p_new_id where author_id   = p_old_id;
    end if;
    if to_regclass('public.post_comments') is not null then
      update public.post_comments        set author_id   = p_new_id where author_id   = p_old_id;
    end if;
    if to_regclass('public.match_comments') is not null then
      update public.match_comments       set author_id   = p_new_id where author_id   = p_old_id;
    end if;
    if to_regclass('public.coach_comments') is not null then
      update public.coach_comments       set member_id   = p_new_id where member_id   = p_old_id;
      update public.coach_comments       set author_id   = p_new_id where author_id   = p_old_id;
    end if;
    if to_regclass('public.notifications') is not null then
      update public.notifications        set user_id     = p_new_id where user_id     = p_old_id;
    end if;
    if to_regclass('public.push_subscriptions') is not null then
      update public.push_subscriptions   set user_id     = p_new_id where user_id     = p_old_id;
    end if;
    if to_regclass('public.post_images') is not null then
      update public.post_images          set uploader_id = p_new_id where uploader_id = p_old_id;
    end if;

    -- 옛 프로필 삭제 (남은 FK 가 있으면 CASCADE 로 정리)
    delete from public.profiles where id = p_old_id;
  end if;

  -- 새 프로필 승인 확정
  update public.profiles
    set approved_at = now()
    where id = p_new_id;
end;
$$;

grant execute on function public.approve_and_merge_profile(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
