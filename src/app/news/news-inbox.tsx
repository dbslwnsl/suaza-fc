"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/actions";

export type NewsItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  created_at: string;
  read_at: string | null;
};

// 알림 종류별 아이콘(한 글자) + 색상 — 알림 설정 화면과 동일한 시각 언어.
const TYPE_BADGE: Record<string, { char: string; color: string }> = {
  new_post: { char: "글", color: "#3B82F6" },
  notice: { char: "공", color: "#EF4444" },
  comment: { char: "댓", color: "#F97316" },
  match_schedule: { char: "일", color: "#22C55E" },
  team_change: { char: "팀", color: "#6366F1" },
  match_result: { char: "결", color: "#1E293B" },
  new_member: { char: "멤", color: "#14B8A6" },
  points: { char: "포", color: "#F97316" },
};
function badgeFor(type: string) {
  return TYPE_BADGE[type] ?? { char: "알", color: "#9CA3AF" };
}

type Category = "community" | "match" | "club";
// 알림 종류 → 카테고리 매핑 (필터용)
const CATEGORY_OF: Record<string, Category> = {
  new_post: "community",
  notice: "community",
  comment: "community",
  match_schedule: "match",
  team_change: "match",
  match_result: "match",
  new_member: "club",
  points: "club",
};

const FILTERS: { key: "all" | Category; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "community", label: "커뮤니티" },
  { key: "match", label: "경기" },
  { key: "club", label: "클럽활동" },
];

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default function NewsInbox({ initial }: { initial: NewsItem[] }) {
  const router = useRouter();
  const [list, setList] = useState<NewsItem[]>(initial);
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [, startTransition] = useTransition();

  const unreadCount = useMemo(
    () => list.filter((n) => n.read_at == null).length,
    [list],
  );
  const visible = useMemo(
    () =>
      filter === "all"
        ? list
        : list.filter((n) => CATEGORY_OF[n.type] === filter),
    [list, filter],
  );

  function applyLocalRead(ids: Set<string>) {
    const now = new Date().toISOString();
    setList((prev) =>
      prev.map((n) =>
        ids.has(n.id) && n.read_at == null ? { ...n, read_at: now } : n,
      ),
    );
  }

  function handleMarkOne(id: string) {
    applyLocalRead(new Set([id]));
    startTransition(async () => {
      await markNotificationRead(id);
      router.refresh();
    });
  }

  function handleMarkAll() {
    if (unreadCount === 0) return;
    applyLocalRead(new Set(list.map((n) => n.id)));
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  function handleOpen(n: NewsItem) {
    // 진입 시에도 읽음 처리 (낙관적 + 서버). 이동이 있으면 새 라우트 렌더로 뱃지 갱신됨.
    if (n.read_at == null) {
      applyLocalRead(new Set([n.id]));
      startTransition(() => {
        markNotificationRead(n.id);
      });
    }
    if (n.url) router.push(n.url);
  }

  return (
    <>
      {/* 상단: 제목 + 모두 읽음 + 카테고리 필터 (스크롤해도 고정) */}
      <div className="sticky top-0 z-10 bg-white border-b border-suaza-border">
        <header className="relative flex items-center justify-center h-14">
          <h1 className="text-lg font-bold text-suaza-ink">새소식</h1>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={unreadCount === 0}
            className="absolute right-3 text-[13px] font-medium text-suaza-ink-muted hover:text-suaza-ink disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            모두 읽음
          </button>
        </header>
        <div className="max-w-[600px] mx-auto w-full flex gap-2 px-4 pb-3 overflow-x-auto">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                  active
                    ? "bg-suaza-button text-white"
                    : "bg-suaza-bg text-suaza-ink-muted hover:text-suaza-ink"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-[600px] mx-auto pb-12">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
            <span className="text-5xl" aria-hidden>
              🔔
            </span>
            <p className="text-base font-bold text-suaza-ink">
              {list.length === 0
                ? "아직 받은 알림이 없어요"
                : "이 카테고리의 알림이 없어요"}
            </p>
            {list.length === 0 && (
              <p className="text-sm text-suaza-ink-muted leading-relaxed">
                새 경기 일정·게시글·댓글 등 소식이 도착하면
                <br />
                여기에 모아서 보여드릴게요.
              </p>
            )}
          </div>
        ) : (
          <ul className="mt-3 mx-4 bg-white rounded-2xl overflow-hidden border border-suaza-border/60">
            {visible.map((n, i) => {
              const badge = badgeFor(n.type);
              const unread = n.read_at == null;
              return (
                <li
                  key={n.id}
                  className={`flex items-center gap-3 pl-4 pr-4 transition ${
                    unread ? "bg-red-50/40" : "bg-white"
                  } hover:bg-gray-50`}
                >
                  {/* 본문 클릭 → 이동(+읽음) */}
                  <button
                    type="button"
                    onClick={() => handleOpen(n)}
                    className="flex flex-1 min-w-0 items-center gap-3 text-left"
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold text-[15px] text-white"
                      style={{ backgroundColor: badge.color }}
                    >
                      {badge.char}
                    </span>
                    <div
                      className={`flex flex-1 min-w-0 items-start gap-2 py-3 ${
                        i === visible.length - 1
                          ? ""
                          : "border-b border-gray-100"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-suaza-ink text-[15px] leading-tight flex items-center gap-1.5">
                          {unread && (
                            <span
                              className="inline-block w-2 h-2 shrink-0 rounded-full bg-suaza-accent"
                              aria-label="안읽음"
                            />
                          )}
                          <span className="truncate">{n.title}</span>
                        </p>
                        {n.body && (
                          <p className="text-[13px] text-suaza-ink-muted mt-0.5 leading-snug line-clamp-2">
                            {n.body}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] text-suaza-ink-faint pt-0.5 tabular-nums">
                        {relativeTime(n.created_at)}
                      </span>
                    </div>
                  </button>

                  {/* 진입 없이 읽음 처리 — 안읽음일 때만 노출 */}
                  {unread && (
                    <button
                      type="button"
                      onClick={() => handleMarkOne(n.id)}
                      aria-label="읽음 처리"
                      title="읽음 처리"
                      className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full border border-suaza-border text-suaza-ink-muted hover:bg-suaza-bg hover:text-suaza-ink transition"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
