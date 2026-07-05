"use client";

import { useEffect } from "react";

/**
 * 알림 딥링크용 — URL 해시(#comment-... 등)가 가리키는 요소로 스크롤하고 잠시 강조한다.
 * 댓글 목록이 클라이언트에서 렌더된 뒤 실행되도록 마운트 시 1회 동작.
 * @param prefix 해시가 이 접두사로 시작할 때만 동작 (예: "comment-", "coach-comment-")
 */
export function useScrollToHash(prefix: string) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || !hash.startsWith(`#${prefix}`)) return;
    const id = hash.slice(1);
    // 렌더 완료 후 스크롤 (목록 페인트 여유)
    const t = setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("hash-highlight");
      setTimeout(() => el.classList.remove("hash-highlight"), 2200);
    }, 150);
    return () => clearTimeout(t);
  }, [prefix]);
}
