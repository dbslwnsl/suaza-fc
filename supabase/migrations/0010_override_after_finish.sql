-- ============================================================
-- 0010: 종료 시각 이후에도 매니저 수동 변경 우선
--
-- 0009 까지: 종료 시각 후엔 무조건 done (override 무시)
-- 변경: 매니저가 종료 시각 이후에 명시적으로 status 를 바꾼 흔적이 있으면
--       RPC 는 그 결정을 존중. (즉 status_overridden_at >= finish_time 이면 skip)
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

  -- 종료 시각 이후: 자동 done, 단 매니저가 종료 이후 수동 변경했으면 skip
  if now() >= finish_time then
    if m_override is null or m_override < finish_time then
      update public.matches
         set status = 'done', updated_at = now()
       where id = p_match_id;
    end if;
    return;
  end if;

  -- 시작 ~ 종료 사이: scheduled 였다면 in_progress
  -- 매니저가 시작 시각 이후 수동 변경했으면 skip
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
