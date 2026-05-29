-- 자체전 팀 주장이 자기 경기 포메이션을 저장할 수 있도록 RLS 허용.
-- (팀별 범위 제한 = "자기 팀 슬롯만" 은 서버 액션 saveFormation 의 merge 로 강제.
--  RLS 는 "이 경기 주장인가" 만 검사한다. 전체 삭제는 감독/회장만 가능하므로 delete 는 제외.)

create or replace function public.is_match_captain(p_match_id uuid)
  returns boolean
  language sql stable security definer set search_path = public
as $$
  select coalesce(
    (
      select team_a_captain = auth.uid() or team_b_captain = auth.uid()
      from public.matches
      where id = p_match_id
    ),
    false
  );
$$;

-- 기존 staff 전용 쓰기 정책(formations_write_staff)과 함께 OR 로 동작.
create policy formations_insert_captain on public.formations
  for insert to authenticated
  with check (public.is_match_captain(match_id));

create policy formations_update_captain on public.formations
  for update to authenticated
  using (public.is_match_captain(match_id))
  with check (public.is_match_captain(match_id));
