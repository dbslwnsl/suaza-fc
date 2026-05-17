-- ============================================================
-- 0008: 매치 status 수동 변경 우선
--
-- 문제: 0007 의 auto_progress_match 가 페이지 진입 시마다 호출되어
--       매니저가 in_progress → scheduled 로 되돌려도 즉시 다시 in_progress 로 복귀.
--
-- 해결: status_overridden_at 컬럼을 추가하여 매니저가 status 를 명시적으로 변경한
--       시점을 기록. RPC 는 그 시점이 match_date 이후이면 자동 진행을 skip.
-- ============================================================

alter table public.matches
  add column if not exists status_overridden_at timestamptz;

create or replace function public.auto_progress_match(p_match_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.matches
  set status = 'in_progress', updated_at = now()
  where id = p_match_id
    and status = 'scheduled'
    and match_date <= now()
    -- 매니저가 시작 시각 이후에 명시적으로 status 를 변경한 흔적이 있으면 자동 진행 skip
    and (status_overridden_at is null or status_overridden_at < match_date);
$$;
