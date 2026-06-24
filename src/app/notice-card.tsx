"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { type PostCategory } from "@/lib/board/helpers";

type Notice = {
  id: string;
  title: string;
  content: string;
  category: PostCategory;
  created_at: string;
  author: { name: string; avatar_url: string | null } | null;
};

// "2026.06.16 18:16" 형태 (Asia/Seoul 고정)
function formatNoticeDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}.${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}

const AVATAR_COLORS = [
  "#3B82F6",
  "#8B5CF6",
  "#F97316",
  "#10B981",
  "#EF4444",
  "#14B8A6",
  "#F59E0B",
  "#EC4899",
];
function colorFor(name: string | null): string {
  const s = name || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({
  name,
  src,
  size = 22,
}: {
  name: string | null;
  src: string | null;
  size?: number;
}) {
  const initial = name?.charAt(0) || "?";
  return (
    <span
      className="relative inline-flex shrink-0 rounded-full overflow-hidden items-center justify-center"
      style={{
        width: size,
        height: size,
        backgroundColor: src ? "#f3f4f6" : colorFor(name),
      }}
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
          className="font-bold text-white"
          style={{ fontSize: Math.round(size * 0.45) }}
        >
          {initial}
        </span>
      )}
    </span>
  );
}

function Megaphone() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-suaza-accent shrink-0"
      aria-hidden
    >
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

// 좌측 "📢 공지" 라벨 + 우측 날짜·시간
function NoticeHeader({ createdAt }: { createdAt: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5">
        <Megaphone />
        <span className="font-bold text-suaza-ink text-sm">공지</span>
      </span>
      <span className="text-xs text-suaza-ink-muted shrink-0">
        {formatNoticeDate(createdAt)}
      </span>
    </div>
  );
}

/** 홈 공지 카드 — 클릭 시 본문을 팝업(모달)으로 표시. */
export default function NoticeCard({ notice }: { notice: Notice }) {
  const [open, setOpen] = useState(false);

  // 모달 열림 동안 body 스크롤 잠금 + ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <div className="flex flex-col gap-2 w-full">
        <NoticeHeader createdAt={notice.created_at} />
        <span className="font-bold text-suaza-ink text-lg truncate">
          {notice.title}
        </span>
        <p className="text-sm text-suaza-ink-muted whitespace-pre-wrap line-clamp-3">
          {notice.content}
        </p>

        {/* 작성자 + 자세히 보기 */}
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <Avatar
              name={notice.author?.name ?? null}
              src={notice.author?.avatar_url ?? null}
            />
            <span className="text-sm font-medium text-suaza-ink truncate">
              {notice.author?.name ?? ""}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="공지 더보기"
            className="shrink-0 inline-flex items-center text-suaza-ink-muted hover:text-suaza-ink transition"
          >
            <svg
              className="w-4 h-4 text-suaza-ink-faint"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end desktop:items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label="공지"
          >
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
            />
            <div className="relative w-full max-w-[600px] desktop:max-w-[560px] bg-white rounded-t-2xl desktop:rounded-2xl shadow-xl flex flex-col max-h-[85vh] desktop:max-h-[80vh]">
              {/* 모바일 드래그 핸들 */}
              <div className="pt-2 flex justify-center desktop:hidden">
                <span className="w-9 h-1 rounded-full bg-gray-300" aria-hidden />
              </div>

              {/* 헤더 — 📢 공지 / 날짜 / 닫기 */}
              <div className="flex items-center gap-2 px-4 pt-3 pb-3 desktop:pt-4 border-b border-suaza-border">
                <div className="flex-1 min-w-0">
                  <NoticeHeader createdAt={notice.created_at} />
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="닫기"
                  className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full text-suaza-ink-muted hover:text-suaza-ink hover:bg-gray-100 transition"
                >
                  ✕
                </button>
              </div>

              {/* 본문 — 길면 스크롤 */}
              <div className="px-4 py-4 overflow-y-auto flex flex-col gap-3">
                <h2 className="font-bold text-suaza-ink text-lg">
                  {notice.title}
                </h2>
                <p className="text-sm text-suaza-ink whitespace-pre-wrap leading-relaxed">
                  {notice.content}
                </p>
              </div>

              {/* 푸터 — 게시판 원문으로 이동 */}
              <div className="px-4 py-3 border-t border-suaza-border flex justify-end">
                <Link
                  href={`/board/${notice.id}`}
                  className="text-sm font-medium text-suaza-accent hover:underline"
                >
                  게시판에서 보기
                </Link>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
