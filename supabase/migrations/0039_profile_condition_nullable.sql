-- ============================================================
-- 0039: profiles.condition 을 nullable / default NULL 로 변경
--
-- 변경 의도:
--   - 기존: NOT NULL, DEFAULT 3 (생성 시 무조건 "보통") → 사용자가 명시적으로
--     컨디션을 설정한 적 없어도 항상 초록(3) 아이콘이 표시됨.
--   - 신규: NULL 허용, DEFAULT NULL (= "랜덤/미설정") → UI 에선 "?" 아이콘 표시.
--   - 사용자가 컨디션 칩을 처음 누르면 그때 1~5 값으로 저장된다.
--
-- 기존 데이터(condition=3 인 행)는 그대로 둔다 — "정말 3을 선택한 사용자" 와
-- "기본값으로 남아 있던 사용자" 를 구분할 수 없기 때문. 사용자가 한 번이라도
-- 칩을 누르면 값이 재저장되며 자연스럽게 의도된 상태로 정착한다.
-- ============================================================

alter table public.profiles
  alter column condition drop default;

alter table public.profiles
  alter column condition drop not null;

notify pgrst, 'reload schema';
