-- 자체전 등에서 임시로 추가되는 용병 명단 (1회성, 경기에 종속)
create table public.match_mercenaries (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  name        text not null,
  team        text check (team in ('A', 'B')),
  created_at  timestamptz not null default now()
);
create index match_mercenaries_match_idx on public.match_mercenaries (match_id);

alter table public.match_mercenaries enable row level security;

-- 인증된 모든 사용자 조회 가능 (회원과 동일한 가시성)
create policy "match_mercenaries_select" on public.match_mercenaries
  for select to authenticated using (true);

-- 쓰기 권한: 매니저/코치(role) 또는 회장/감독(title) 또는 해당 경기의 주장
create policy "match_mercenaries_write" on public.match_mercenaries
  for all to authenticated using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('manager', 'coach') or p.title in ('president', 'head_coach'))
    )
    or exists (
      select 1 from public.matches m
      where m.id = match_mercenaries.match_id
        and (m.team_a_captain = auth.uid() or m.team_b_captain = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('manager', 'coach') or p.title in ('president', 'head_coach'))
    )
    or exists (
      select 1 from public.matches m
      where m.id = match_mercenaries.match_id
        and (m.team_a_captain = auth.uid() or m.team_b_captain = auth.uid())
    )
  );
