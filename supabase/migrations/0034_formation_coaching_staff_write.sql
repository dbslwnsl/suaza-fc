-- 직책(title) 기반 코칭스태프(회장·감독·코치)도 포메이션을 저장할 수 있도록 RLS 허용.
-- 기존 is_staff() 는 권한(role) 기준이라, 직책만 코치/감독이고 role=player 인 사람은 막혔다.
-- 팀별 범위 제한(코치·주장 = 본인 팀만)은 서버 액션 saveFormation 의 merge 가 강제한다.
-- 전체 삭제(delete)는 감독/회장 정책(formations_write_staff)만 허용하므로 여기선 insert/update 만.

create or replace function public.is_coaching_staff()
  returns boolean
  language sql stable security definer set search_path = public
as $$
  select coalesce(
    (
      select role in ('manager', 'coach')
          or title in ('president', 'head_coach', 'coach')
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$$;

create policy formations_insert_coaching_staff on public.formations
  for insert to authenticated
  with check (public.is_coaching_staff());

create policy formations_update_coaching_staff on public.formations
  for update to authenticated
  using (public.is_coaching_staff())
  with check (public.is_coaching_staff());
