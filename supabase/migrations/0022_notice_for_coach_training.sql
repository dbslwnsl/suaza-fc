-- ============================================================
-- 0022: 홈 노출(is_notice) 권한 확장
--
-- 기존: manager 만 is_notice 토글 가능 (0003 트리거)
-- 변경: 감독(head_coach)·코치(coach) 직책은 '훈련(tactics)' 카테고리
--       글에 한해 홈 노출(is_notice) 설정 가능.
-- ============================================================

create or replace function public.enforce_post_notice()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  caller_uid uuid := auth.uid();
  my_role public.user_role;
  my_title public.member_title;
  allowed boolean;
begin
  if caller_uid is null then return new; end if; -- 서버 컨텍스트 통과

  -- is_notice 가 새로 켜지거나(INSERT) 값이 바뀌는(UPDATE) 경우에만 권한 검사
  if (tg_op = 'INSERT' and new.is_notice)
     or (tg_op = 'UPDATE' and old.is_notice is distinct from new.is_notice) then
    select role, title into my_role, my_title
      from public.profiles
      where id = caller_uid;

    allowed :=
      coalesce(my_role, 'player') = 'manager'
      or (
        my_title in ('head_coach', 'coach')
        and new.category = 'tactics'
      );

    if not allowed then
      raise exception 'Only managers (or coaches on training posts) can change notice flag';
    end if;
  end if;

  return new;
end;
$$;

-- 트리거 정의는 0003 과 동일하므로 함수만 교체하면 됨.
-- (안전하게 재생성)
drop trigger if exists enforce_post_notice_trg on public.posts;
create trigger enforce_post_notice_trg
  before insert or update on public.posts
  for each row execute function public.enforce_post_notice();
