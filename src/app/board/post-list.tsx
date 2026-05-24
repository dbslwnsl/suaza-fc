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

  const counts = useMemo(() => {
    const c = {} as Record<PostCategory, number>;
    for (const cat of POST_CATEGORIES) c[cat] = 0;
    for (const p of posts) c[p.category] = (c[p.category] ?? 0) + 1;
    return c;
  }, [posts]);

  const filtered = useMemo(
    () => (filter === "ALL" ? posts : posts.filter((p) => p.category === filter)),
    [posts, filter],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 카테고리 필터 — 모바일: 드랍다운(인라인), 데스크탑: 칩 */}
      <div className="sm:hidden relative inline-flex items-center self-start w-fit">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="appearance-none bg-transparent border-none pl-0 pr-5 py-1 text-sm font-medium text-suaza-ink focus:outline-none cursor-pointer"
        >
          <option value="ALL">전체 ({posts.length})</option>
          {POST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]} ({counts[c]})
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 text-[10px] text-suaza-ink-muted"
        >
          ▼
        </span>
      </div>
      <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
        <CategoryChip
          label="전체"
          count={posts.length}
          active={filter === "ALL"}
          onClick={() => setFilter("ALL")}
        />
        {POST_CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            label={CATEGORY_LABEL[c]}
            count={counts[c]}
            active={filter === c}
            onClick={() => setFilter(c)}
          />
        ))}
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
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition shrink-0 ${
        active
          ? "bg-suaza-ink text-white border border-suaza-ink"
          : "bg-white text-suaza-ink border border-suaza-border hover:bg-gray-100"
      }`}
    >
      <span>{label}</span>
      <span className={active ? "text-white/70" : "text-suaza-ink-muted"}>
        {count}
      </span>
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
      <div className="flex gap-3 p-4">
        {/* 좌측: 아바타(상단) + 이름(하단, 날짜 라인과 정렬) */}
        <Link
          href={`/board/${post.id}`}
          className="flex flex-col items-center justify-between gap-1 shrink-0 w-12 group"
        >
          <AuthorAvatar
            name={post.author?.name ?? null}
            src={post.author?.avatar_url ?? null}
          />
          <span className="text-[11px] text-suaza-ink-muted truncate w-full text-center group-hover:text-suaza-ink">
            {post.author?.name ?? "(알 수 없음)"}
          </span>
        </Link>
        {/* 우측: 태그 → 제목+💬+▼ → 날짜 */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            {/* 공지 카테고리는 아래 카테고리 뱃지가 "공지"를 표시하므로 중복 방지 */}
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
          <div className="flex items-center gap-2">
            <Link
              href={`/board/${post.id}`}
              className="group flex-1 min-w-0"
            >
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
              <span
                aria-hidden
                className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}
              >
                ▼
              </span>
            </button>
          </div>
          <div className="text-xs text-suaza-ink-muted">
            {formatPostDate(post.created_at)}
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-suaza-border bg-suaza-bg/30 p-4 flex flex-col gap-4">
          <p className="text-suaza-ink whitespace-pre-wrap leading-relaxed text-sm">
            {post.content}
          </p>
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
