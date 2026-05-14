export default function BoardPage() {
  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-6 sm:px-8 py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto bg-white sm:rounded-2xl sm:p-12 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-6">
        <header>
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            게시판
          </h1>
        </header>
        <div className="flex flex-col items-center justify-center text-center py-16 gap-2">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-gray-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <p className="font-bold text-suaza-ink">준비 중입니다</p>
          <p className="text-sm text-suaza-ink-muted">곧 만나요 ⚽</p>
        </div>
      </div>
    </main>
  );
}
