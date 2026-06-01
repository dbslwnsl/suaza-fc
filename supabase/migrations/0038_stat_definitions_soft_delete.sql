-- 기록 항목 소프트 삭제 컬럼.
-- 실제 row 와 누적된 custom_stats 값은 보존하면서, hidden_at IS NOT NULL 인 항목은
-- 화면(시즌 통계·기록 입력·항목 목록 등)에서 숨긴다.
-- 해제하려면 hidden_at = NULL 로 되돌리면 됨.

alter table public.stat_definitions
  add column if not exists hidden_at timestamptz;
