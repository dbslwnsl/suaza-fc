import Image from "next/image";
import Link from "next/link";

export default function PageHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="홈으로"
          className="relative w-9 h-9 rounded-full overflow-hidden block hover:opacity-80 transition shrink-0"
        >
          <Image
            src="/suaza-emblem.png"
            alt="홈"
            fill
            sizes="36px"
            className="object-cover"
          />
        </Link>
        <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
          {title}
        </h1>
      </div>
      {right}
    </header>
  );
}
