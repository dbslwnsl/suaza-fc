-- ============================================================
-- 더미 회원 12명 생성 (개발/테스트용)
--
-- - auth.users 에 가짜 행을 직접 만들고 트리거가 profiles 를 생성하도록 함
-- - email 도메인을 @suaza.local 로 통일하여 한꺼번에 삭제 가능
-- - 비밀번호 컬럼을 비워두므로 실제 로그인은 불가 (명단/기록용)
-- ============================================================

do $$
declare
  m record;
  uid uuid;
begin
  for m in
    select * from (values
      ('한도윤',  'han.doyoon',    1,  'player', array['GK']),
      ('정태완',  'jung.taewan',   2,  'player', array['DF']),
      ('조현우',  'jo.hyunwoo',    3,  'player', array['DF']),
      ('최성호',  'choi.sungho',   4,  'player', array['DF']),
      ('강민철',  'kang.mincheol', 6,  'player', array['DF','MF']),
      ('김민수',  'kim.minsu',     7,  'player', array['MF','FW']),
      ('이준영',  'lee.junyoung',  8,  'player', array['MF']),
      ('김재현',  'kim.jaehyun',   9,  'player', array['FW']),
      ('박지훈',  'park.jihun',    10, 'player', array['MF']),
      ('윤성민',  'yoon.sungmin',  11, 'player', array['MF','FW']),
      ('신동혁',  'shin.donghyuk', 14, 'player', array['MF']),
      ('임수빈',  'lim.subin',     null, 'coach', array[]::text[])
    ) as t(full_name, email_local, jersey, member_role, positions)
  loop
    uid := gen_random_uuid();

    insert into auth.users (
      id, instance_id, aud, role, email,
      email_confirmed_at, raw_user_meta_data,
      created_at, updated_at
    )
    values (
      uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      m.email_local || '@suaza.local',
      now(),
      jsonb_build_object('name', m.full_name),
      now(),
      now()
    );

    -- handle_new_user 트리거가 profiles 행을 만들어 두었으므로 추가 정보만 업데이트
    update public.profiles
    set jersey_number = m.jersey,
        positions     = m.positions,
        role          = m.member_role::public.user_role
    where id = uid;
  end loop;
end $$;

-- 결과 확인
select role, name, jersey_number, positions
from public.profiles
order by role, jersey_number nulls last;
