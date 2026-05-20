export function formatPostDate(iso: string): string {
  // timeZone 을 명시하지 않으면 서버 로컬 타임존을 사용하므로
  // Vercel(UTC)과 로컬(KST) 표시가 어긋남. Asia/Seoul 고정.
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}
