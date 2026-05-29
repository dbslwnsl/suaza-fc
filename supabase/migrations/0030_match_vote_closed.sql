-- 출석 투표 수동 종료 시각. NULL = 진행 중. 값이 있으면 마감 시각과 무관하게 종료.
-- 회장/감독이 '투표 종료' 버튼으로 설정/해제.

alter table public.matches
  add column if not exists vote_closed_at timestamptz;
