"use client";

import { useRouter } from "next/navigation";
import { TAG_DEFAULT } from "@/lib/ui/tag-class";

export default function MonthSelect({
  year,
  month,
  sort,
}: {
  year: number;
  month: number;
  sort?: string;
}) {
  const router = useRouter();
  const label = month >= 1 && month <= 12 ? `${month}월` : "전체";

  return (
    <div className="relative inline-flex">
      {/* 시각 표현: 연도 버튼과 동일한 박스. chevron 은 텍스트 옆에 inline */}
      <span aria-hidden className={TAG_DEFAULT}>
        {label}
        <span className="ml-1 text-[9px] text-suaza-ink-muted">▼</span>
      </span>

      {/* 실제 컨트롤 */}
      <select
        aria-label="월 선택"
        value={String(month)}
        onChange={(e) => {
          const m = Number(e.target.value);
          const p = new URLSearchParams();
          p.set("tab", "season");
          p.set("year", String(year));
          if (m >= 1 && m <= 12) p.set("month", String(m));
          if (sort && sort !== "goals") p.set("sort", sort);
          router.push(`/members?${p.toString()}`);
        }}
        className="absolute inset-0 opacity-0 cursor-pointer"
      >
        <option value="0">전체</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>
            {m}월
          </option>
        ))}
      </select>
    </div>
  );
}
