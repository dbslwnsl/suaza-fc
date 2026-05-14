-- ============================================================
-- 더미 경기 데이터 9개 (개발/테스트용)
--
-- - 예정 3 / 종료 5 (승2·패2·무1) / 취소 1
-- - created_by 는 가장 먼저 등록된 manager 로 자동 설정
-- - 일괄 삭제는 dummy_matches_cleanup.sql 실행
-- ============================================================

do $$
declare
  mgr uuid;
begin
  select id into mgr from public.profiles where role = 'manager' limit 1;
  if mgr is null then
    raise exception 'manager 가 없습니다. 먼저 profiles 의 role 을 manager 로 지정해 주세요.';
  end if;

  insert into public.matches
    (opponent, match_date, location, our_score, opponent_score, status, notes, created_by)
  values
    -- 예정된 경기 (3)
    ('잠실 FC',         '2026-05-21 14:00+09'::timestamptz, '수원종합운동장',      null, null, 'scheduled', '리그 4라운드',                            mgr),
    ('광교 유나이티드', '2026-05-28 10:00+09'::timestamptz, '광교호수공원 풋살장', null, null, 'scheduled', null,                                       mgr),
    ('FC 분당',         '2026-06-04 16:00+09'::timestamptz, '분당구민운동장',      null, null, 'scheduled', '컵 16강',                                  mgr),

    -- 종료된 경기 (5)
    ('AFC 안양',        '2026-05-07 15:00+09'::timestamptz, '안양 종합운동장',     3,    1,    'done',      '전반 2골 김민수, 후반 1골 김재현',         mgr),
    ('판교 워리어즈',   '2026-04-30 14:00+09'::timestamptz, '판교 풋볼파크',       1,    2,    'done',      '아쉬운 역전패',                            mgr),
    ('일산 베어즈',     '2026-04-23 13:00+09'::timestamptz, '일산 풋살파크',       2,    2,    'done',      '치열한 무승부',                            mgr),
    ('강남 FC',         '2026-04-16 16:00+09'::timestamptz, '강남 풋볼클럽',       4,    0,    'done',      '김민수 해트트릭 + 김재현 1골',             mgr),
    ('분당 펭귄즈',     '2026-04-09 14:00+09'::timestamptz, '분당구민운동장',      0,    1,    'done',      null,                                       mgr),

    -- 취소된 경기 (1)
    ('수원 시티즈',     '2026-04-02 15:00+09'::timestamptz, '수원종합운동장',      null, null, 'canceled',  '우천 취소',                                mgr);
end $$;

-- 결과 확인
select status, opponent, match_date, our_score, opponent_score
from public.matches
order by match_date desc;
