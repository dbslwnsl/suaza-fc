"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { quarterShortLabel } from "@/lib/matches/helpers";

// 터치 기기 여부 — SSR 안전하게 읽기 (마운트 후 클라이언트 값). 변하지 않으므로 구독은 no-op.
const subscribeNoop = () => () => {};
const getTouchSnapshot = () =>
  typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);
const getTouchServerSnapshot = () => false;

export type Member = {
  id: string;
  name: string;
  jersey_number?: number | null;
  attending_quarters?: number[] | null;
  is_injured?: boolean | null;
  on_leave?: boolean | null;
  isGoalKing?: boolean;
  isAssistKing?: boolean;
  isCleanSheetKing?: boolean;
  isRefereeKing?: boolean;
};

type Status = "attending" | "absent" | "undecided" | null;

type ByStatus = {
  attending: Member[];
  absent: Member[];
  undecided: Member[];
};

// data-drop-status 인코딩: null(미투표) → "none"
const encodeStatus = (s: Status) => (s == null ? "none" : s);
const decodeStatus = (s: string): Status => (s === "none" ? null : (s as Status));

export default function AttendanceManagerBoard({
  byStatus,
  nonVoters,
  totalQuarters = 4,
  quarterActions,
  readonly = false,
  onDrop,
}: {
  byStatus: ByStatus;
  nonVoters: Member[];
  totalQuarters?: number;
  quarterActions?: (string | null)[] | null;
  /** true 면 드래그앤드롭을 막고 보기 전용으로 렌더 (일반 회원 화면) */
  readonly?: boolean;
  /** 드롭 시 부모의 통합 낙관 상태에 위임 — 칩·상단 통계가 한 번의 렌더로 함께 갱신된다.
   *  byStatus/nonVoters 는 이미 부모에서 낙관 반영된 값이므로 보드는 순수 표시만 한다. */
  onDrop?: (playerId: string, status: Status) => void;
}) {
  const [dragging, setDragging] = useState(false);

  // 터치 기기 여부 — 터치에서는 네이티브 HTML5 드래그가 동작하지 않으므로
  // 포인터 기반 롱프레스 드래그를 사용한다. (마우스는 기존 네이티브 DnD 유지)
  const isTouch = useSyncExternalStore(
    subscribeNoop,
    getTouchSnapshot,
    getTouchServerSnapshot,
  );

  // 포인터 드래그(터치) 상태 — 손가락 따라다니는 고스트 + 현재 올라간 섹션
  const [pdrag, setPdrag] = useState<{
    name: string;
    x: number;
    y: number;
    overStatus?: Status;
  } | null>(null);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpStart = useRef<{ x: number; y: number } | null>(null);
  const dragMember = useRef<Member | null>(null);
  // 현재 제스처 모드: 롱프레스 대기 / 수동 스크롤 / 드래그
  const modeRef = useRef<"pending" | "scroll" | "drag" | null>(null);
  // 수동 스크롤용 직전 Y 좌표
  const lastYRef = useRef(0);

  useEffect(() => {
    return () => {
      if (lpTimer.current) clearTimeout(lpTimer.current);
    };
  }, []);

  const handleDrop = (playerId: string, status: Status) => {
    if (readonly) return;
    onDrop?.(playerId, status);
  };

  // 손가락 좌표 아래의 드롭 섹션 status 를 찾는다. 섹션 위가 아니면 undefined.
  function statusFromPoint(x: number, y: number): Status | undefined {
    let el = document.elementFromPoint(x, y) as HTMLElement | null;
    while (el) {
      const s = el.dataset?.dropStatus;
      if (s != null) return decodeStatus(s);
      el = el.parentElement;
    }
    return undefined;
  }

  function cancelLongPress() {
    if (lpTimer.current) {
      clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  }

  function startPointerDrag(member: Member, e: React.PointerEvent) {
    if (readonly) return;
    lpStart.current = { x: e.clientX, y: e.clientY };
    lastYRef.current = e.clientY;
    modeRef.current = "pending";
    const target = e.currentTarget as HTMLElement;
    const ptrId = e.pointerId;
    const sx = e.clientX;
    const sy = e.clientY;
    // 손가락이 칩을 벗어나도 move/up 을 계속 받도록 캡처 (수동 스크롤·드래그 추적용)
    try {
      target.setPointerCapture(ptrId);
    } catch {}
    cancelLongPress();
    lpTimer.current = setTimeout(() => {
      if (modeRef.current !== "pending") return; // 그 사이 스크롤로 전환됐으면 취소
      modeRef.current = "drag";
      dragMember.current = member;
      setDragging(true);
      setPdrag({ name: member.name, x: sx, y: sy, overStatus: undefined });
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(30);
        } catch {}
      }
    }, 250);
  }

  function movePointerDrag(e: React.PointerEvent) {
    // 롱프레스 인식 전: 일정 이상 움직이면 = 스크롤 의도 → 롱프레스 취소하고 수동 스크롤 모드로.
    if (modeRef.current === "pending" && lpStart.current) {
      const dx = e.clientX - lpStart.current.x;
      const dy = e.clientY - lpStart.current.y;
      if (dx * dx + dy * dy > 64) {
        cancelLongPress();
        modeRef.current = "scroll";
      }
    }
    // 수동 스크롤: touch-action:none 이라 네이티브 스크롤이 없으므로 직접 페이지를 스크롤한다.
    if (modeRef.current === "scroll") {
      const delta = lastYRef.current - e.clientY;
      lastYRef.current = e.clientY;
      window.scrollBy(0, delta);
      return;
    }
    // 드래그(롱프레스 인식 후): 고스트 위치 + 올라간 섹션 갱신 (스크롤 안 함)
    if (modeRef.current === "drag" && dragMember.current) {
      const s = statusFromPoint(e.clientX, e.clientY);
      setPdrag((prev) =>
        prev ? { ...prev, x: e.clientX, y: e.clientY, overStatus: s } : prev,
      );
    }
  }

  function endPointerDrag(e: React.PointerEvent) {
    if (modeRef.current === "drag" && dragMember.current) {
      const s = statusFromPoint(e.clientX, e.clientY);
      if (s !== undefined) handleDrop(dragMember.current.id, s);
    }
    dragMember.current = null;
    modeRef.current = null;
    setPdrag(null);
    setDragging(false);
    cancelLongPress();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  }

  const pointerDrag = isTouch && !readonly
    ? {
        onStart: startPointerDrag,
        onMove: movePointerDrag,
        onEnd: endPointerDrag,
      }
    : null;

  // 참석을 전체/일부로 분리
  const isFull = (m: Member) =>
    m.attending_quarters == null || m.attending_quarters.length >= totalQuarters;
  const full = byStatus.attending.filter(isFull);
  const partial = byStatus.attending.filter((m) => !isFull(m));

  return (
    <div className="flex flex-col gap-3">
      {/* 전체 참여 — 참석 드롭 타깃 */}
      <DropSection
        label="전체 참여"
        count={full.length}
        status="attending"
        dotColor="#22C55E"
        dragging={dragging}
        hoverClass="ring-2 ring-green-400"
        onDrop={handleDrop}
        readonly={readonly}
        pointerOver={pdrag?.overStatus === "attending"}
      >
        {full.length === 0 ? (
          <span className="text-sm text-suaza-ink-faint">—</span>
        ) : (
          full.map((m) => (
            <Chip
              key={m.id}
              member={m}
              chipClass="border-green-300 text-suaza-ink"
              onDragStateChange={setDragging}
              readonly={readonly}
              isTouch={isTouch}
              pointerDrag={pointerDrag}
            />
          ))
        )}
      </DropSection>

      {/* 일부 참여 — 드롭 타깃 아님(쿼터는 본인이 선택). 끌어내기만 가능.
          DropSection 과 동일한 패딩/테두리로 좌측 정렬을 맞춤. */}
      {partial.length > 0 && (
        <div className="flex flex-col gap-1.5 p-1.5 border border-transparent">
          <span className="self-start inline-flex items-center gap-1.5 text-xs font-bold text-suaza-ink">
            <span
              className="shrink-0 w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "#22C55E" }}
            />
            일부 참여 {partial.length}
          </span>
          <ul className="flex flex-col gap-1">
            {partial.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3"
              >
                <Chip
                  member={m}
                  chipClass="border-green-300 text-suaza-ink"
                  onDragStateChange={setDragging}
                  readonly={readonly}
                  isTouch={isTouch}
                  pointerDrag={pointerDrag}
                />
                <QuarterDots
                  quarters={m.attending_quarters ?? null}
                  quarterActions={quarterActions}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 불참 / 미정 — 전체·일부 참여와 같은 레벨의 드롭 섹션 */}
      <DropSection
        label="불참"
        count={byStatus.absent.length}
        status="absent"
        dotColor="#EF3E3E"
        dragging={dragging}
        hoverClass="ring-2 ring-red-400"
        onDrop={handleDrop}
        readonly={readonly}
        pointerOver={pdrag?.overStatus === "absent"}
      >
        {byStatus.absent.length === 0 ? (
          <span className="text-sm text-suaza-ink-faint">—</span>
        ) : (
          byStatus.absent.map((m) => (
            <Chip
              key={m.id}
              member={m}
              onDragStateChange={setDragging}
              readonly={readonly}
              isTouch={isTouch}
              pointerDrag={pointerDrag}
            />
          ))
        )}
      </DropSection>

      <DropSection
        label="미정"
        count={byStatus.undecided.length}
        status="undecided"
        dotColor="#9CA3AF"
        dragging={dragging}
        hoverClass="ring-2 ring-gray-400"
        onDrop={handleDrop}
        readonly={readonly}
        pointerOver={pdrag?.overStatus === "undecided"}
      >
        {byStatus.undecided.length === 0 ? (
          <span className="text-sm text-suaza-ink-faint">—</span>
        ) : (
          byStatus.undecided.map((m) => (
            <Chip
              key={m.id}
              member={m}
              onDragStateChange={setDragging}
              readonly={readonly}
              isTouch={isTouch}
              pointerDrag={pointerDrag}
            />
          ))
        )}
      </DropSection>

      <div className="h-px bg-suaza-border my-1" />

      <DropSection
        label="미투표"
        count={nonVoters.length}
        status={null}
        dotColor="#D1D5DB"
        dragging={dragging}
        hoverClass="ring-2 ring-gray-400"
        onDrop={handleDrop}
        readonly={readonly}
        pointerOver={pdrag?.overStatus === null}
      >
        {nonVoters.length === 0 ? (
          <span className="text-sm text-suaza-ink-faint">—</span>
        ) : (
          nonVoters.map((m) => (
            <Chip
              key={m.id}
              member={m}
              onDragStateChange={setDragging}
              muted
              readonly={readonly}
              isTouch={isTouch}
              pointerDrag={pointerDrag}
            />
          ))
        )}
      </DropSection>

      {/* 포인터 드래그 고스트 — 손가락을 따라다님 */}
      {pdrag && (
        <div
          className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-1/2 px-2.5 py-0.5 rounded-full text-xs border border-suaza-button bg-white shadow-lg font-medium text-suaza-ink"
          style={{ left: pdrag.x, top: pdrag.y }}
        >
          {pdrag.name}
        </div>
      )}
    </div>
  );
}

type PointerDrag = {
  onStart: (member: Member, e: React.PointerEvent) => void;
  onMove: (e: React.PointerEvent) => void;
  onEnd: (e: React.PointerEvent) => void;
} | null;

function DropSection({
  label,
  count,
  status,
  dotColor,
  dragging,
  hoverClass,
  onDrop,
  readonly,
  pointerOver = false,
  children,
}: {
  label: string;
  count: number;
  status: Status;
  /** 헤더 라벨 앞 컬러 점 (일반 회원 화면과 동일한 시각 표시). 미지정 시 점 없음. */
  dotColor?: string;
  dragging: boolean;
  hoverClass: string;
  onDrop: (playerId: string, status: Status) => void;
  readonly?: boolean;
  /** 포인터(터치) 드래그가 이 섹션 위에 올라온 상태 */
  pointerOver?: boolean;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  const highlight = over || pointerOver;
  return (
    <div
      data-drop-status={encodeStatus(status)}
      onDragOver={
        readonly
          ? undefined
          : (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (!over) setOver(true);
            }
      }
      onDragLeave={readonly ? undefined : () => setOver(false)}
      onDrop={
        readonly
          ? undefined
          : (e) => {
              e.preventDefault();
              setOver(false);
              const playerId = e.dataTransfer.getData("text/plain");
              if (playerId) onDrop(playerId, status);
            }
      }
      className={`flex flex-col gap-1.5 p-1.5 rounded-md border border-dashed transition ${
        dragging ? "border-suaza-border" : "border-transparent"
      } ${highlight ? hoverClass + " bg-blue-50" : ""}`}
    >
      <span className="self-start inline-flex items-center gap-1.5 text-xs font-bold text-suaza-ink">
        {dotColor && (
          <span
            className="shrink-0 w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
        )}
        {label} {count}
      </span>
      <div className="flex flex-wrap gap-1 min-h-[20px]">{children}</div>
    </div>
  );
}

function QuarterDots({
  quarters,
  quarterActions,
}: {
  quarters: number[] | null;
  quarterActions?: (string | null)[] | null;
}) {
  const cls =
    "w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center text-[9px] font-bold leading-none";
  if (quarters == null) {
    return (
      <span className={cls} title="전체 참여">
        A
      </span>
    );
  }
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {quarters.map((q) => (
        <span key={q} className={cls} title={`${q}Q`}>
          {quarterShortLabel(q - 1, quarterActions)}
        </span>
      ))}
    </div>
  );
}

function Chip({
  member,
  chipClass = "border-suaza-border text-suaza-ink-muted",
  onDragStateChange,
  muted,
  readonly,
  isTouch,
  pointerDrag,
}: {
  member: Member;
  chipClass?: string;
  onDragStateChange: (dragging: boolean) => void;
  muted?: boolean;
  readonly?: boolean;
  /** 터치 기기 여부 — 네이티브 draggable 을 끄고 포인터 드래그를 사용 */
  isTouch?: boolean;
  pointerDrag?: PointerDrag;
}) {
  const usePointer = !!isTouch && !readonly && !!pointerDrag;
  // 마우스(비터치)에서만 네이티브 HTML5 드래그 사용
  const nativeDraggable = !readonly && !isTouch;
  return (
    <span
      draggable={nativeDraggable}
      onDragStart={
        nativeDraggable
          ? (e) => {
              e.dataTransfer.setData("text/plain", member.id);
              e.dataTransfer.effectAllowed = "move";
              setTimeout(() => onDragStateChange(true), 0);
            }
          : undefined
      }
      onDragEnd={nativeDraggable ? () => onDragStateChange(false) : undefined}
      onPointerDown={
        usePointer ? (e) => pointerDrag!.onStart(member, e) : undefined
      }
      onPointerMove={usePointer ? pointerDrag!.onMove : undefined}
      onPointerUp={usePointer ? pointerDrag!.onEnd : undefined}
      onPointerCancel={usePointer ? pointerDrag!.onEnd : undefined}
      // touch-action: none — 네이티브 스크롤/제스처를 끄고 포인터로 직접 제어.
      // 롱프레스 전 손가락 이동은 보드가 window.scrollBy 로 수동 스크롤하고,
      // 롱프레스 인식 후에는 스크롤 없이 드래그한다.
      style={usePointer ? { touchAction: "none" } : undefined}
      className={`select-none ${
        readonly ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      } inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs border bg-white ${
        readonly ? "" : "hover:bg-gray-50"
      } ${chipClass} ${muted ? "opacity-80" : ""}`}
    >
      {member.is_injured && <InjuryBadge />}
      {member.on_leave && <OnLeaveBadge />}
      <KingBadges member={member} />
      {member.name}
    </span>
  );
}

// 부심 깃발 SVG — 노/빨 격자
function LinesmanFlag() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="2" width="1.6" height="20" rx="0.5" fill="#1F2937" />
      <rect x="4.6" y="3" width="7" height="6" fill="#FACC15" />
      <rect x="11.6" y="3" width="7" height="6" fill="#EF4444" />
      <rect x="4.6" y="9" width="7" height="6" fill="#EF4444" />
      <rect x="11.6" y="9" width="7" height="6" fill="#FACC15" />
      <rect
        x="4.6"
        y="3"
        width="14"
        height="12"
        fill="none"
        stroke="rgba(0,0,0,0.25)"
        strokeWidth="0.4"
      />
    </svg>
  );
}

// 시즌 카테고리 1위 딱지 — 기록 버튼과 동일한 이모지/아이콘.
function KingBadges({ member }: { member: Member }) {
  const items: { key: string; icon: React.ReactNode; title: string }[] = [];
  if (member.isGoalKing)
    items.push({ key: "goal", icon: "⚽", title: "시즌 득점왕" });
  if (member.isAssistKing)
    items.push({ key: "assist", icon: "🅰", title: "시즌 어시왕" });
  if (member.isCleanSheetKing)
    items.push({ key: "cs", icon: "🛡️", title: "시즌 CS왕" });
  if (member.isRefereeKing)
    items.push({ key: "ref", icon: <LinesmanFlag />, title: "시즌 심판왕" });
  if (items.length === 0) return null;
  return (
    <>
      {items.map((it) => (
        <span
          key={it.key}
          className="shrink-0 inline-flex items-center justify-center w-4 h-4 text-[14px] leading-none"
          role="img"
          aria-label={it.title}
          title={it.title}
        >
          {it.icon}
        </span>
      ))}
    </>
  );
}

// 부상 표기용 빨강 + 배지
function InjuryBadge() {
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center w-3.5 h-3.5 rounded-[3px] bg-suaza-accent text-white"
      role="img"
      aria-label="부상"
      title="부상"
    >
      <svg viewBox="0 0 24 24" className="w-2 h-2" fill="currentColor" aria-hidden>
        <path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" />
      </svg>
    </span>
  );
}

// 장기불참 표기용 회색 ― 배지
function OnLeaveBadge() {
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center w-3.5 h-3.5 rounded-[3px] bg-suaza-ink-muted text-white"
      role="img"
      aria-label="장기불참"
      title="장기불참"
    >
      <svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="currentColor" aria-hidden>
        <rect x="3" y="10" width="18" height="4" rx="1" />
      </svg>
    </span>
  );
}
