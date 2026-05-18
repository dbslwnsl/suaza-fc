-- ============================================================
-- 0011: 경기 시간(duration_hours) 컬럼 + RPC 동적화
--
-- - matches.duration_hours smallint NOT NULL DEFAULT 2 (1~4)
-- - auto_progress_match: 종료 시각을 고정 2시간이 아닌
--   match_date + duration_hours * interval '1 hour' 로 계산
-- - 기존 row 는 DEFAULT 2 로 자동 채움
-- ============================================================

alter table public.matches
  add column if not exists duration_hours smallint not null default 2;

alter table public.matches
  drop constraint if exists matches_duration_hours_check;

alter table public.matches
  add constraint matches_duration_hours_check
    check (duration_hours between 1 and 4);

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
  m_duration smallint;
  finish_time timestamptz;
begin
  select match_date, status, status_overridden_at, duration_hours
    into m_date, m_status, m_override, m_duration
  from public.matches
  where id = p_match_id;

  if m_date is null then return; end if;
  if m_status = 'canceled' or m_status = 'done' then return; end if;

  finish_time := m_date + (coalesce(m_duration, 2) * interval '1 hour');

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
