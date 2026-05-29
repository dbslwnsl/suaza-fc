-- 회원 부상 상태 플래그. 기본 false.
-- 각 계정이 본인 프로필 수정에서 토글. 명단/포메이션 등에서 부상 표기에 사용.

alter table public.profiles
  add column if not exists is_injured boolean not null default false;
