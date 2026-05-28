"use client";

import Image from "next/image";
import { useOptimistic, useState, useTransition } from "react";
import {
  createCoachComment,
  deleteCoachComment,
  updateCoachComment,
} from "./actions";
import {
  TITLE_LABEL,
  TITLE_BADGE,
  type MemberTitle,
} from "@/lib/members/positions";

export type MatchOption = {
  id: string;
  match_date: string;
  opponent: string;
};

export type CoachComment = {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  match_id: string | null;
  match: { id: string; match_date: string; opponent: string } | null;
  author: { name: string; title: string | null; avatar_url: string | null } | null;
};

type OptimisticAction =
  | { type: "add"; comment: CoachComment }
  | { type: "update"; id: string; content: string }
  | { type: "delete"; id: string };

// 경기 라벨: "5월 16일 · 자체전" / "5월 16일 · 상대전 vs OO"
function matchLabel(m: { match_date: string; opponent: string }): string {
  const d = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(m.match_date));
  const type =
    m.opponent === "자체전" ? "자체전" : `상대전 vs ${m.opponent}`;
  return `${d} · ${type}`;
}

function reduce(
  state: CoachComment[],
  action: OptimisticAction,
): CoachComment[] {
  if (action.type === "add") return [...state, action.comment];
  if (action.type === "update") {
    const now = new Date().toISOString();
    return state.map((c) =>
      c.id === action.id ? { ...c, content: action.content, updated_at: now } : c,
    );
  }
  return state.filter((c) => c.id !== action.id);
}

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
  viewerIsSelf: boolean;
}) {
  const [optimistic, dispatch] = useOptimistic(comments, reduce);
  const [, startTransition] = useTransition();

  const submitCreate = (content: string, matchId: string | null) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    const match = matchId ? matches.find((m) => m.id === matchId) ?? null : null;
    startTransition(async () => {
      const now = new Date().toISOString();
      dispatch({
        type: "add",
        comment: {
          id: `temp-${Date.now()}-${Math.random()}`,
          content: trimmed,
          created_at: now,
          updated_at: now,
          author_id: myUserId,
          match_id: matchId,
          match: match
            ? {
                id: match.id,
                match_date: match.match_date,
                opponent: match.opponent,
              }
            : null,
          author: { name: myName ?? "", title: myTitle, avatar_url: myAvatarUrl },
        },
      });
      await createCoachComment(memberId, trimmed, matchId);
    });
  };

  const submitUpdate = (commentId: string, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    startTransition(async () => {
      dispatch({ type: "update", id: commentId, content: trimmed });
      await updateCoachComment(commentId, memberId, trimmed);
    });
  };

  const submitDelete = (commentId: string) => {
    startTransition(async () => {
      dispatch({ type: "delete", id: commentId });
      await deleteCoachComment(commentId, memberId);
    });
  };

  return (
    <section className="flex flex-col gap-3 pt-6 border-t border-suaza-border">
      <div className="flex items-baseline gap-2">
        <h2 className="text-suaza-ink text-base font-medium">감독&코치 코멘트</h2>
        <span className="text-xs text-suaza-ink-muted">{optimistic.length}</span>
      </div>
      <p className="text-xs text-suaza-ink-faint -mt-1">
        {canWrite
          ? `${memberName} 회원에게 남기는 감독·코치 조언입니다. 본인과 감독·코치만 볼 수 있어요.`
          : viewerIsSelf
            ? "감독·코치가 남긴 조언입니다. 나와 감독·코치만 볼 수 있어요."
            : "감독·코치만 볼 수 있는 코멘트입니다."}
      </p>

      {optimistic.length === 0 ? (
        <p className="text-sm text-suaza-ink-faint py-3 text-center bg-suaza-bg/40 rounded-lg">
          {canWrite ? "첫 코멘트를 남겨보세요" : "아직 등록된 코멘트가 없습니다"}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {optimistic.map((c) => (
            <li key={c.id}>
              <CommentItem
                comment={c}
                canEdit={canWrite && c.author_id === myUserId}
                onUpdate={submitUpdate}
                onDelete={submitDelete}
              />
            </li>
          ))}
        </ul>
      )}

      {canWrite && <CommentForm onSubmit={submitCreate} matches={matches} />}
    </section>
  );
}

function CommentForm({
  onSubmit,
  initial = "",
  matches,
  autoFocus,
  onCancel,
  submitLabel = "등록",
}: {
  onSubmit: (content: string, matchId: string | null) => void;
  initial?: string;
  matches?: MatchOption[];
  autoFocus?: boolean;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [content, setContent] = useState(initial);
  const [matchId, setMatchId] = useState("");
  const showMatchSelect = !!matches && matches.length > 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!content.trim()) return;
        onSubmit(content, matchId || null);
        if (!onCancel) {
          setContent("");
          setMatchId("");
        }
        onCancel?.();
      }}
      className="flex flex-col gap-2"
    >
      {showMatchSelect && (
        <select
          value={matchId}
          onChange={(e) => setMatchId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-suaza-border text-sm text-suaza-ink bg-white focus:outline-none focus:border-suaza-button"
        >
          <option value="">일반 코멘트 (경기 선택 안 함)</option>
          {matches!.map((m) => (
            <option key={m.id} value={m.id}>
              {matchLabel(m)}
            </option>
          ))}
        </select>
      )}
      <textarea
        name="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        autoFocus={autoFocus}
        placeholder="조언을 입력하세요"
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

function CommentItem({
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
  const edited = comment.updated_at && comment.updated_at !== comment.created_at;
  const isTemp = comment.id.startsWith("temp-");
  const authorTitle = (comment.author?.title ?? "player") as MemberTitle;

  if (editing) {
    return (
      <CommentForm
        initial={comment.content}
        autoFocus
        submitLabel="저장"
        onCancel={() => setEditing(false)}
        onSubmit={(content) => {
          onUpdate(comment.id, content);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div
      className={`flex flex-col gap-1.5 p-3 rounded-lg border border-suaza-border bg-suaza-bg/40 ${
        isTemp ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 text-xs text-suaza-ink-muted">
          <CommentAvatar
            name={comment.author?.name ?? null}
            src={comment.author?.avatar_url ?? null}
          />
          <span className="font-medium text-suaza-ink truncate">
            {comment.author?.name ?? "(알 수 없음)"}
          </span>
          <span
            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
              TITLE_BADGE[authorTitle] ?? TITLE_BADGE.player
            }`}
          >
            {TITLE_LABEL[authorTitle] ?? "회원"}
          </span>
          <span>·</span>
          <span className="shrink-0">{formatDate(comment.created_at)}</span>
          {edited && !isTemp && (
            <span className="text-suaza-ink-faint shrink-0">(수정됨)</span>
          )}
        </div>
        {canEdit && !isTemp && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="h-6 inline-flex items-center text-[11px] px-2 rounded text-suaza-ink-muted hover:text-suaza-ink hover:bg-gray-100 transition"
            >
              수정
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("이 코멘트를 삭제하시겠습니까?")) {
                  onDelete(comment.id);
                }
              }}
              className="h-6 inline-flex items-center text-[11px] px-2 rounded text-red-500 hover:text-red-600 hover:bg-red-50 transition"
            >
              삭제
            </button>
          </div>
        )}
      </div>
      {comment.match && (
        <span className="self-start inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
          <span aria-hidden>📅</span>
          {matchLabel(comment.match)}
        </span>
      )}
      <p className="text-sm text-suaza-ink whitespace-pre-wrap leading-relaxed">
        {comment.content}
      </p>
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

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}
