"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  createMatchComment,
  deleteMatchComment,
  updateMatchComment,
} from "@/lib/matches/actions";
import { formatPostDate } from "@/lib/board/helpers";

export type MatchComment = {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  parent_id: string | null;
  author: { name: string; avatar_url: string | null } | null;
};

type CommentWithReplies = MatchComment & { replies: MatchComment[] };

function buildTree(comments: MatchComment[]): CommentWithReplies[] {
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

export default function MatchCommentSection({
  matchId,
  comments,
  myUserId,
  myName,
  myAvatarUrl,
  isManager,
  scrollableOnDesktop = false,
}: {
  matchId: string;
  comments: MatchComment[];
  myUserId: string;
  myName: string | null;
  myAvatarUrl: string | null;
  isManager: boolean;
  /** 데스크탑에서 컨테이너 전체 높이를 채우고 댓글 목록만 독립 세로 스크롤 */
  scrollableOnDesktop?: boolean;
}) {
  const [items, setItems] = useState<MatchComment[]>(comments);

  const tree = useMemo(() => buildTree(items), [items]);
  const totalCount = items.length;

  const submitCreate = (parentId: string | null, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    // 답글의 답글이면 부모로 평탄화 (서버와 동일 규칙)
    let effectiveParent = parentId;
    if (parentId) {
      const parent = items.find((c) => c.id === parentId);
      if (parent?.parent_id) effectiveParent = parent.parent_id;
    }
    // 1) 임시 항목을 즉시 추가해 화면에 바로 보이게 한다
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const now = new Date().toISOString();
    setItems((prev) => [
      ...prev,
      {
        id: tempId,
        content: trimmed,
        created_at: now,
        updated_at: now,
        author_id: myUserId,
        parent_id: effectiveParent,
        author: { name: myName ?? "", avatar_url: myAvatarUrl },
      },
    ]);
    // 2) 저장 후 실제 행(id·시각)으로 교체. 실패하면 임시 항목 제거(롤백).
    void (async () => {
      const saved = await createMatchComment(matchId, parentId, trimmed);
      setItems((prev) => {
        if (!saved) return prev.filter((c) => c.id !== tempId);
        return prev.map((c) =>
          c.id === tempId
            ? {
                ...c,
                id: saved.id,
                created_at: saved.created_at,
                updated_at: saved.updated_at,
                parent_id: saved.parent_id,
              }
            : c,
        );
      });
    })();
  };

  const submitUpdate = (commentId: string, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, content: trimmed, updated_at: now } : c,
      ),
    );
    void updateMatchComment(commentId, trimmed);
  };

  const submitDelete = (commentId: string) => {
    setItems((prev) =>
      prev.filter((c) => c.id !== commentId && c.parent_id !== commentId),
    );
    void deleteMatchComment(commentId);
  };

  return (
    <section
      className={`bg-white rounded-2xl border border-suaza-border desktop:border-0 desktop:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-5 desktop:p-8 flex flex-col gap-4 ${
        scrollableOnDesktop ? "desktop:h-full desktop:min-h-0" : ""
      }`}
    >
      <div className="flex items-baseline gap-2">
        <h2 className="font-bold text-suaza-ink text-lg">댓글</h2>
        <span className="text-xs text-suaza-ink-muted">{totalCount}</span>
      </div>

      {tree.length === 0 ? (
        <p
          className={`text-sm text-suaza-ink-muted py-2 text-center ${
            scrollableOnDesktop ? "desktop:flex-1 desktop:min-h-0" : ""
          }`}
        >
          첫 댓글을 남겨보세요
        </p>
      ) : (
        <ul
          className={`flex flex-col gap-3 ${
            scrollableOnDesktop
              ? "desktop:flex-1 desktop:min-h-0 desktop:overflow-y-auto desktop:-mx-2 desktop:px-2"
              : ""
          }`}
        >
          {tree.map((c) => (
            <li key={c.id}>
              <CommentThread
                comment={c}
                myUserId={myUserId}
                isManager={isManager}
                onCreate={submitCreate}
                onUpdate={submitUpdate}
                onDelete={submitDelete}
              />
            </li>
          ))}
        </ul>
      )}

      <CommentForm parentId={null} onSubmit={submitCreate} />
    </section>
  );
}

function CommentForm({
  parentId,
  placeholder = "댓글을 입력하세요",
  autoFocus,
  onCancel,
  onSubmit,
  submitLabel = "등록",
}: {
  parentId: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  onSubmit: (parentId: string | null, content: string) => void;
  submitLabel?: string;
}) {
  const [content, setContent] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!content.trim()) return;
        onSubmit(parentId, content);
        setContent("");
        onCancel?.();
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
  myUserId,
  isManager,
  onCreate,
  onUpdate,
  onDelete,
}: {
  comment: CommentWithReplies;
  myUserId: string;
  isManager: boolean;
  onCreate: (parentId: string | null, content: string) => void;
  onUpdate: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <CommentItem
        comment={comment}
        canEdit={comment.author_id === myUserId}
        canDelete={comment.author_id === myUserId || isManager}
        canReply
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
      {comment.replies.length > 0 && (
        <ul className="flex flex-col gap-2 pl-6 sm:pl-8 border-l-2 border-suaza-border ml-3 sm:ml-4">
          {comment.replies.map((r) => (
            <li key={r.id}>
              <CommentItem
                comment={r}
                canEdit={r.author_id === myUserId}
                canDelete={r.author_id === myUserId || isManager}
                canReply
                isReply
                onCreate={onCreate}
                onUpdate={onUpdate}
                onDelete={onDelete}
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
  canEdit,
  canDelete,
  canReply,
  isReply,
  onCreate,
  onUpdate,
  onDelete,
}: {
  comment: MatchComment;
  canEdit: boolean;
  canDelete: boolean;
  canReply: boolean;
  isReply?: boolean;
  onCreate: (parentId: string | null, content: string) => void;
  onUpdate: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const edited = comment.updated_at && comment.updated_at !== comment.created_at;
  // 낙관적 임시 ID 는 'temp-' 접두사로 구분
  const isTemp = comment.id.startsWith("temp-");

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim() || draft === comment.content) return;
          onUpdate(comment.id, draft);
          setEditing(false);
        }}
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
            {edited && !isTemp && (
              <span className="text-suaza-ink-faint">(수정됨)</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canReply && !isTemp && (
              <button
                type="button"
                onClick={() => setReplying((v) => !v)}
                className="h-6 inline-flex items-center text-[11px] px-2 rounded text-suaza-ink-muted hover:text-suaza-ink hover:bg-gray-100 transition"
              >
                {replying ? "답글 취소" : "답글"}
              </button>
            )}
            {canEdit && !isTemp && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="h-6 inline-flex items-center text-[11px] px-2 rounded text-suaza-ink-muted hover:text-suaza-ink hover:bg-gray-100 transition"
              >
                수정
              </button>
            )}
            {canDelete && !isTemp && (
              <DeleteButton
                commentId={comment.id}
                onDelete={onDelete}
              />
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
            parentId={comment.id}
            placeholder={`${comment.author?.name ?? "댓글"}에게 답글`}
            autoFocus
            onCancel={() => setReplying(false)}
            onSubmit={onCreate}
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
  onDelete,
}: {
  commentId: string;
  onDelete: (commentId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm("이 댓글을 삭제하시겠습니까?")) {
          onDelete(commentId);
        }
      }}
      className="h-6 inline-flex items-center text-[11px] px-2 rounded text-red-500 hover:text-red-600 hover:bg-red-50 transition"
    >
      삭제
    </button>
  );
}
