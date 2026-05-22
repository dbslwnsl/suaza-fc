-- 게시글 카테고리 추가
-- 기존 is_notice(홈 노출 단일 공지)와는 별개로 글 분류용 카테고리.
-- 키: notice(공지) / free(자유게시판) / tactics(전술)
--     qna(질문) / suggestion(건의)

alter table public.posts
  add column if not exists category text not null default 'free';

alter table public.posts
  drop constraint if exists posts_category_check;

alter table public.posts
  add constraint posts_category_check
  check (category in (
    'notice', 'free', 'tactics', 'qna', 'suggestion'
  ));

-- 목록 카테고리 필터 성능용 인덱스
create index if not exists posts_category_idx on public.posts (category);
