"use client";

export default function LegalBackButton() {
  return (
    <button
      type="button"
      onClick={() => {
        // '보기'로 열린 새 탭이면 닫고, 직접 접근 등 닫히지 않으면 뒤로/홈으로 폴백
        window.close();
        // window.close() 가 무시된 경우(스크립트가 연 창이 아님) 대비
        setTimeout(() => {
          if (!window.closed) {
            if (window.history.length > 1) window.history.back();
            else window.location.href = "/signup";
          }
        }, 100);
      }}
      className="text-sm text-suaza-ink-muted hover:underline self-start"
    >
      ← 돌아가기
    </button>
  );
}
