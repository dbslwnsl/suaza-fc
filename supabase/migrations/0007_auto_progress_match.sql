-- ============================================================
-- 0007: 예정 시각 경과 시 매치 자동 진행중 처리
--
-- - matches/[id] 페이지 진입 시 호출되는 RPC
-- - SECURITY DEFINER 로 RLS 우회 (일반 회원이 페이지를 봐도 동기화됨)
-- - 조건: status='scheduled' AND match_date <= now()
-- ============================================================

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
    and match_date <= now();
$$;

grant execute on function public.auto_progress_match(uuid) to authenticated, anon;
