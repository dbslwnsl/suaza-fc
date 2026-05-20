-- ============================================================
-- 0017: 종료/시작 시각 지난 경기 일괄 자동 진행
--
-- 단일 경기용 auto_progress_match 의 일괄 버전.
-- 페이지(홈/목록/상세) 로드 시 호출하여, 그 경기 페이지를 직접
-- 열지 않아도 시각이 지난 모든 경기를 자동 갱신한다.
--
-- 규칙 (0011 auto_progress_match 와 동일):
--  - 종료 시각(match_date + duration_hours) 이후 → done
--    단, 매니저가 종료 이후 수동 변경(status_overridden_at >= finish) 했으면 skip
--  - 시작 ~ 종료 사이 + scheduled → in_progress
--    단, 매니저가 시작 이후 수동 변경(status_overridden_at >= match_date) 했으면 skip
-- ============================================================

create or replace function public.auto_progress_due_matches()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) 종료 시각 이후: done (수동 override 존중)
  update public.matches m
     set status = 'done', updated_at = now()
   where m.status in ('scheduled', 'in_progress')
     and now() >= m.match_date + (coalesce(m.duration_hours, 2) * interval '1 hour')
     and (
       m.status_overridden_at is null
       or m.status_overridden_at
            < m.match_date + (coalesce(m.duration_hours, 2) * interval '1 hour')
     );

  -- 2) 시작 ~ 종료 사이: scheduled → in_progress (수동 override 존중)
  update public.matches m
     set status = 'in_progress', updated_at = now()
   where m.status = 'scheduled'
     and now() >= m.match_date
     and now() < m.match_date + (coalesce(m.duration_hours, 2) * interval '1 hour')
     and (
       m.status_overridden_at is null
       or m.status_overridden_at < m.match_date
     );
end;
$$;
