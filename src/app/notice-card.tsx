"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import {
  CATEGORY_LABEL,
  formatPostDate,
  type PostCategory,
} from "@/lib/board/helpers";

type Notice = {
  id: string;
  title: string;
  content: string;
  category: PostCategory;
  created_at: string;
  author: { name: string; avatar_url: string | null } | null;
};

function Avatar({ name, src }: { name: string | null; src: string | null }) {
  const initial = name?.charAt(0) || "?";
  return (
    <div
      className="relative shrink-0 w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center"
      aria-hidden
    >
      {src ? (
        <Image
          src={src}
          alt={name ?? "프로필"}
          fill
          sizes="40px"
          className="object-cover"
        />
      ) : (
        <span className="text-sm font-bold text-suaza-ink">{initial}</span>
      )}
    </div>
  );
}

function CategoryBadge({ category }: { category: PostCategory }) {
  return (
    <span className="text-[11px] px-2 py-0.5 rounded bg-suaza-accent text-white font-medium shrink-0">
      {category && category !== "notice" ? CATEGORY_LABEL[category] : "공지"}
    </span>
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left bg-white sm:rounded-2xl sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] p-4 sm:p-5 rounded-xl border sm:border-0 border-suaza-border hover:bg-gray-50 transition flex flex-col gap-2 w-full"
      >
        <div className="flex items-center gap-3">
          <Avatar
            name={notice.author?.name ?? null}
            src={notice.author?.avatar_url ?? null}
          />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-bold text-suaza-ink truncate">
              {notice.author?.name ?? ""}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-suaza-ink-muted">
                {formatPostDate(notice.created_at)}
              </span>
              <CategoryBadge category={notice.category} />
            </div>
          </div>
        </div>
        <span className="font-bold text-suaza-ink truncate">
          {notice.title}
        </span>
        <p className="text-sm text-suaza-ink-muted whitespace-pre-wrap line-clamp-3">
          {notice.content}
        </p>
      </button>

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

              {/* 헤더 — 작성자 / 닫기 */}
              <div className="flex items-center gap-3 px-4 pt-3 pb-3 desktop:pt-4 border-b border-suaza-border">
                <Avatar
                  name={notice.author?.name ?? null}
                  src={notice.author?.avatar_url ?? null}
                />
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="font-bold text-suaza-ink truncate">
                    {notice.author?.name ?? ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-suaza-ink-muted">
                      {formatPostDate(notice.created_at)}
                    </span>
                    <CategoryBadge category={notice.category} />
                  </div>
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
