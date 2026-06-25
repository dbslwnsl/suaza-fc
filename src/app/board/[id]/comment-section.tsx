"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  createComment,
  deleteComment,
  toggleCommentLike,
  updateComment,
} from "@/lib/board/actions";
import { formatPostDate } from "@/lib/board/helpers";
import {
  TITLE_LABEL,
  TITLE_BADGE,
  TITLE_BAR_COLOR,
  type MemberTitle,
} from "@/lib/members/positions";
import { type Liker } from "./post-actions";

export type Comment = {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  parent_id: string | null;
  author: {
    name: string;
    avatar_url: string | null;
    title: string | null;
  } | null;
  like_count: number;
  liked_by_me: boolean;
  likers: Liker[];
};

type CommentWithReplies = Comment & { replies: Comment[] };

function buildTree(comments: Comment[]): CommentWithReplies[] {
  const roots: CommentWithReplies[] = [];
  const byId = new Map<string, CommentWithReplies>();
  for (const c of comments) {
    if (!c.parent_id) {
      const node: CommentWithReplies = { ...c, replies: [] };
      byId.set(c.id, node);
      roots.push(node);
    }
  }
  for (const c of comments) {
    if (c.parent_id) byId.get(c.parent_id)?.replies.push(c);
  }
  return roots;
}

// ── 메인 ───────────────────────────────────────────────────
export default function CommentSection({
  postId,
  comments,
  myUserId,
  myName,
  myAvatarUrl,
  isManager,
}: {
  postId: string;
  comments: Comment[];
  myUserId: string;
  myName: string | null;
  myAvatarUrl: string | null;
  isManager: boolean;
}) {
  const tree = useMemo(() => buildTree(comments), [comments]);
  const totalCount = comments.length;

  return (
    <section className="flex flex-col gap-4 pt-4 border-t border-suaza-border">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-suaza-ink">댓글</h2>
        {totalCount > 0 && (
          <span className="inline-flex h-[17px] w-[22px] items-center justify-center rounded-full bg-suaza-ink text-[11px] font-bold text-white">
            {totalCount}
          </span>
        )}
      </div>

      {tree.length > 0 && (
        <ul className="flex flex-col gap-4">
          {tree.map((c) => (
            <li key={c.id}>
              <CommentThread
                comment={c}
                postId={postId}
                myUserId={myUserId}
                myName={myName}
                myAvatarUrl={myAvatarUrl}
                isManager={isManager}
              />
            </li>
          ))}
        </ul>
      )}

      {/* 새 댓글 작성 */}
      <NewCommentForm postId={postId} />
    </section>
  );
}

// ── 루트 댓글 + 답글 스레드 ────────────────────────────────
function CommentThread({
  comment,
  postId,
  myUserId,
  myName,
  myAvatarUrl,
  isManager,
}: {
  comment: CommentWithReplies;
  postId: string;
  myUserId: string;
  myName: string | null;
  myAvatarUrl: string | null;
  isManager: boolean;
}) {
  const [replying, setReplying] = useState(false);

  return (
    <div
      className="rounded-2xl border border-suaza-border bg-white p-4"
      style={{
        borderLeftWidth: 4,
        borderLeftColor:
          TITLE_BAR_COLOR[(comment.author?.title ?? "player") as MemberTitle],
      }}
    >
      <CommentBody
        comment={comment}
        postId={postId}
        canEdit={comment.author_id === myUserId}
        canDelete={comment.author_id === myUserId || isManager}
      />

      {/* 액션: 답글 / 좋아요 (구분선 위) */}
      <div className="mt-3 flex items-center gap-4 border-t border-suaza-border/70 pt-3">
        <ReplyToggle
          replying={replying}
          count={comment.replies.length}
          onClick={() => setReplying((v) => !v)}
        />
        <CommentLike
          commentId={comment.id}
          postId={postId}
          initialCount={comment.like_count}
          initialLiked={comment.liked_by_me}
          showLabel
        />
      </div>

      {/* 좋아요 누른 사람 */}
      {comment.likers.length > 0 && (
        <div className="mt-2">
          <Likers likers={comment.likers} />
        </div>
      )}

      {/* 답글 스레드 */}
      {comment.replies.length > 0 && (
        <ul className="mt-3 ml-1 flex flex-col gap-2 border-l-2 border-suaza-border pl-3">
          {comment.replies.map((r) => (
            <li key={r.id}>
              <ReplyCard
                reply={r}
                postId={postId}
                myName={myName}
                myAvatarUrl={myAvatarUrl}
                canEdit={r.author_id === myUserId}
                canDelete={r.author_id === myUserId || isManager}
              />
            </li>
          ))}
        </ul>
      )}

      {/* 답글 입력 — 답글 버튼 눌렀을 때만 */}
      {replying && (
        <ReplyComposer
          postId={postId}
          parentId={comment.id}
          myName={myName}
          myAvatarUrl={myAvatarUrl}
          onDone={() => setReplying(false)}
        />
      )}
    </div>
  );
}

// 루트 댓글 본문 (헤더 2줄 + 내용 + 수정/삭제)
function CommentBody({
  comment,
  postId,
  canEdit,
  canDelete,
}: {
  comment: Comment;
  postId: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const edited =
    comment.updated_at && comment.updated_at !== comment.created_at;
  const authorTitle = (comment.author?.title ?? "player") as MemberTitle;
  // 최상위 댓글은 감독/코치일 때만 직책 표기
  const showTitle = authorTitle === "head_coach" || authorTitle === "coach";

  if (editing) {
    return (
      <EditForm
        postId={postId}
        commentId={comment.id}
        initial={comment.content}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar
            name={comment.author?.name ?? null}
            src={comment.author?.avatar_url ?? null}
            size={26}
          />
          <div className="flex min-w-0 flex-col leading-tight">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate text-[13px] font-bold text-suaza-ink">
                {comment.author?.name ?? "(알 수 없음)"}
              </span>
              {showTitle && <RoleBadge title={authorTitle} />}
            </div>
            <span className="text-[10px] text-suaza-ink-faint">
              {formatPostDate(comment.created_at)}
            </span>
          </div>
        </div>
        {(canEdit || canDelete) && (
          <EditDeleteMenu
            postId={postId}
            commentId={comment.id}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={() => setEditing(true)}
          />
        )}
      </div>
      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-suaza-ink">
        {comment.content}
      </p>
      {edited && (
        <span className="-mt-1 text-[11px] text-suaza-ink-faint">(수정됨)</span>
      )}
    </div>
  );
}

// 답글 (회색 말풍선)
function ReplyCard({
  reply,
  postId,
  myName,
  myAvatarUrl,
  canEdit,
  canDelete,
}: {
  reply: Comment;
  postId: string;
  myName: string | null;
  myAvatarUrl: string | null;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);

  if (editing) {
    return (
      <EditForm
        postId={postId}
        commentId={reply.id}
        initial={reply.content}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-suaza-bg/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Avatar
            name={reply.author?.name ?? null}
            src={reply.author?.avatar_url ?? null}
            size={26}
          />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[13px] font-bold text-suaza-ink">
              {reply.author?.name ?? "(알 수 없음)"}
            </span>
            <span className="text-[10px] text-suaza-ink-faint">
              {formatPostDate(reply.created_at)}
            </span>
          </div>
        </div>
        {(canEdit || canDelete) && (
          <EditDeleteMenu
            postId={postId}
            commentId={reply.id}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={() => setEditing(true)}
          />
        )}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-suaza-ink">
        {reply.content}
      </p>

      <div className="flex items-center gap-4">
        <ReplyToggle replying={replying} onClick={() => setReplying((v) => !v)} />
        <CommentLike
          commentId={reply.id}
          postId={postId}
          initialCount={reply.like_count}
          initialLiked={reply.liked_by_me}
          showLabel
        />
      </div>

      {reply.likers.length > 0 && <Likers likers={reply.likers} />}

      {replying && (
        <ReplyComposer
          postId={postId}
          parentId={reply.id}
          myName={myName}
          myAvatarUrl={myAvatarUrl}
          onDone={() => setReplying(false)}
        />
      )}
    </div>
  );
}

// ── 작은 부품들 ────────────────────────────────────────────
function Avatar({
  name,
  src,
  size,
}: {
  name: string | null;
  src: string | null;
  size: number;
}) {
  const initial = name?.charAt(0) || "?";
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src ? (
        <Image
          src={src}
          alt={name ?? "프로필"}
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      ) : (
        <span
          className="font-bold text-suaza-ink"
          style={{ fontSize: Math.round(size * 0.42) }}
        >
          {initial}
        </span>
      )}
    </span>
  );
}

function RoleBadge({ title }: { title: MemberTitle }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold leading-none ${
        TITLE_BADGE[title] ?? TITLE_BADGE.player
      }`}
    >
      {TITLE_LABEL[title] ?? "회원"}
    </span>
  );
}

function ReplyToggle({
  replying,
  count,
  onClick,
}: {
  replying: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={replying}
      className={`inline-flex items-center gap-1.5 text-[12px] font-bold transition ${
        replying ? "text-suaza-ink" : "text-suaza-ink-muted hover:text-suaza-ink"
      }`}
    >
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
      답글
      {count != null && count > 0 && (
        <span className="tabular-nums">{count}</span>
      )}
    </button>
  );
}

// 좋아요 — 하트 + (좋아요) + 카운트. 낙관적 토글.
function CommentLike({
  commentId,
  postId,
  initialCount,
  initialLiked,
  showLabel,
}: {
  commentId: string;
  postId: string;
  initialCount: number;
  initialLiked: boolean;
  showLabel?: boolean;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [, startTransition] = useTransition();

  const toggle = () => {
    const next = !liked;
    setLiked(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    startTransition(() => toggleCommentLike(commentId, postId));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label="좋아요"
      className={`inline-flex items-center gap-1.5 text-[12px] font-bold transition ${
        liked ? "text-red-500" : "text-suaza-ink-muted hover:text-suaza-ink"
      }`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {showLabel && <span>좋아요</span>}
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
}

// 좋아요한 사람: 아바타 스택 + 이름 (탭 시 전체 목록)
function Likers({ likers }: { likers: Liker[] }) {
  const [open, setOpen] = useState(false);
  if (likers.length === 0) return null;
  const names =
    likers.length === 1
      ? likers[0].name
      : likers.length === 2
        ? `${likers[0].name}, ${likers[1].name}`
        : `${likers[0].name}, ${likers[1].name} 외 ${likers.length - 2}명`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-left"
      >
        <span className="flex -space-x-1.5">
          {likers.slice(0, 3).map((l) => (
            <span key={l.id} className="inline-flex rounded-full ring-2 ring-white">
              <Avatar name={l.name} src={l.avatar_url ?? null} size={20} />
            </span>
          ))}
        </span>
        <span className="text-xs text-suaza-ink-muted">
          <span className="font-medium text-suaza-ink">{names}</span>
          {"이 좋아해요"}
        </span>
      </button>
      {open && <LikersSheet likers={likers} onClose={() => setOpen(false)} />}
    </>
  );
}

function LikersSheet({
  likers,
  onClose,
}: {
  likers: Liker[];
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="좋아요한 사람"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[70vh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl">
        <div className="flex shrink-0 justify-center pt-2">
          <span className="h-1 w-9 rounded-full bg-gray-300" aria-hidden />
        </div>
        <div className="flex shrink-0 items-center justify-between border-b border-suaza-border px-4 py-3">
          <h3 className="text-sm font-bold text-suaza-ink">
            좋아요 {likers.length}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-suaza-ink-muted transition hover:bg-gray-100 hover:text-suaza-ink"
          >
            ✕
          </button>
        </div>
        <ul className="flex flex-col overflow-y-auto p-2">
          {likers.map((l) => (
            <li key={l.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
              <Avatar name={l.name} src={l.avatar_url ?? null} size={36} />
              <span className="text-sm font-medium text-suaza-ink">{l.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

function EditDeleteMenu({
  postId,
  commentId,
  canEdit,
  canDelete,
  onEdit,
}: {
  postId: string;
  commentId: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
}) {
  const [, startTransition] = useTransition();
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {canEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="rounded px-1.5 py-0.5 text-[10px] text-suaza-ink-muted transition hover:bg-gray-100 hover:text-suaza-ink"
        >
          수정
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm("이 댓글을 삭제하시겠습니까?")) {
              startTransition(() => deleteComment(commentId, postId));
            }
          }}
          className="rounded px-1.5 py-0.5 text-[10px] text-red-500 transition hover:bg-red-50 hover:text-red-600"
        >
          삭제
        </button>
      )}
    </span>
  );
}

// 수정 폼 (텍스트영역)
function EditForm({
  postId,
  commentId,
  initial,
  onDone,
}: {
  postId: string;
  commentId: string;
  initial: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim() || value === initial) return;
        const fd = new FormData();
        fd.append("content", value);
        startTransition(async () => {
          await updateComment(commentId, postId, fd);
          onDone();
        });
      }}
      className="flex flex-col gap-2"
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        autoFocus
        required
        className="w-full resize-none rounded-lg border border-suaza-border bg-white px-3 py-2 text-sm text-suaza-ink focus:border-suaza-button focus:outline-none"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-suaza-border px-3 py-1.5 text-xs font-medium text-suaza-ink hover:bg-gray-50"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={!value.trim() || value === initial}
          className="rounded-lg bg-suaza-button px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          저장
        </button>
      </div>
    </form>
  );
}

// 답글 입력 — 내 아바타 + 한 줄 입력 + 등록
function ReplyComposer({
  postId,
  parentId,
  myName,
  myAvatarUrl,
  onDone,
}: {
  postId: string;
  parentId: string;
  myName: string | null;
  myAvatarUrl: string | null;
  onDone: () => void;
}) {
  const [value, setValue] = useState("");
  const [, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        const v = value;
        setValue("");
        const fd = new FormData();
        fd.append("content", v);
        startTransition(async () => {
          await createComment(postId, parentId, fd);
          onDone();
        });
      }}
      className="mt-3 flex items-center gap-2"
    >
      <Avatar name={myName} src={myAvatarUrl} size={32} />
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="답글을 입력하세요"
        className="h-[30px] min-w-0 flex-1 rounded-full border border-suaza-border bg-suaza-bg/40 px-3 text-[12px] font-normal text-suaza-ink placeholder:text-suaza-ink-faint focus:outline-none"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="h-[30px] shrink-0 rounded-full bg-suaza-accent px-4 text-[11px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        등록
      </button>
    </form>
  );
}

// 새 최상위 댓글 작성
function NewCommentForm({ postId }: { postId: string }) {
  const [value, setValue] = useState("");
  const [, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        const v = value;
        setValue("");
        const fd = new FormData();
        fd.append("content", v);
        startTransition(() => createComment(postId, null, fd));
      }}
      className="flex flex-col gap-2 rounded-xl border border-suaza-border bg-suaza-bg/30 p-3"
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        placeholder="댓글을 입력하세요"
        required
        className="w-full resize-none rounded-lg border border-suaza-border bg-white px-3 py-2 text-sm text-suaza-ink focus:border-suaza-button focus:outline-none"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="self-end rounded-lg bg-suaza-button px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        등록
      </button>
    </form>
  );
}
