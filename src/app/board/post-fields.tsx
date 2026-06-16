"use client";

import { useState } from "react";
import {
  CATEGORY_LABEL,
  POST_CATEGORIES,
  canHomeExpose,
  canUseCategory,
  type PostCategory,
} from "@/lib/board/helpers";

/**
 * 게시글 작성/수정 폼의 카테고리 select + 홈 노출 체크박스.
 * 선택한 카테고리에 따라 노출 체크박스 표시 여부가 바뀌므로 클라이언트 컴포넌트로 분리.
 */
export default function PostFields({
  role,
  title,
  defaultCategory,
  defaultIsNotice = false,
}: {
  role: string;
  title: string;
  defaultCategory: PostCategory;
  defaultIsNotice?: boolean;
}) {
  const [category, setCategory] = useState<PostCategory>(defaultCategory);
  const showExpose = canHomeExpose(role, title, category);

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-suaza-ink text-base">카테고리</span>
        {/* 폼 제출용 — 선택한 카테고리 값 */}
        <input type="hidden" name="category" value={category} />
        <div className="flex items-center flex-wrap gap-1.5">
          {POST_CATEGORIES.filter((c) => canUseCategory(c, title)).map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={active}
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition shrink-0 ${
                  active
                    ? "bg-suaza-ink text-white border border-suaza-ink"
                    : "bg-white text-suaza-ink border border-suaza-border hover:bg-gray-100"
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            );
          })}
        </div>
      </div>

      {showExpose && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="is_notice"
            defaultChecked={defaultIsNotice}
            className="w-4 h-4 rounded border-suaza-border accent-suaza-button"
          />
          <span className="text-sm text-suaza-ink">
            <span className="text-suaza-accent font-medium">홈 화면</span>에 노출
          </span>
        </label>
      )}
    </>
  );
}
