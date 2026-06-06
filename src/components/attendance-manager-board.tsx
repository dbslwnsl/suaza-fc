"use client";

import { useState } from "react";
import { quarterShortLabel } from "@/lib/matches/helpers";

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

  const handleDrop = (playerId: string, status: Status) => {
    if (readonly) return;
    onDrop?.(playerId, status);
  };

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
            />
          ))
        )}
      </DropSection>
    </div>
  );
}

function DropSection({
  label,
  count,
  status,
  dotColor,
  dragging,
  hoverClass,
  onDrop,
  readonly,
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
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
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
      } ${over ? hoverClass + " bg-blue-50" : ""}`}
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
}: {
  member: Member;
  chipClass?: string;
  onDragStateChange: (dragging: boolean) => void;
  muted?: boolean;
  readonly?: boolean;
}) {
  return (
    <span
      draggable={!readonly}
      onDragStart={
        readonly
          ? undefined
          : (e) => {
              e.dataTransfer.setData("text/plain", member.id);
              e.dataTransfer.effectAllowed = "move";
              setTimeout(() => onDragStateChange(true), 0);
            }
      }
      onDragEnd={readonly ? undefined : () => onDragStateChange(false)}
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
