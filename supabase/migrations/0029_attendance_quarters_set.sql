-- 참석 쿼터를 "누적 정수(N쿼터까지)"에서 "참여 쿼터 집합"으로 변경.
-- attending_quarters: integer[] — 참여하는 쿼터 번호 목록(1-indexed).
--   NULL → 전체 쿼터 참여(기본값). 비-NULL → 해당 쿼터만 참여.
-- 기존 quarters_attending(int) 컬럼은 더 이상 사용하지 않음(보존).

alter table public.match_attendances
  add column if not exists attending_quarters integer[];

-- 참석이 아닐 때는 두 컬럼 모두 NULL 로 정리
create or replace function public.enforce_attendance_quarters()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'attending' then
    new.quarters_attending := null;
    new.attending_quarters := null;
  end if;
  return new;
end;
$$;

-- 트리거는 0027 에서 생성됨(같은 함수명). 함수만 갱신하면 적용됨.

notify pgrst, 'reload schema';
