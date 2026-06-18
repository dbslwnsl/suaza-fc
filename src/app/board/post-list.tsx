"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CATEGORY_LABEL,
  POST_CATEGORIES,
  categoryBadgeClass,
  formatPostDate,
  type PostCategory,
} from "@/lib/board/helpers";
import CommentSection, { type Comment } from "./[id]/comment-section";
import PostActions, { type Liker } from "./[id]/post-actions";

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

export default function PostList({
  posts,
  myUserId,
  isManager,
}: {
  posts: ListPost[];
  myUserId: string;
  isManager: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
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
        <ul className="flex flex-col gap-2">
          {filtered.map((p) => {
            const open = p.id === openId;
            return (
              <li key={p.id}>
                <PostCard
                  post={p}
                  open={open}
                  onToggle={() => setOpenId(open ? null : p.id)}
                  myUserId={myUserId}
                  isManager={isManager}
                />
              </li>
            );
          })}
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

function PostCard({
  post,
  open,
  onToggle,
  myUserId,
  isManager,
}: {
  post: ListPost;
  open: boolean;
  onToggle: () => void;
  myUserId: string;
  isManager: boolean;
}) {
  const commentCount = post.comments.length;

  return (
    <div className="border border-suaza-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        {/* 좌측: 아바타 — 이름/제목 2줄에 걸쳐 세로 중앙 */}
        <Link href={`/board/${post.id}`} className="shrink-0">
          <AuthorAvatar
            name={post.author?.name ?? null}
            src={post.author?.avatar_url ?? null}
          />
        </Link>
        {/* 우측: 1줄(제목 + 💬 + 펼치기) / 2줄(이름·날짜·게시글 타입) */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Link href={`/board/${post.id}`} className="group flex-1 min-w-0">
              <h3 className="font-bold text-suaza-ink truncate group-hover:underline">
                {post.title}
              </h3>
            </Link>
            {commentCount > 0 && (
              <span className="shrink-0 inline-flex items-center gap-0.5 text-xs text-suaza-ink-muted">
                <span aria-hidden>💬</span>
                <span className="font-medium">{commentCount}</span>
              </span>
            )}
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-label={open ? "글 접기" : "글 펼치기"}
              className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-full text-suaza-ink-muted hover:text-suaza-ink hover:bg-gray-100 transition"
            >
              <svg
                aria-hidden
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${open ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-medium text-suaza-ink">
              {post.author?.name ?? "(알 수 없음)"}
            </span>
            <span className="text-suaza-ink-muted">
              {formatPostDate(post.created_at)}
            </span>
            {/* 공지 카테고리는 카테고리 뱃지가 "공지"를 표시하므로 중복 방지 */}
            {post.is_notice && post.category !== "notice" && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-suaza-accent text-white font-medium">
                공지
              </span>
            )}
            <span
              className={`text-[11px] px-2 py-0.5 rounded font-medium ${categoryBadgeClass(post.category, post.is_notice)}`}
            >
              {CATEGORY_LABEL[post.category]}
            </span>
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-suaza-border bg-suaza-bg/30 p-4 flex flex-col gap-4">
          <p className="text-suaza-ink whitespace-pre-wrap leading-relaxed text-sm">
            {post.content}
          </p>
          {/* 좋아요(하트)·공유 + 누가 눌렀는지 — 상세 페이지와 동일 */}
          <PostActions
            postId={post.id}
            initialLikes={post.likeCount}
            initialLiked={post.likedByMe}
            likers={post.likers}
          />
          <div className="flex justify-end">
            <Link
              href={`/board/${post.id}`}
              className="text-xs text-suaza-ink-muted hover:text-suaza-ink hover:underline"
            >
              자세히 보기 ›
            </Link>
          </div>
          <CommentSection
            postId={post.id}
            comments={post.comments}
            myUserId={myUserId}
            isManager={isManager}
          />
        </div>
      )}
    </div>
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
