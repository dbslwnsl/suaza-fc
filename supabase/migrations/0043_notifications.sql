-- ============================================================
-- 인앱 알림(새소식) 수신함
-- 푸시(OS 알림)와 별개로, 회원이 앱 안에서 받은 알림 목록을 볼 수 있도록
-- 수신자별로 알림을 기록한다. 발송은 서비스 롤(admin)이 RLS 우회로 insert.
-- 회원은 자기 알림만 조회/읽음처리/삭제 가능.
-- ============================================================

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- 알림 종류: new_post | notice | comment | match_schedule | team_change ...
  type        text not null,
  title       text not null,
  body        text,
  -- 클릭 시 이동할 앱 내 경로
  url         text,
  created_at  timestamptz not null default now(),
  -- 읽은 시각 (NULL = 안읽음)
  read_at     timestamptz
);

-- 목록 조회(최신순) + 안읽음 카운트용 인덱스
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.notifications enable row level security;

create policy notif_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

-- 읽음 처리(update)는 본인 것만
create policy notif_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notif_delete_own on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

notify pgrst, 'reload schema';
