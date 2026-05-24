"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  createComment,
  deleteComment,
  updateComment,
} from "@/lib/board/actions";
import { formatPostDate } from "@/lib/board/helpers";

export type Comment = {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  parent_id: string | null;
  author: { name: string; avatar_url: string | null } | null;
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

      {tree.length === 0 ? (
        <p className="text-sm text-suaza-ink-muted py-2 text-center">
          첫 댓글을 남겨보세요
        </p>
      ) : (
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
}: {
  postId: string;
  parentId: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [content, setContent] = useState("");
  return (
    <form
      action={createComment.bind(null, postId, parentId)}
      onSubmit={() => setContent("")}
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
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-suaza-ink-muted flex items-center gap-1.5 flex-wrap min-w-0">
            <CommentAvatar
              name={comment.author?.name ?? null}
              src={comment.author?.avatar_url ?? null}
            />
            <span className="font-medium text-suaza-ink">
              {comment.author?.name ?? "(알 수 없음)"}
            </span>
            <span>·</span>
            <span>{formatPostDate(comment.created_at)}</span>
            {edited && <span className="text-suaza-ink-faint">(수정됨)</span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canReply && (
              <button
                type="button"
                onClick={() => setReplying((v) => !v)}
                className="h-6 inline-flex items-center text-[11px] px-2 rounded text-suaza-ink-muted hover:text-suaza-ink hover:bg-gray-100 transition"
              >
                {replying ? "답글 취소" : "답글"}
              </button>
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
            {canDelete && (
              <DeleteButton commentId={comment.id} postId={postId} />
            )}
          </div>
        </div>
        <p className="text-sm text-suaza-ink whitespace-pre-wrap leading-relaxed">
          {comment.content}
        </p>
      </div>

      {replying && (
        <div className={isReply ? "" : "pl-6 sm:pl-8"}>
          <CommentForm
            postId={postId}
            parentId={comment.id}
            placeholder={`${comment.author?.name ?? "댓글"}에게 답글`}
            autoFocus
            onCancel={() => setReplying(false)}
            submitLabel="답글 등록"
          />
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
