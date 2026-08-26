-- ============================================================
-- 푸시 구독을 플랫폼 중립 구조로 확장
--
-- 배경: 0042 는 브라우저 Web Push(VAPID) 전용이었다. 네이티브 앱(iOS/Android)은
-- APNs/FCM 을 쓰므로 저장 형태가 다르다. 테이블을 하나로 유지하되 platform 으로
-- 구분한다. 발송은 Expo Push Service 가 APNs/FCM 분배를 대신하므로 서버는
-- 플랫폼별 분기를 두 갈래(web / native)만 갖는다.
--
--   platform='web'              → endpoint + p256dh + auth  (web-push)
--   platform in ('ios','android') → expo_push_token         (Expo Push API)
--
-- iOS 를 나중에 추가해도 이 스키마와 서버 발송 코드는 바뀌지 않는다.
-- ============================================================

alter table public.push_subscriptions
  add column if not exists platform text not null default 'web',
  add column if not exists expo_push_token text,
  -- 기기 식별용 라벨 (예: "SM-S911N", "iPhone 15 Pro"). 설정 화면에서 기기 구분에 쓴다.
  add column if not exists device_name text;

-- 기존 행은 전부 웹 구독이다. default 'web' 으로 이미 채워졌지만 명시적으로 확인.
update public.push_subscriptions set platform = 'web' where platform is null;

-- 네이티브 행에는 endpoint/p256dh/auth 가 없다.
alter table public.push_subscriptions alter column endpoint drop not null;
alter table public.push_subscriptions alter column p256dh   drop not null;
alter table public.push_subscriptions alter column auth     drop not null;

-- 허용 플랫폼
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_platform_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_platform_check
  check (platform in ('web', 'ios', 'android'));

-- 플랫폼별로 필요한 컬럼이 채워졌는지 강제한다.
-- 반쪽짜리 행(웹인데 키가 없다거나, 네이티브인데 토큰이 없다거나)이 들어오면
-- 발송 시점에 조용히 실패하므로 DB 에서 막는다.
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_shape_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_shape_check
  check (
    (
      platform = 'web'
      and endpoint is not null
      and p256dh is not null
      and auth is not null
      and expo_push_token is null
    )
    or (
      platform in ('ios', 'android')
      and expo_push_token is not null
      and endpoint is null
      and p256dh is null
      and auth is null
    )
  );

-- 같은 기기에서 다시 등록하면 갱신되도록 고유 제약.
-- Postgres 는 unique 제약에서 NULL 을 서로 다른 값으로 취급하므로
-- 웹 행(expo_push_token is null)이 여러 개 있어도 충돌하지 않는다.
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_expo_push_token_key;
alter table public.push_subscriptions
  add constraint push_subscriptions_expo_push_token_key unique (expo_push_token);

create index if not exists push_subscriptions_platform_idx
  on public.push_subscriptions (platform);

notify pgrst, 'reload schema';
