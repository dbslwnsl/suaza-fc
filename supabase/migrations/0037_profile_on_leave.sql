-- 회원 장기불참 플래그. 기본 false.
-- 부상(is_injured)과 별개로, 장기간 활동을 쉬는 상태를 표시.
-- 명단 카드 이름 옆 회색 — 배지 표시, 출석 투표에서도 자동 불참 처리.

alter table public.profiles
  add column if not exists on_leave boolean not null default false;
