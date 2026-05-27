-- 경기 쿼터 수 한도 확장(1..6 → 1..8) + 쿼터별 활동(준비운동/훈련/자체전/상대전) 컬럼 추가.
-- duration_hours: 1→2쿼터, 2→4쿼터, 3→6쿼터, 4→8쿼터 까지 허용.

alter table public.matches
  drop constraint if exists matches_total_quarters_check;

alter table public.matches
  add constraint matches_total_quarters_check
  check (total_quarters between 1 and 8);

-- 각 쿼터의 활동 라벨(영문 키 배열). 예: ["warmup","training","intra","inter"]
-- 길이는 total_quarters 와 일치(또는 짧으면 미설정으로 간주). 값은 다음 중 하나여야 함.
alter table public.matches
  add column if not exists quarter_actions jsonb not null default '[]'::jsonb;
