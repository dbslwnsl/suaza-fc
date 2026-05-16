-- ============================================================
-- 0013: 경기 상태에 'in_progress' (진행중) 추가
--
-- 흐름: scheduled → in_progress → done
-- - 진행중 = 기록 입력 가능, 출석 투표 변경 불가
-- - 예정 = 기록 입력 불가, 출석 투표 가능
-- - 시작 판정: status='in_progress' or 'done' 이거나,
--   status='scheduled' 인데 현재 시각이 match_date 를 지난 경우
--   (앱 코드에서 처리)
-- ============================================================

alter type public.match_status add value if not exists 'in_progress' before 'done';
