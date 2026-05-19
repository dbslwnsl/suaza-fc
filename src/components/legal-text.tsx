// 의존성 없이 약관 본문(간단한 마크다운)을 렌더링.
// 지원: #/## 헤더, 빈 줄 단락, 번호 리스트(1.), 대시 리스트(- )
export default function LegalText({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuf: { ordered: boolean; items: string[] } | null = null;

  const flushList = (key: number) => {
    if (!listBuf) return;
    const items = listBuf.items;
    blocks.push(
      listBuf.ordered ? (
        <ol
          key={`l-${key}`}
          className="list-decimal list-outside pl-5 flex flex-col gap-1 text-suaza-ink"
        >
          {items.map((t, idx) => (
            <li key={idx}>{t}</li>
          ))}
        </ol>
      ) : (
        <ul
          key={`l-${key}`}
          className="list-disc list-outside pl-5 flex flex-col gap-1 text-suaza-ink"
        >
          {items.map((t, idx) => (
            <li key={idx}>{t}</li>
          ))}
        </ul>
      ),
    );
    listBuf = null;
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList(i);
      return;
    }
    if (line.startsWith("### ")) {
      flushList(i);
      blocks.push(
        <h3 key={i} className="text-base font-semibold text-suaza-ink mt-2">
          {line.slice(4)}
        </h3>,
      );
      return;
    }
    if (line.startsWith("## ")) {
      flushList(i);
      blocks.push(
        <h2 key={i} className="text-lg font-bold text-suaza-ink mt-4">
          {line.slice(3)}
        </h2>,
      );
      return;
    }
    if (line.startsWith("# ")) {
      flushList(i);
      blocks.push(
        <h1 key={i} className="text-2xl font-bold text-suaza-ink mt-2">
          {line.slice(2)}
        </h1>,
      );
      return;
    }
    const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      if (!listBuf || !listBuf.ordered) {
        flushList(i);
        listBuf = { ordered: true, items: [] };
      }
      listBuf.items.push(numMatch[2]);
      return;
    }
    if (line.startsWith("- ")) {
      if (!listBuf || listBuf.ordered) {
        flushList(i);
        listBuf = { ordered: false, items: [] };
      }
      listBuf.items.push(line.slice(2));
      return;
    }
    flushList(i);
    blocks.push(
      <p key={i} className="text-sm text-suaza-ink leading-relaxed">
        {line}
      </p>,
    );
  });
  flushList(lines.length);

  return <div className="flex flex-col gap-2 text-sm">{blocks}</div>;
}
