"use client";

export default function BackButton({
  label = "←",
  fallbackHref = "/",
  className = "text-sm text-suaza-ink-muted hover:underline",
}: {
  label?: string;
  /** 히스토리가 없을 때 이동할 경로 */
  fallbackHref?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") {
          if (window.history.length > 1) window.history.back();
          else window.location.href = fallbackHref;
        }
      }}
      className={className}
    >
      {label}
    </button>
  );
}
