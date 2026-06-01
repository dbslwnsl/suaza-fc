"use client";

import { useState } from "react";

/**
 * 경기 상세 페이지의 링크를 공유.
 * - 모바일: Web Share API (카카오·문자 등 OS 공유 시트)
 * - 그 외(데스크탑 또는 Web Share 미지원): URL 클립보드 복사 + "복사됨" 피드백
 */
export default function MatchShareButton({
  matchId,
  opponent,
  matchDate,
}: {
  matchId: string;
  opponent?: string;
  matchDate?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/matches/${matchId}`;
    const titleBase = opponent ? `vs ${opponent}` : "SUAZA FC 경기";
    const text = matchDate
      ? `${titleBase} · ${new Intl.DateTimeFormat("ko-KR", {
          timeZone: "Asia/Seoul",
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(matchDate))}`
      : titleBase;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: titleBase, text, url });
        return;
      } catch {
        // 사용자가 공유 취소 → 무시. 아래 클립보드 fallback 으로 떨어지지 않게 return.
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
    <button
      type="button"
      onClick={handleShare}
      title="경기 링크 공유"
      aria-label="경기 링크 공유"
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
    >
      <svg
        width="12"
        height="12"
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
  );
}
