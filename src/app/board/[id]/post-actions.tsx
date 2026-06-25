"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { togglePostLike } from "@/lib/board/actions";
import { displayMemberName } from "@/lib/members/name";

export type Liker = { id: string; name: string; avatar_url?: string | null };

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
        className={`inline-flex h-7 items-center gap-1.5 px-3 rounded-full text-[12px] font-medium border transition ${
          liked
            ? "border-red-200 bg-red-50 text-red-600"
            : "border-suaza-border text-suaza-ink-muted hover:bg-gray-50"
        }`}
      >
        <svg
          width="15"
          height="15"
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
        className="inline-flex h-7 items-center gap-1.5 px-3 rounded-full text-[12px] font-medium border border-suaza-border text-suaza-ink-muted hover:bg-gray-50 transition"
      >
        <svg
          width="15"
          height="15"
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

      {/* 누가 좋아요를 눌렀는지 — 표시 + 바텀시트 (게시글·댓글 공용) */}
      <LikersLine likers={likers} />
    </div>
  );
}

// 좋아요 표시줄 — "xxx님이 좋아합니다" / "xxx 외 N명님이 좋아합니다".
// 이름/외N명을 누르면 좋아요한 사람 목록 바텀시트가 뜬다. 게시글·댓글 공용.
export function LikersLine({
  likers,
  small = false,
}: {
  likers: Liker[];
  /** true 면 한 단계 작은 글자(text-[11px]) — 댓글용 */
  small?: boolean;
}) {
  const [showLikers, setShowLikers] = useState(false);
  if (likers.length === 0) return null;
  return (
    <>
      <p
        className={`inline-flex items-center gap-1 text-suaza-ink-muted ${
          small ? "text-[10px]" : "text-xs"
        }`}
      >
        <span>
          {likers.length === 1 ? (
            // 1명: 이름을 누르면 목록 팝업 (클릭 가능 표시로 밑줄)
            <button
              type="button"
              onClick={() => setShowLikers(true)}
              className="font-medium text-suaza-ink underline underline-offset-2"
            >
              {displayMemberName(likers[0].name)}
            </button>
          ) : (
            // 2명 이상: 첫 이름은 일반 텍스트, "외 N명"만 팝업 트리거
            <>
              <span className="font-medium text-suaza-ink">
                {displayMemberName(likers[0].name)}
              </span>
              {" 외 "}
              <button
                type="button"
                onClick={() => setShowLikers(true)}
                className="font-medium text-suaza-ink underline underline-offset-2"
              >
                {likers.length - 1}명
              </button>
            </>
          )}
          님이 좋아합니다
        </span>
      </p>

      {showLikers && (
        <LikersModal likers={likers} onClose={() => setShowLikers(false)} />
      )}
    </>
  );
}

// 좋아요한 사람 목록 팝업 (인스타 좋아요 리스트 참고) — 프로필 카드(아바타+이름) 리스트.
function LikersModal({
  likers,
  onClose,
}: {
  likers: Liker[];
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="좋아요한 사람"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* 하단에서 올라오는 바텀시트 — 화면을 다 가리지 않도록 높이 제한 */}
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
        {/* 최대 4명 정도만 보이고, 그 이상은 스크롤 (한 줄 ≈ 3.5rem) */}
        <ul className="overflow-y-auto p-2 flex flex-col max-h-[14rem]">
          {likers.map((l) => (
            <li key={l.id}>
              <Link
                href={`/members/${l.id}`}
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition"
              >
                <LikerAvatar name={l.name} src={l.avatar_url ?? null} />
                <span className="font-medium text-suaza-ink text-sm truncate">
                  {displayMemberName(l.name)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

function LikerAvatar({ name, src }: { name: string; src: string | null }) {
  const initial = name?.charAt(0) || "?";
  return (
    <span className="relative shrink-0 w-9 h-9 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
      {src ? (
        <Image
          src={src}
          alt={name}
          fill
          sizes="36px"
          className="object-cover"
        />
      ) : (
        <span className="text-sm font-bold text-suaza-ink">{initial}</span>
      )}
    </span>
  );
}
