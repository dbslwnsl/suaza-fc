"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import {
  createComment,
  deleteComment,
  toggleCommentLike,
  updateComment,
} from "@/lib/board/actions";
import { formatPostDate } from "@/lib/board/helpers";
import { displayMemberName } from "@/lib/members/name";
import { type Liker } from "./post-actions";

export type Comment = {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  parent_id: string | null;
  author: { name: string; avatar_url: string | null } | null;
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
    if (c.parent_id) {
      const parent = byId.get(c.parent_id);
      if (parent) parent.replies.push(c);
    }
  }
  return roots;
}

export default function CommentSection({
  postId,
  comments,
  myUserId,
  isManager,
}: {
  postId: string;
  comments: Comment[];
  myUserId: string;
  isManager: boolean;
}) {
  const tree = useMemo(() => buildTree(comments), [comments]);
  const totalCount = comments.length;

  return (
    <section className="flex flex-col gap-4 pt-4 border-t border-suaza-border">
      <div className="flex items-baseline gap-2">
        <h2 className="font-bold text-suaza-ink">댓글</h2>
        <span className="text-xs text-suaza-ink-muted">{totalCount}</span>
      </div>

      {tree.length > 0 && (
        <ul className="flex flex-col gap-3">
          {tree.map((c) => (
            <li key={c.id}>
              <CommentThread
                comment={c}
                postId={postId}
                myUserId={myUserId}
                isManager={isManager}
              />
            </li>
          ))}
        </ul>
      )}

      {/* 최상위 댓글 작성 폼 (리스트 아래) */}
      <CommentForm postId={postId} parentId={null} />
    </section>
  );
}

function CommentForm({
  postId,
  parentId,
  placeholder = "댓글을 입력하세요",
  autoFocus,
  onCancel,
  submitLabel = "등록",
  onDone,
}: {
  postId: string;
  parentId: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  submitLabel?: string;
  /** 등록 성공 후 호출 — 답글 폼은 이걸로 닫아 새 댓글이 입력창 자리에 보이게 한다 */
  onDone?: () => void;
}) {
  const [content, setContent] = useState("");
  return (
    <form
      action={async (formData) => {
        await createComment(postId, parentId, formData);
        setContent("");
        onDone?.();
      }}
      className="flex flex-col gap-2"
    >
      <textarea
        name="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full px-3 py-2 rounded-lg border border-suaza-border text-sm text-suaza-ink focus:outline-none focus:border-suaza-button resize-none"
        required
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-suaza-border text-suaza-ink text-xs font-medium hover:bg-gray-50"
          >
            취소
          </button>
        )}
        <button
          type="submit"
          disabled={!content.trim()}
          className="px-4 py-2 rounded-lg bg-suaza-button text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function CommentThread({
  comment,
  postId,
  myUserId,
  isManager,
}: {
  comment: CommentWithReplies;
  postId: string;
  myUserId: string;
  isManager: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <CommentItem
        comment={comment}
        postId={postId}
        canEdit={comment.author_id === myUserId}
        canDelete={comment.author_id === myUserId || isManager}
        canReply
      />
      {comment.replies.length > 0 && (
        <ul className="flex flex-col gap-2 pl-6 sm:pl-8 border-l-2 border-suaza-border ml-3 sm:ml-4">
          {comment.replies.map((r) => (
            <li key={r.id}>
              <CommentItem
                comment={r}
                postId={postId}
                canEdit={r.author_id === myUserId}
                canDelete={r.author_id === myUserId || isManager}
                canReply
                isReply
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentItem({
  comment,
  postId,
  canEdit,
  canDelete,
  canReply,
  isReply,
}: {
  comment: Comment;
  postId: string;
  canEdit: boolean;
  canDelete: boolean;
  canReply: boolean;
  isReply?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const edited = comment.updated_at && comment.updated_at !== comment.created_at;

  if (editing) {
    return (
      <form
        action={updateComment.bind(null, comment.id, postId)}
        onSubmit={() => setEditing(false)}
        className="flex flex-col gap-2 p-3 rounded-lg border border-suaza-border bg-suaza-bg/40"
      >
        <textarea
          name="content"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          required
          className="w-full px-3 py-2 rounded-lg border border-suaza-border text-sm text-suaza-ink focus:outline-none focus:border-suaza-button resize-none bg-white"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft(comment.content);
              setEditing(false);
            }}
            className="px-3 py-1.5 rounded-lg border border-suaza-border text-suaza-ink text-xs font-medium hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!draft.trim() || draft === comment.content}
            className="px-3 py-1.5 rounded-lg bg-suaza-button text-white text-xs font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            저장
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`flex flex-col gap-1.5 p-3 rounded-lg border ${
          isReply
            ? "border-suaza-border/70 bg-suaza-bg/40"
            : "border-suaza-border"
        }`}
      >
        <div className="text-xs text-suaza-ink-muted flex items-center gap-1.5 flex-wrap min-w-0">
          <CommentAvatar
            name={comment.author?.name ?? null}
            src={comment.author?.avatar_url ?? null}
          />
          <span className="font-medium text-suaza-ink">
            {comment.author?.name ?? "(알 수 없음)"}
          </span>
          <span>{formatPostDate(comment.created_at)}</span>
          {edited && <span className="text-suaza-ink-faint">(수정됨)</span>}
        </div>
        <p className="text-sm text-suaza-ink whitespace-pre-wrap leading-relaxed">
          {comment.content}
        </p>
        {/* 액션 — 좌측: 답글·삭제·수정 / 우측: 좋아요 (댓글 맨 아래 한 줄) */}
        {/* -ml-2 로 첫 버튼(답글) 텍스트를 본문 좌측 끝과 정렬 (버튼 px-2 상쇄) */}
        <div className="flex items-center gap-1 -ml-2">
          {canReply && (
            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className="h-6 inline-flex items-center text-[11px] px-2 rounded text-suaza-ink-muted hover:text-suaza-ink hover:bg-gray-100 transition"
            >
              {replying ? "답글 취소" : "답글"}
            </button>
          )}
          {canDelete && (
            <DeleteButton commentId={comment.id} postId={postId} />
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="h-6 inline-flex items-center text-[11px] px-2 rounded text-suaza-ink-muted hover:text-suaza-ink hover:bg-gray-100 transition"
            >
              수정
            </button>
          )}
          <div className="ml-auto">
            <CommentLike
              commentId={comment.id}
              postId={postId}
              initialCount={comment.like_count}
              initialLiked={comment.liked_by_me}
            />
          </div>
        </div>
        {comment.likers.length > 0 && <CommentLikers likers={comment.likers} />}
      </div>

      {replying && (
        <div className={isReply ? "" : "pl-6 sm:pl-8"}>
          <CommentForm
            postId={postId}
            parentId={comment.id}
            placeholder={`${comment.author?.name ?? "댓글"}에게 답글`}
            autoFocus
            onCancel={() => setReplying(false)}
            onDone={() => setReplying(false)}
            submitLabel="답글 등록"
          />
        </div>
      )}
    </div>
  );
}

// 댓글용 작은 좋아요 — 하트 + 카운트. 낙관적 토글.
function CommentLike({
  commentId,
  postId,
  initialCount,
  initialLiked,
}: {
  commentId: string;
  postId: string;
  initialCount: number;
  initialLiked: boolean;
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
      className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium transition ${
        liked
          ? "text-red-600 bg-red-50"
          : "text-suaza-ink-muted hover:bg-gray-100"
      }`}
    >
      <svg
        width="12"
        height="12"
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
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

// 댓글 좋아요를 누른 사람 — 클릭하면 이름 목록 펼침.
function CommentLikers({ likers }: { likers: Liker[] }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-expanded={show}
        className="self-start inline-flex items-center gap-1 text-[11px] text-suaza-ink-muted hover:text-suaza-ink transition"
      >
        <span className="text-red-500" aria-hidden>
          ♥
        </span>
        <span>
          {displayMemberName(likers[0].name)}
          {likers.length > 1 ? ` 외 ${likers.length - 1}명` : ""}
        </span>
        <svg
          aria-hidden
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${show ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {show && (
        <div className="flex flex-wrap gap-1">
          {likers.map((l) => (
            <span
              key={l.id}
              className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-suaza-ink"
            >
              {displayMemberName(l.name)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CommentAvatar({
  name,
  src,
}: {
  name: string | null;
  src: string | null;
}) {
  const initial = name?.charAt(0) || "?";
  return (
    <span
      className="relative inline-flex shrink-0 w-5 h-5 rounded-full overflow-hidden bg-gray-100 items-center justify-center"
      aria-hidden
    >
      {src ? (
        <Image
          src={src}
          alt={name ?? "프로필"}
          fill
          sizes="20px"
          className="object-cover"
        />
      ) : (
        <span className="text-[10px] font-bold text-suaza-ink">{initial}</span>
      )}
    </span>
  );
}

function DeleteButton({
  commentId,
  postId,
}: {
  commentId: string;
  postId: string;
}) {
  return (
    <form
      action={deleteComment.bind(null, commentId, postId)}
      onSubmit={(e) => {
        if (!window.confirm("이 댓글을 삭제하시겠습니까?")) {
          e.preventDefault();
        }
      }}
      className="inline-flex"
    >
      <button
        type="submit"
        className="h-6 inline-flex items-center text-[11px] px-2 rounded text-red-500 hover:text-red-600 hover:bg-red-50 transition"
      >
        삭제
      </button>
    </form>
  );
}
