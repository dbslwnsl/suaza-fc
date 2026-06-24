"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CATEGORY_LABEL,
  CATEGORY_BAR_COLOR,
  POST_CATEGORIES,
  categoryBadgeClass,
  formatPostDate,
  type PostCategory,
} from "@/lib/board/helpers";
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

export default function PostList({ posts }: { posts: ListPost[] }) {
  const [filter, setFilter] = useState<Filter>("ALL");

  const filtered = useMemo(
    () => (filter === "ALL" ? posts : posts.filter((p) => p.category === filter)),
    [posts, filter],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 카테고리 필터 — 전 화면 버튼형 칩 (좁으면 가로 스크롤). 끝에 새 글(+) 버튼. */}
      <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
        <CategoryChip
          label="전체"
          active={filter === "ALL"}
          onClick={() => setFilter("ALL")}
        />
        {POST_CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            label={CATEGORY_LABEL[c]}
            active={filter === c}
            onClick={() => setFilter(c)}
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

      {filtered.length === 0 ? (
        <p className="text-suaza-ink-muted text-sm py-6 text-center">
          해당 카테고리의 글이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-suaza-border">
          {filtered.map((p) => (
            <li key={p.id} className="py-4 first:pt-0 last:pb-0">
              <PostCard post={p} />
            </li>
          ))}
        </ul>
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
        {/* 헤더: 작성자 + 시간 / 카테고리 */}
        <div className="flex items-center gap-2.5">
          <AuthorAvatar
            name={post.author?.name ?? null}
            src={post.author?.avatar_url ?? null}
          />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-bold text-suaza-ink">
              {post.author?.name ?? "(알 수 없음)"}
            </span>
            <span className="text-[11px] text-suaza-ink-muted">
              {formatPostDate(post.created_at)}
            </span>
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {post.is_notice && post.category !== "notice" && (
              <span className="rounded-full bg-suaza-accent px-2 py-0.5 text-[11px] font-medium text-white">
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

        {/* 제목 */}
        <h3 className="text-base font-bold leading-snug text-suaza-ink">
          {post.title}
        </h3>

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
      className="relative shrink-0 w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center"
      aria-hidden
    >
      {src ? (
        <Image
          src={src}
          alt={name ?? "프로필"}
          fill
          sizes="40px"
          className="object-cover"
        />
      ) : (
        <span className="text-sm font-bold text-suaza-ink">{initial}</span>
      )}
    </div>
  );
}
