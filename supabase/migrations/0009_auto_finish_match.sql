-- ============================================================
-- 0009: 경기 종료 시각 자동 done 처리 (기본 경기시간 2시간)
--
-- - 종료 시각 = match_date + 2 hours
-- - 종료 시각 이후 → status='done' 으로 강제 (status_overridden_at 무시)
-- - 시작 ~ 종료 사이 → status='in_progress' (0008 의 override 우선은 그대로)
-- - 이미 done / canceled 면 그대로 둠
-- ============================================================

create or replace function public.auto_progress_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m_date timestamptz;
  m_status public.match_status;
  m_override timestamptz;
  finish_time timestamptz;
begin
  select match_date, status, status_overridden_at
    into m_date, m_status, m_override
  from public.matches
  where id = p_match_id;

  if m_date is null then return; end if;
  if m_status = 'canceled' or m_status = 'done' then return; end if;

  finish_time := m_date + interval '2 hours';

  -- 종료 시각 이후: 무조건 done (수동 override 무시)
  if now() >= finish_time then
    update public.matches
       set status = 'done', updated_at = now()
     where id = p_match_id;
    return;
  end if;

  -- 시작 ~ 종료 사이: scheduled 였다면 in_progress 로 진행
  -- 단, 매니저가 시작 시각 이후 수동 변경했으면 skip
  if now() >= m_date
     and m_status = 'scheduled'
     and (m_override is null or m_override < m_date)
  then
    update public.matches
       set status = 'in_progress', updated_at = now()
     where id = p_match_id;
  end if;
end;
$$;
