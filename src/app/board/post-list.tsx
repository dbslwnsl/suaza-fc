"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CATEGORY_LABEL,
  CATEGORY_BAR_COLOR,
  POST_CATEGORIES,
  categoryBadgeClass,
  formatPostDate,
  type PostCategory,
} from "@/lib/board/helpers";
import { fetchBoardPosts } from "@/lib/board/actions";
import { type Comment } from "./[id]/comment-section";
import { type Liker } from "./[id]/post-actions";

export type ListPost = {
  id: string;
  title: string;
  content: string;
  is_notice: boolean;
  category: PostCategory;
  created_at: string;
  author_id: string;
  author: { name: string; avatar_url: string | null } | null;
  comments: Comment[];
  likeCount: number;
  likedByMe: boolean;
  likers: Liker[];
};

type Filter = "ALL" | PostCategory;

// 다음 페이지를 이어 붙일 때 중복 글(그 사이 새 글이 밀어낸 경우) 제거
function appendUnique(prev: ListPost[], next: ListPost[]): ListPost[] {
  const seen = new Set(prev.map((p) => p.id));
  return [...prev, ...next.filter((p) => !seen.has(p.id))];
}

/**
 * 게시글 목록 — 서버에서 첫 페이지(10개)만 받고, 스크롤이 바닥 근처에 오면
 * fetchBoardPosts 서버 액션으로 다음 페이지를 자동 로드한다.
 * 카테고리 필터도 서버 조회로 동작해 로드 안 된 글도 빠짐없이 보인다.
 */
export default function PostList({
  initialPosts,
  initialHasMore,
}: {
  initialPosts: ListPost[];
  initialHasMore: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [posts, setPosts] = useState<ListPost[]>(initialPosts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // 필터 전환 직후 도착한 이전 요청 응답을 무시하기 위한 요청 id
  const reqIdRef = useRef(0);

  // 서버 revalidate 등으로 첫 페이지 props 가 갱신되면 목록을 처음부터 다시 시작.
  // (render 단계 파생 상태 패턴 — effect 내 setState 를 피한다)
  const [prevInitial, setPrevInitial] = useState(initialPosts);
  if (prevInitial !== initialPosts) {
    setPrevInitial(initialPosts);
    if (filter === "ALL") {
      setPosts(initialPosts);
      setHasMore(initialHasMore);
    }
  }

  const applyFilter = (f: Filter) => {
    if (f === filter) return;
    setFilter(f);
    const reqId = ++reqIdRef.current;
    if (f === "ALL") {
      // 전체 탭은 서버 렌더로 받은 첫 페이지를 그대로 복원
      setPosts(initialPosts);
      setHasMore(initialHasMore);
      setLoading(false);
      return;
    }
    setPosts([]);
    setHasMore(false);
    setLoading(true);
    fetchBoardPosts(0, f)
      .then((r) => {
        if (reqId !== reqIdRef.current) return;
        setPosts(r.posts);
        setHasMore(r.hasMore);
      })
      .finally(() => {
        if (reqId === reqIdRef.current) setLoading(false);
      });
  };

  const loadMore = () => {
    if (loading || !hasMore) return;
    const reqId = ++reqIdRef.current;
    const f = filter;
    setLoading(true);
    fetchBoardPosts(posts.length, f === "ALL" ? null : f)
      .then((r) => {
        if (reqId !== reqIdRef.current) return;
        setPosts((prev) => appendUnique(prev, r.posts));
        setHasMore(r.hasMore);
      })
      .finally(() => {
        if (reqId === reqIdRef.current) setLoading(false);
      });
  };
  // observer 콜백이 항상 최신 상태를 보도록 ref 로 우회
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreRef.current();
      },
      // 바닥에 닿기 전에 미리 로드해 스크롤이 끊기지 않도록
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* 카테고리 필터 — 전 화면 버튼형 칩 (좁으면 가로 스크롤). 끝에 새 글(+) 버튼. */}
      <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
        <CategoryChip
          label="전체"
          active={filter === "ALL"}
          onClick={() => applyFilter("ALL")}
        />
        {POST_CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            label={CATEGORY_LABEL[c]}
            active={filter === c}
            onClick={() => applyFilter(c)}
          />
        ))}
        <Link
          href="/board/new"
          aria-label="새 글 작성"
          title="새 글 작성"
          className="shrink-0 inline-flex items-center justify-center px-2 desktop:px-3 py-0.5 desktop:py-1 rounded-full bg-suaza-ink text-white text-xs desktop:text-sm font-medium whitespace-nowrap hover:opacity-90 transition"
        >
          +새글
        </Link>
      </div>

      {posts.length === 0 && !loading ? (
        <p className="text-suaza-ink-muted text-sm py-6 text-center">
          해당 카테고리의 글이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-suaza-border">
          {posts.map((p) => (
            <li key={p.id} className="py-4 first:pt-0 last:pb-0">
              <PostCard post={p} />
            </li>
          ))}
        </ul>
      )}

      {/* 무한 스크롤 감지선 + 로딩 표시 */}
      {hasMore && !loading && (
        <div ref={sentinelRef} aria-hidden className="h-px" />
      )}
      {loading && (
        <p className="py-3 text-center text-xs text-suaza-ink-muted">
          불러오는 중…
        </p>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center px-2 desktop:px-3 py-0.5 desktop:py-1 rounded-full text-xs desktop:text-sm font-medium whitespace-nowrap transition shrink-0 ${
        active
          ? "bg-suaza-ink text-white border border-suaza-ink"
          : "bg-white text-suaza-ink border border-suaza-border hover:bg-gray-100"
      }`}
    >
      {label}
    </button>
  );
}

function PostCard({ post }: { post: ListPost }) {
  const commentCount = post.comments.length;

  return (
    <Link href={`/board/${post.id}`} className="block transition hover:opacity-70">
      <div className="flex gap-3">
        {/* 좌측: 글 타입(카테고리) 색 세로바 */}
        <span
          aria-hidden
          className="w-1 shrink-0 self-stretch rounded-full"
          style={{ backgroundColor: CATEGORY_BAR_COLOR[post.category] }}
        />
        <div className="flex flex-1 min-w-0 flex-col gap-3">
        {/* 제목 */}
        <h3 className="text-lg font-bold leading-snug text-suaza-ink">
          {post.title}
        </h3>

        {/* 헤더: 작성자 + 시간 / 카테고리 */}
        <div className="flex items-center gap-2.5">
          <AuthorAvatar
            name={post.author?.name ?? null}
            src={post.author?.avatar_url ?? null}
          />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[13px] font-medium text-suaza-ink">
              {post.author?.name ?? "(알 수 없음)"}
            </span>
            <span className="text-[11px] text-suaza-ink-muted">
              {formatPostDate(post.created_at)}
            </span>
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {post.is_notice && post.category !== "notice" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                공지
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${categoryBadgeClass(
                post.category,
                post.is_notice,
              )}`}
            >
              {CATEGORY_LABEL[post.category]}
            </span>
          </span>
        </div>

        {/* 본문 미리보기 (2줄) */}
        <p className="line-clamp-2 text-sm leading-relaxed text-suaza-ink-muted">
          {post.content}
        </p>

        {/* 좋아요 / 댓글 카운트 */}
        <div className="flex items-center gap-4 text-sm font-medium text-suaza-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#F0524F" aria-hidden>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {post.likeCount}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {commentCount}
          </span>
        </div>
        </div>
      </div>
    </Link>
  );
}

function AuthorAvatar({
  name,
  src,
}: {
  name: string | null;
  src: string | null;
}) {
  const initial = name?.charAt(0) || "?";
  return (
    <div
      className="relative shrink-0 w-8 h-8 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center"
      aria-hidden
    >
      {src ? (
        <Image
          src={src}
          alt={name ?? "프로필"}
          fill
          sizes="32px"
          className="object-cover"
        />
      ) : (
        <span className="text-xs font-bold text-suaza-ink">{initial}</span>
      )}
    </div>
  );
}
