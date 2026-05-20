"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { formatPostDate } from "@/lib/board/helpers";
import CommentSection, { type Comment } from "./[id]/comment-section";

export type ListPost = {
  id: string;
  title: string;
  content: string;
  is_notice: boolean;
  created_at: string;
  author_id: string;
  author: { name: string; avatar_url: string | null } | null;
  comments: Comment[];
};

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

  return (
    <ul className="flex flex-col gap-2">
      {posts.map((p) => {
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
        <AuthorAvatar
          name={post.author?.name ?? null}
          src={post.author?.avatar_url ?? null}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {post.is_notice && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-suaza-accent text-white font-medium shrink-0">
                공지
              </span>
            )}
            <span className="font-bold text-suaza-ink truncate">
              {post.title}
            </span>
            {commentCount > 0 && (
              <span className="shrink-0 inline-flex items-center gap-0.5 text-xs text-suaza-ink-muted">
                <span aria-hidden>💬</span>
                <span className="font-medium">{commentCount}</span>
              </span>
            )}
          </div>
          <div className="text-sm text-suaza-ink-muted flex gap-2">
            <span>{post.author?.name ?? "(알 수 없음)"}</span>
            <span>·</span>
            <span>{formatPostDate(post.created_at)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "글 접기" : "글 펼치기"}
          className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-full text-suaza-ink-muted hover:text-suaza-ink hover:bg-gray-100 transition"
        >
          <span
            aria-hidden
            className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}
          >
            ▼
          </span>
        </button>
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
