-- ============================================================
-- 웹 푸시(Web Push) 구독 정보
-- 브라우저가 PushManager.subscribe() 로 만든 구독(endpoint + 키)을 회원별로 저장한다.
-- 서버(서비스 롤)에서 web-push 로 해당 endpoint 에 발송.
-- 한 회원이 여러 기기/브라우저를 가질 수 있으므로 endpoint 가 고유 키(user_id 는 중복 허용).
-- ============================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- 본인 구독만 조회/생성/수정/삭제 가능.
-- 발송은 서비스 롤(admin) 클라이언트가 RLS 를 우회해서 수행한다.
create policy push_sub_select_own on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

create policy push_sub_insert_own on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy push_sub_update_own on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy push_sub_delete_own on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

notify pgrst, 'reload schema';
