"use client";

import { useState, useTransition } from "react";
import { togglePostLike } from "@/lib/board/actions";
import { displayMemberName } from "@/lib/members/name";

export type Liker = { id: string; name: string };

/**
 * 게시글 본문 아래(댓글 가로선 위) 좋아요 + 공유 버튼 행.
 * - 좋아요: 하트 토글 + 카운트 (낙관적 업데이트, 서버 토글 후 revalidate 동기화)
 * - 공유: Web Share API (모바일) → 미지원 시 링크 클립보드 복사
 */
export default function PostActions({
  postId,
  initialLikes,
  initialLiked,
  likers = [],
}: {
  postId: string;
  initialLikes: number;
  initialLiked: boolean;
  /** 좋아요를 누른 회원 목록 (서버값). 누가 눌렀는지 표시용. */
  likers?: Liker[];
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialLikes);
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [showLikers, setShowLikers] = useState(false);

  const toggleLike = () => {
    const next = !liked;
    // 낙관적 반영
    setLiked(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    startTransition(() => togglePostLike(postId));
  };

  const share = async () => {
    const url = `${window.location.origin}/board/${postId}`;
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // 사용자가 공유 취소 → 무시
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // 권한 거부 등 — 조용히 실패
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleLike}
        aria-pressed={liked}
        aria-label="좋아요"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition ${
          liked
            ? "border-red-200 bg-red-50 text-red-600"
            : "border-suaza-border text-suaza-ink-muted hover:bg-gray-50"
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
        <span className="tabular-nums">{count}</span>
      </button>

      <button
        type="button"
        onClick={share}
        aria-label="게시글 링크 공유"
        title="게시글 링크 공유"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-suaza-border text-suaza-ink-muted hover:bg-gray-50 transition"
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
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        {copied ? "복사됨" : "공유"}
      </button>
      </div>

      {/* 누가 좋아요를 눌렀는지 — 클릭하면 이름 목록 펼침 */}
      {likers.length > 0 && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setShowLikers((v) => !v)}
            aria-expanded={showLikers}
            className="self-start inline-flex items-center gap-1 text-xs text-suaza-ink-muted hover:text-suaza-ink transition"
          >
            <span className="text-red-500" aria-hidden>
              ♥
            </span>
            <span>
              {displayMemberName(likers[0].name)}
              {likers.length > 1 ? ` 외 ${likers.length - 1}명` : ""}님이 좋아합니다
            </span>
            <svg
              aria-hidden
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${showLikers ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showLikers && (
            <div className="flex flex-wrap gap-1">
              {likers.map((l) => (
                <span
                  key={l.id}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-suaza-ink"
                >
                  {displayMemberName(l.name)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
