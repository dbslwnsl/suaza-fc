"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  createCoachComment,
  deleteCoachComment,
  toggleCoachCommentLike,
  updateCoachComment,
} from "./actions";
import {
  TITLE_LABEL,
  TITLE_BADGE,
  TITLE_BAR_COLOR,
  type MemberTitle,
} from "@/lib/members/positions";

export type MatchOption = {
  id: string;
  match_date: string;
  opponent: string;
};

export type Liker = { id: string; name: string; avatar_url: string | null };

export type CoachComment = {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  parent_id: string | null;
  match_id: string | null;
  match: { id: string; match_date: string; opponent: string } | null;
  author: {
    name: string;
    title: string | null;
    avatar_url: string | null;
  } | null;
  like_count: number;
  liked_by_me: boolean;
  likers: Liker[];
};

type CommentWithReplies = CoachComment & { replies: CoachComment[] };

function matchDateLabel(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

function buildTree(comments: CoachComment[]): CommentWithReplies[] {
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
export default function CoachCommentSection({
  memberId,
  memberName,
  comments,
  matches,
  myUserId,
  myName,
  myTitle,
  myAvatarUrl,
  canWrite,
  isCoachingStaff,
  viewerIsSelf,
}: {
  memberId: string;
  memberName: string;
  comments: CoachComment[];
  matches: MatchOption[];
  myUserId: string;
  myName: string | null;
  myTitle: MemberTitle;
  myAvatarUrl: string | null;
  canWrite: boolean;
  isCoachingStaff: boolean;
  viewerIsSelf: boolean;
}) {
  const [items, setItems] = useState<CoachComment[]>(comments);
  const [, startTransition] = useTransition();

  const tree = useMemo(() => buildTree(items), [items]);

  const submitCreate = (
    parentId: string | null,
    content: string,
    matchId: string | null,
  ) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    let effectiveParent = parentId;
    if (parentId) {
      const parent = items.find((c) => c.id === parentId);
      if (parent?.parent_id) effectiveParent = parent.parent_id;
    }
    const match =
      !effectiveParent && matchId
        ? matches.find((m) => m.id === matchId) ?? null
        : null;
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
        match_id: match?.id ?? null,
        match: match
          ? {
              id: match.id,
              match_date: match.match_date,
              opponent: match.opponent,
            }
          : null,
        author: { name: myName ?? "", title: myTitle, avatar_url: myAvatarUrl },
        like_count: 0,
        liked_by_me: false,
        likers: [],
      },
    ]);
    void (async () => {
      const saved = await createCoachComment(
        memberId,
        trimmed,
        match?.id ?? null,
        parentId,
      );
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
    void updateCoachComment(commentId, memberId, trimmed);
  };

  const submitDelete = (commentId: string) => {
    setItems((prev) =>
      prev.filter((c) => c.id !== commentId && c.parent_id !== commentId),
    );
    void deleteCoachComment(commentId, memberId);
  };

  const toggleLike = (commentId: string) => {
    setItems((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const liked = !c.liked_by_me;
        const likers = liked
          ? [
              ...c.likers,
              { id: myUserId, name: myName ?? "", avatar_url: myAvatarUrl },
            ]
          : c.likers.filter((l) => l.id !== myUserId);
        return {
          ...c,
          liked_by_me: liked,
          like_count: Math.max(0, c.like_count + (liked ? 1 : -1)),
          likers,
        };
      }),
    );
    startTransition(() => {
      void toggleCoachCommentLike(commentId);
    });
  };

  return (
    <section className="flex flex-col gap-4 pt-6 border-t border-suaza-border">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <h2 className="text-suaza-ink text-lg font-bold">감독·코치 코멘트</h2>
        {items.length > 0 && (
          <span className="inline-flex items-center justify-center w-[22px] h-[17px] rounded-full bg-suaza-ink text-white text-[11px] font-bold">
            {items.length}
          </span>
        )}
      </div>
      {tree.length === 0 ? (
        <p className="text-sm text-suaza-ink-faint py-6 text-center bg-suaza-bg/40 rounded-xl">
          {canWrite ? "첫 코멘트를 남겨보세요" : "아직 등록된 코멘트가 없습니다"}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {tree.map((c) => (
            <li key={c.id}>
              <CommentThread
                comment={c}
                myUserId={myUserId}
                myName={myName}
                myAvatarUrl={myAvatarUrl}
                canWrite={canWrite}
                onCreate={submitCreate}
                onUpdate={submitUpdate}
                onDelete={submitDelete}
                onToggleLike={toggleLike}
              />
            </li>
          ))}
        </ul>
      )}

      {/* 새 코멘트 작성 */}
      {canWrite && (
        <NewCommentForm
          matches={isCoachingStaff ? matches : []}
          onSubmit={(content, matchId) => submitCreate(null, content, matchId)}
        />
      )}
    </section>
  );
}

// ── 루트 코멘트 + 답글 스레드 ──────────────────────────────
function CommentThread({
  comment,
  myUserId,
  myName,
  myAvatarUrl,
  canWrite,
  onCreate,
  onUpdate,
  onDelete,
  onToggleLike,
}: {
  comment: CommentWithReplies;
  myUserId: string;
  myName: string | null;
  myAvatarUrl: string | null;
  canWrite: boolean;
  onCreate: (
    parentId: string | null,
    content: string,
    matchId: string | null,
  ) => void;
  onUpdate: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
  onToggleLike: (commentId: string) => void;
}) {
  const [replying, setReplying] = useState(false);
  const isTemp = comment.id.startsWith("temp-");
  const accent =
    TITLE_BAR_COLOR[(comment.author?.title ?? "player") as MemberTitle];

  return (
    <div
      className={`rounded-2xl border border-suaza-border bg-white p-4 ${
        isTemp ? "opacity-60" : ""
      }`}
      style={{ borderLeftWidth: 4, borderLeftColor: accent }}
    >
      <CommentBody
        comment={comment}
        canEdit={comment.author_id === myUserId}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />

      {/* 액션: 좋아요 / 답글 (구분선 위) */}
      {!isTemp && (
        <div className="mt-3 pt-3 border-t border-suaza-border/70 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setReplying((v) => !v)}
            aria-expanded={replying}
            className={`inline-flex items-center gap-1.5 text-[12px] font-bold transition ${
              replying
                ? "text-suaza-ink"
                : "text-suaza-ink-muted hover:text-suaza-ink"
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
            {comment.replies.length > 0 && (
              <span className="tabular-nums">{comment.replies.length}</span>
            )}
          </button>
          <LikeButton
            liked={comment.liked_by_me}
            count={comment.like_count}
            showLabel
            onToggle={() => onToggleLike(comment.id)}
          />
        </div>
      )}

      {/* 좋아요 누른 사람 */}
      {!isTemp && comment.likers.length > 0 && (
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
                canEdit={r.author_id === myUserId}
                canWrite={canWrite}
                myName={myName}
                myAvatarUrl={myAvatarUrl}
                onCreate={onCreate}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onToggleLike={onToggleLike}
              />
            </li>
          ))}
        </ul>
      )}

      {/* 답글 입력 — 답글 버튼을 눌렀을 때만 표시 */}
      {canWrite && !isTemp && replying && (
        <ReplyComposer
          myName={myName}
          myAvatarUrl={myAvatarUrl}
          onSubmit={(content) => {
            onCreate(comment.id, content, null);
            setReplying(false);
          }}
        />
      )}
    </div>
  );
}

// 루트 코멘트 본문 (헤더 + 경기칩 + 내용 + 수정/삭제)
function CommentBody({
  comment,
  canEdit,
  onUpdate,
  onDelete,
}: {
  comment: CoachComment;
  canEdit: boolean;
  onUpdate: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const isTemp = comment.id.startsWith("temp-");
  const edited =
    comment.updated_at && comment.updated_at !== comment.created_at;
  const authorTitle = (comment.author?.title ?? "player") as MemberTitle;
  // 최상위 코멘트는 감독/코치일 때만 직책 표기 (답글은 누구도 표기 안 함)
  const showTitle = authorTitle === "head_coach" || authorTitle === "coach";

  if (editing) {
    return (
      <EditForm
        initial={comment.content}
        value={draft}
        onChange={setDraft}
        onCancel={() => {
          setDraft(comment.content);
          setEditing(false);
        }}
        onSave={() => {
          onUpdate(comment.id, draft);
          setEditing(false);
        }}
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
          <div className="flex flex-col min-w-0 leading-tight">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-bold text-suaza-ink text-[13px] truncate">
                {comment.author?.name ?? "(알 수 없음)"}
              </span>
              {showTitle && <RoleBadge title={authorTitle} />}
            </div>
            <span className="text-[10px] text-suaza-ink-faint">
              {formatDateTime(comment.created_at)}
            </span>
          </div>
        </div>
        {canEdit && !isTemp && (
          <EditDeleteMenu
            onEdit={() => {
              setDraft(comment.content);
              setEditing(true);
            }}
            onDelete={() => onDelete(comment.id)}
          />
        )}
      </div>

      {comment.match && <MatchChip match={comment.match} />}

      <p className="text-[14px] text-suaza-ink whitespace-pre-wrap leading-relaxed">
        {comment.content}
      </p>
      {edited && !isTemp && (
        <span className="text-[11px] text-suaza-ink-faint -mt-1">(수정됨)</span>
      )}
    </div>
  );
}

// 답글 (회색 말풍선)
function ReplyCard({
  reply,
  canEdit,
  canWrite,
  myName,
  myAvatarUrl,
  onCreate,
  onUpdate,
  onDelete,
  onToggleLike,
}: {
  reply: CoachComment;
  canEdit: boolean;
  canWrite: boolean;
  myName: string | null;
  myAvatarUrl: string | null;
  onCreate: (
    parentId: string | null,
    content: string,
    matchId: string | null,
  ) => void;
  onUpdate: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
  onToggleLike: (commentId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState(reply.content);
  const isTemp = reply.id.startsWith("temp-");

  if (editing) {
    return (
      <EditForm
        initial={reply.content}
        value={draft}
        onChange={setDraft}
        onCancel={() => {
          setDraft(reply.content);
          setEditing(false);
        }}
        onSave={() => {
          onUpdate(reply.id, draft);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div
      className={`rounded-xl bg-suaza-bg/60 p-3 flex flex-col gap-1.5 ${
        isTemp ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Avatar
            name={reply.author?.name ?? null}
            src={reply.author?.avatar_url ?? null}
            size={26}
          />
          <div className="flex flex-col min-w-0 leading-tight">
            <span className="font-bold text-suaza-ink text-[13px] truncate">
              {reply.author?.name ?? "(알 수 없음)"}
            </span>
            <span className="text-[10px] text-suaza-ink-faint">
              {formatDateTime(reply.created_at)}
            </span>
          </div>
        </div>
        {canEdit && !isTemp && (
          <EditDeleteMenu
            onEdit={() => {
              setDraft(reply.content);
              setEditing(true);
            }}
            onDelete={() => onDelete(reply.id)}
          />
        )}
      </div>
      <p className="text-sm text-suaza-ink whitespace-pre-wrap leading-relaxed">
        {reply.content}
      </p>

      {/* 액션: 답글 / 좋아요 */}
      {!isTemp && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setReplying((v) => !v)}
            aria-expanded={replying}
            className={`inline-flex items-center gap-1.5 text-[12px] font-bold transition ${
              replying
                ? "text-suaza-ink"
                : "text-suaza-ink-muted hover:text-suaza-ink"
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
          </button>
          <LikeButton
            liked={reply.liked_by_me}
            count={reply.like_count}
            showLabel
            onToggle={() => onToggleLike(reply.id)}
          />
        </div>
      )}

      {/* 좋아요 누른 사람 */}
      {!isTemp && reply.likers.length > 0 && <Likers likers={reply.likers} />}

      {/* 답글 입력 — 답글 버튼을 눌렀을 때만 (1단계라 부모 코멘트로 달림) */}
      {canWrite && !isTemp && replying && (
        <ReplyComposer
          myName={myName}
          myAvatarUrl={myAvatarUrl}
          onSubmit={(content) => {
            onCreate(reply.id, content, null);
            setReplying(false);
          }}
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
      className="relative inline-flex shrink-0 rounded-full overflow-hidden items-center justify-center bg-gray-100"
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
      className={`shrink-0 text-[11px] font-bold leading-none px-2.5 py-1 rounded-full ${
        TITLE_BADGE[title] ?? TITLE_BADGE.player
      }`}
    >
      {TITLE_LABEL[title] ?? "회원"}
    </span>
  );
}

function MatchChip({
  match,
}: {
  match: { match_date: string; opponent: string };
}) {
  const self = match.opponent === "자체전";
  return (
    <span className="self-start inline-flex items-center gap-1.5 text-[11px] text-suaza-ink">
      <span className="font-medium">{matchDateLabel(match.match_date)}</span>
      <span
        className={`text-[11px] font-bold ${
          self ? "text-emerald-700" : "text-orange-600"
        }`}
      >
        {self ? "자체전" : "상대전"}
      </span>
      {!self && (
        <span className="text-suaza-ink-muted">vs {match.opponent}</span>
      )}
    </span>
  );
}

function LikeButton({
  liked,
  count,
  showLabel,
  onToggle,
}: {
  liked: boolean;
  count: number;
  showLabel?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
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
function Likers({ likers, mini }: { likers: Liker[]; mini?: boolean }) {
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
            <span
              key={l.id}
              className="ring-2 ring-white rounded-full inline-flex"
            >
              <Avatar name={l.name} src={l.avatar_url} size={mini ? 16 : 20} />
            </span>
          ))}
        </span>
        <span
          className={`text-suaza-ink-muted ${mini ? "text-[11px]" : "text-xs"}`}
        >
          <span className="font-medium text-suaza-ink">{names}</span>
          {"님이 좋아해요"}
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
      <div className="relative w-full max-w-[600px] max-h-[70vh] bg-white rounded-t-2xl shadow-xl flex flex-col overflow-hidden">
        <div className="pt-2 flex justify-center shrink-0">
          <span className="w-9 h-1 rounded-full bg-gray-300" aria-hidden />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-suaza-border shrink-0">
          <h3 className="font-bold text-suaza-ink text-sm">
            좋아요 {likers.length}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-suaza-ink-muted hover:text-suaza-ink hover:bg-gray-100 transition"
          >
            ✕
          </button>
        </div>
        <ul className="overflow-y-auto p-2 flex flex-col">
          {likers.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-2.5 px-2 py-2 rounded-lg"
            >
              <Avatar name={l.name} src={l.avatar_url} size={36} />
              <span className="text-sm font-medium text-suaza-ink">
                {l.name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

function EditDeleteMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <span className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={onEdit}
        className="text-[10px] px-1.5 py-0.5 rounded text-suaza-ink-muted hover:text-suaza-ink hover:bg-gray-100 transition"
      >
        수정
      </button>
      <button
        type="button"
        onClick={() => {
          if (window.confirm("삭제하시겠습니까?")) onDelete();
        }}
        className="text-[10px] px-1.5 py-0.5 rounded text-red-500 hover:text-red-600 hover:bg-red-50 transition"
      >
        삭제
      </button>
    </span>
  );
}

function EditForm({
  value,
  onChange,
  onCancel,
  onSave,
  initial,
}: {
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
  initial: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim() || value === initial) return;
        onSave();
      }}
      className="flex flex-col gap-2"
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        autoFocus
        required
        className="w-full px-3 py-2 rounded-lg border border-suaza-border text-sm text-suaza-ink bg-white focus:outline-none focus:border-suaza-button resize-none"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-suaza-border text-suaza-ink text-xs font-medium hover:bg-gray-50"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={!value.trim() || value === initial}
          className="px-3 py-1.5 rounded-lg bg-suaza-button text-white text-xs font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          저장
        </button>
      </div>
    </form>
  );
}

// 답글 입력 — 내 아바타 + 한 줄 입력 + 등록
function ReplyComposer({
  myName,
  myAvatarUrl,
  onSubmit,
}: {
  myName: string | null;
  myAvatarUrl: string | null;
  onSubmit: (content: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSubmit(value);
        setValue("");
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
        className="flex-1 min-w-0 h-[30px] px-3 rounded-full border border-suaza-border bg-suaza-bg/40 text-[12px] font-normal text-suaza-ink placeholder:text-suaza-ink-faint focus:outline-none"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="shrink-0 h-[30px] px-4 rounded-full bg-suaza-accent text-white text-[11px] font-bold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        등록
      </button>
    </form>
  );
};

// 새 최상위 코멘트 작성
function NewCommentForm({
  matches,
  onSubmit,
}: {
  matches: MatchOption[];
  onSubmit: (content: string, matchId: string | null) => void;
}) {
  const [content, setContent] = useState("");
  const [matchId, setMatchId] = useState("");
  const showMatchSelect = matches.length > 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!content.trim()) return;
        onSubmit(content, matchId || null);
        setContent("");
        setMatchId("");
      }}
      className="flex flex-col gap-2 p-3 rounded-xl border border-suaza-border bg-suaza-bg/30"
    >
      {showMatchSelect && (
        <select
          value={matchId}
          onChange={(e) => setMatchId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-suaza-border text-sm text-suaza-ink bg-white focus:outline-none focus:border-suaza-button"
        >
          <option value="">일반 코멘트 (경기 선택 안 함)</option>
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              {matchDateLabel(m.match_date)} ·{" "}
              {m.opponent === "자체전" ? "자체전" : `상대전 vs ${m.opponent}`}
            </option>
          ))}
        </select>
      )}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        placeholder="조언을 입력하세요"
        required
        className="w-full px-3 py-2 rounded-lg border border-suaza-border text-sm text-suaza-ink bg-white focus:outline-none focus:border-suaza-button resize-none"
      />
      <button
        type="submit"
        disabled={!content.trim()}
        className="self-end px-4 py-2 rounded-lg bg-suaza-button text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        등록
      </button>
    </form>
  );
}
