"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Intercepting Route 용 모달 셸.
 * - 배경(백드롭) 클릭 / ESC / 닫기(✕) → router.back() 으로 닫고 이전 URL 복원
 * - 모바일: 전체 화면 시트, 데스크탑: 가운데 정렬 패널(스크롤)
 */
export default function RouteModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const close = () => router.back();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.back();
    };
    document.addEventListener("keydown", onKey);
    // 모달 열린 동안 배경 스크롤 잠금
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [router]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={close}
        aria-hidden
      />
      <div className="relative z-10 flex max-h-[75vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
