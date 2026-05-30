-- 자체전 종료 시 승리팀 표기 (회장·감독이 토글).
--   NULL = 무승부(기본), 'A' = A팀 승, 'B' = B팀 승.
-- 자체전 한정. 상대전은 matches.our_score / opponent_score 로 판정.

alter table public.matches
  add column if not exists intra_winner text;

alter table public.matches
  drop constraint if exists matches_intra_winner_check;

alter table public.matches
  add constraint matches_intra_winner_check
  check (intra_winner is null or intra_winner in ('A', 'B'));
