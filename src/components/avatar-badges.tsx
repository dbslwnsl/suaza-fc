import type { MemberBadge } from "@/lib/members/badges";

/**
 * 아바타 모서리에 뱃지를 얹는 오버레이.
 * - 수상(awardBadges): 좌상단, 아래로 누적
 * - 직책(titleBadges): 기본 우하단, 위로 누적. titlePlacement="bottom-center" 시 가운데 하단.
 *
 * 부모는 `relative` 여야 하며, 아바타 원의 `overflow-hidden` 바깥에 두어야
 * 뱃지가 잘리지 않는다.
 */
export default function AvatarBadges({
  titleBadges = [],
  awardBadges = [],
  size = "sm",
  bottomRightClassName = "-bottom-1 -right-1",
  titlePlacement = "bottom-right",
}: {
  titleBadges?: MemberBadge[];
  awardBadges?: MemberBadge[];
  size?: "xs" | "sm";
  /** 우하단 뱃지 컨테이너 위치 오버라이드 (카메라 어포던스와 겹치지 않게) */
  bottomRightClassName?: string;
  /** 직책 뱃지 위치 — bottom-right(기본) / bottom-center */
  titlePlacement?: "bottom-right" | "bottom-center";
}) {
  const sizeClass =
    size === "xs" ? "px-1 py-0.5 text-[8px]" : "px-1.5 py-0.5 text-[9px]";

  const pill = (b: MemberBadge) => (
    <span
      key={b.key}
      className={`rounded-full font-bold leading-none shadow-sm whitespace-nowrap ${sizeClass} ${b.className}`}
    >
      {b.label}
    </span>
  );

  const titleContainerCls =
    titlePlacement === "bottom-center"
      ? "absolute z-10 -bottom-1 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 pointer-events-none"
      : `absolute z-10 flex flex-col items-end gap-0.5 pointer-events-none ${bottomRightClassName}`;

  return (
    <>
      {awardBadges.length > 0 && (
        <div className="absolute -top-1 -left-1 z-10 flex flex-col items-start gap-0.5 pointer-events-none">
          {awardBadges.map(pill)}
        </div>
      )}
      {titleBadges.length > 0 && (
        <div className={titleContainerCls}>{titleBadges.map(pill)}</div>
      )}
    </>
  );
}
