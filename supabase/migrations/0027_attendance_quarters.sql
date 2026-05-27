-- ============================================================
-- 0027: 출석 투표에 "참석 가능한 쿼터 수" 추가
--
-- A) matches.total_quarters: 경기당 총 쿼터 수 (기본 4, 향후 경기 등록 폼에서 설정 예정)
-- B) match_attendances.quarters_attending:
--    - NULL  → '전체 쿼터' (참석자 기본값). matches.total_quarters 가 바뀌어도 항상 전체로 해석.
--    - 1..N  → 'N쿼터까지 참석'
--    - 참석(attending) 이외 상태에서는 의미 없음 (서버에서 NULL 로 정리)
-- ============================================================

alter table public.matches
  add column if not exists total_quarters int not null default 4
    check (total_quarters between 1 and 6);

alter table public.match_attendances
  add column if not exists quarters_attending int
    check (quarters_attending is null or quarters_attending between 1 and 6);

-- 참석이 아닐 때는 quarters_attending = NULL 유지
create or replace function public.enforce_attendance_quarters()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'attending' then
    new.quarters_attending := null;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_attendance_quarters_trg on public.match_attendances;
create trigger enforce_attendance_quarters_trg
  before insert or update on public.match_attendances
  for each row execute function public.enforce_attendance_quarters();

notify pgrst, 'reload schema';
