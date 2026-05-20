"use client";

import { useState } from "react";
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
  author: { name: string } | null;
};

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
  return (
    <section className="flex flex-col gap-4 pt-4 border-t border-suaza-border">
      <div className="flex items-baseline gap-2">
        <h2 className="font-bold text-suaza-ink">댓글</h2>
        <span className="text-xs text-suaza-ink-muted">{comments.length}</span>
      </div>

      {/* 작성 폼 */}
      <CommentForm postId={postId} />

      {/* 목록 */}
      {comments.length === 0 ? (
        <p className="text-sm text-suaza-ink-muted py-2 text-center">
          첫 댓글을 남겨보세요
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id}>
              <CommentItem
                comment={c}
                postId={postId}
                canEdit={c.author_id === myUserId}
                canDelete={c.author_id === myUserId || isManager}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentForm({ postId }: { postId: string }) {
  const [content, setContent] = useState("");
  return (
    <form
      action={createComment.bind(null, postId)}
      onSubmit={() => setContent("")}
      className="flex flex-col gap-2"
    >
      <textarea
        name="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        placeholder="댓글을 입력하세요"
        className="w-full px-3 py-2 rounded-lg border border-suaza-border text-sm text-suaza-ink focus:outline-none focus:border-suaza-button resize-none"
        required
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!content.trim()}
          className="px-4 py-2 rounded-lg bg-suaza-button text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          등록
        </button>
      </div>
    </form>
  );
}

function CommentItem({
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
    <div className="flex flex-col gap-1.5 p-3 rounded-lg border border-suaza-border">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-suaza-ink-muted flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-suaza-ink">
            {comment.author?.name ?? "(알 수 없음)"}
          </span>
          <span>·</span>
          <span>{formatPostDate(comment.created_at)}</span>
          {edited && <span className="text-suaza-ink-faint">(수정됨)</span>}
        </div>
        {(canEdit || canDelete) && (
          <div className="flex items-center gap-1 shrink-0">
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-[11px] px-2 py-0.5 rounded text-suaza-ink-muted hover:text-suaza-ink hover:bg-gray-100 transition"
              >
                수정
              </button>
            )}
            {canDelete && (
              <DeleteButton commentId={comment.id} postId={postId} />
            )}
          </div>
        )}
      </div>
      <p className="text-sm text-suaza-ink whitespace-pre-wrap leading-relaxed">
        {comment.content}
      </p>
    </div>
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
    >
      <button
        type="submit"
        className="text-[11px] px-2 py-0.5 rounded text-red-500 hover:text-red-600 hover:bg-red-50 transition"
      >
        삭제
      </button>
    </form>
  );
}
