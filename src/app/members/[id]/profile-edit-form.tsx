"use client";

import { useMemo, useState, useTransition } from "react";
import Dropdown from "@/components/dot-dropdown";
import {
  FOOT_LABEL,
  POSITIONS,
  POSITION_COLOR,
  PREFERRED_FEET,
  TITLE_BADGE,
  TITLE_LABEL,
  type MemberTitle,
  type Position,
  type PreferredFoot,
} from "@/lib/members/positions";
import DatePicker from "../../matches/new/date-picker";
import { setMemberStatus, updateProfile, updateProfileFields } from "./actions";

// 등번호 드롭다운 옵션 (0~99)
const JERSEY_OPTIONS = Array.from({ length: 100 }, (_, i) => ({
  value: String(i),
  label: String(i),
}));

type Initial = {
  name: string;
  nickname: string | null;
  positions: Position[];
  jersey_number: number | null;
  birth_date: string | null;
  preferred_foot: PreferredFoot | null;
  is_injured: boolean;
  on_leave: boolean;
  title: MemberTitle;
};

export default function ProfileEditForm({
  profileId,
  initial,
  email,
  avatar,
  stats,
  readonly = false,
  hideStatus = false,
  setupMode = false,
  hasAvatar = false,
  canEditStatus = false,
}: {
  profileId: string;
  initial: Initial;
  /** 표시용 이메일 (수정 불가) */
  email: string | null;
  /** 상단 카드 아바타 (AvatarUpload) — 서버에서 주입 */
  avatar: React.ReactNode;
  /** 상단 카드 하단 통계 그리드 — 서버에서 주입 */
  stats?: React.ReactNode;
  /** true 면 동일 레이아웃을 비편집(읽기 전용)으로 렌더 — 다른 회원이 볼 때 */
  readonly?: boolean;
  /** true 면 부상/장기불참 토글 숨김 (가입 첫 입력 단계) */
  hideStatus?: boolean;
  /** true 면 가입 첫 프로필 입력 단계 — 제목 "프로필입력", 상단 저장 버튼 숨김, 하단 회원가입 버튼 표시 */
  setupMode?: boolean;
  /** 프로필 사진(아바타) 등록 여부 — 가입 단계에선 사진까지 등록해야 회원가입 활성화 */
  hasAvatar?: boolean;
  /** 읽기 전용(타인 조회)이라도 부상/장기불참만 변경 가능 — 회장/매니저용 */
  canEditStatus?: boolean;
}) {
  // 별명/등번호/생년월일/상태는 상단 카드에서 인라인 편집(본인만).
  // 이름·직책은 표시 전용.
  const [nickname, setNickname] = useState(initial.nickname ?? "");
  const [jersey, setJersey] = useState(
    initial.jersey_number != null ? String(initial.jersey_number) : "",
  );
  const [birth, setBirth] = useState(initial.birth_date ?? "");
  // 포지션: 주(primary) / 부(secondary) 각각 한 개씩
  const [primary, setPrimary] = useState<Position | null>(
    initial.positions[0] ?? null,
  );
  const [secondary, setSecondary] = useState<Position | null>(
    initial.positions[1] ?? null,
  );
  const positions = useMemo(
    () => [primary, secondary].filter((p): p is Position => p != null),
    [primary, secondary],
  );
  const [foot, setFoot] = useState<PreferredFoot | null>(
    initial.preferred_foot,
  );
  const [injured, setInjured] = useState(initial.is_injured);
  const [onLeave, setOnLeave] = useState(initial.on_leave);

  const title = initial.title;

  // 본인 편집(가입 단계·타인 조회 제외)에서는 변경 즉시 자동 저장한다.
  const autoSave = !setupMode && !readonly;
  const [isSaving, startSaveTransition] = useTransition();
  // 별명/포지션/주발 자동 저장 — 변경된 값만 override 로 받아 현재 상태와 합쳐 전송.
  const persistFields = (next: {
    nickname?: string | null;
    positions?: Position[];
    preferred_foot?: PreferredFoot | null;
  }) => {
    if (!autoSave) return;
    startSaveTransition(async () => {
      await updateProfileFields(profileId, {
        nickname:
          next.nickname !== undefined ? next.nickname : nickname.trim() || null,
        positions: next.positions ?? positions,
        preferred_foot:
          next.preferred_foot !== undefined ? next.preferred_foot : foot,
      });
    });
  };

  const isDirty = useMemo(() => {
    if (nickname.trim() !== (initial.nickname ?? "")) return true;
    if (jersey.trim() !== String(initial.jersey_number ?? "")) return true;
    if (birth.trim() !== (initial.birth_date ?? "")) return true;
    if (foot !== initial.preferred_foot) return true;
    if (injured !== initial.is_injured) return true;
    if (onLeave !== initial.on_leave) return true;
    // 순서(주/부)가 의미를 가지므로 정렬 없이 비교
    if (positions.length !== initial.positions.length) return true;
    if (positions.some((p, i) => p !== initial.positions[i])) return true;
    return false;
  }, [nickname, jersey, birth, foot, injured, onLeave, positions, initial]);

  // 필수: 등번호, 생년월일, 주포지션, 주발 (이름은 가입 시 값 유지)
  const requiredValid =
    jersey.trim().length > 0 &&
    birth.trim().length > 0 &&
    primary != null &&
    foot != null;
  // 가입 입력 단계에선 사진(아바타) 등록까지 완료해야 저장(회원가입) 가능
  const canSave = isDirty && requiredValid && (!setupMode || hasAvatar);

  // 부상/장기불참 토글 — 본인 편집 또는 회장/매니저(타인 조회)면 즉시 서버에 반영한다.
  const [statusPending, startStatusTransition] = useTransition();
  const statusEditable = !readonly || canEditStatus;
  const toggleInjured = () => {
    if (!statusEditable) return;
    const prev = injured;
    const next = !prev;
    setInjured(next);
    startStatusTransition(async () => {
      const r = await setMemberStatus(profileId, next, onLeave);
      if (!r?.ok) setInjured(prev); // 권한/저장 실패 시 원상복구
    });
  };
  const toggleOnLeave = () => {
    if (!statusEditable) return;
    const prev = onLeave;
    const next = !prev;
    setOnLeave(next);
    startStatusTransition(async () => {
      const r = await setMemberStatus(profileId, injured, next);
      if (!r?.ok) setOnLeave(prev); // 권한/저장 실패 시 원상복구
    });
  };
  const busy = isSaving || statusPending;

  // 카드 + 포지션 + 주발 (편집/읽기 공통 레이아웃)
  const sections = (
    <>
      {/* 상단 신원 영역 (카드 없이 평평하게) */}
      <section className="flex flex-col gap-4">
        <div className="flex items-start gap-3 sm:gap-5 min-w-0">
          {/* 아바타 — 가입 입력 단계엔 "사진필수" 표시 (직책은 이름 옆으로 이동) */}
          <div className="relative shrink-0">
            {avatar}
            {setupMode && (
              <span className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 z-10 whitespace-nowrap text-[11px] leading-none px-2 py-1 rounded-full ring-2 ring-white shadow-sm bg-suaza-accent text-white">
                사진*
              </span>
            )}
          </div>
          <div className={`flex-1 min-w-0 flex flex-col ${setupMode ? "gap-3.5" : "gap-2"}`}>
            {/* 1행: 이름 + 생년월일 / 등번호(우측) — 좁으면 줄바꿈 */}
            <div className="flex items-baseline gap-x-2 gap-y-1 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold text-suaza-ink">
                {initial.name}
              </h1>
              {/* 직책 뱃지 — 이름 옆 */}
              {!setupMode && (
                <span
                  className={`text-[11px] leading-none px-2 py-0.5 rounded-full ${TITLE_BADGE[title] ?? TITLE_BADGE.player}`}
                >
                  {TITLE_LABEL[title] ?? title}
                </span>
              )}
              {/* 가입 입력 단계에선 등번호·생년월일을 아래 전용 입력으로 받으므로 카드 인라인 표시는 숨김 */}
              {!setupMode && (
                <InlineEditable
                  type="number"
                  value={jersey}
                  onCommit={setJersey}
                  readonly
                  min={0}
                  max={99}
                  ariaLabel="등번호"
                  renderDisplay={(v) => (
                    <span className="font-bold" style={{ color: "#338CF2" }}>
                      #{v || "--"}
                    </span>
                  )}
                  displayClassName="text-sm"
                  inputClassName={`${inlineInputCls} w-[60px] text-center`}
                />
              )}
            </div>

            {/* 2행: 생년월일 (이름 아랫줄) */}
            {!setupMode && (
              <InlineEditable
                type="date"
                value={birth}
                onCommit={setBirth}
                readonly
                ariaLabel="생년월일"
                renderDisplay={(v) => (v ? formatBirth(v) : "생년월일 미설정")}
                displayClassName="text-xs text-suaza-ink-faint whitespace-nowrap"
                inputClassName={`${inlineInputCls} w-[150px]`}
              />
            )}

            {/* 2행: 이메일 */}
            {email && (
              <p className="text-xs sm:text-sm text-suaza-ink-muted truncate">
                {email}
              </p>
            )}

            {/* 3행: 별명 위 / 부상·장기불참 아래 (본인만 편집) */}
            <div className="flex flex-col items-start gap-2">
              <InlineEditable
                type="text"
                value={nickname}
                onCommit={(v) => {
                  const nv = v.slice(0, 10);
                  setNickname(nv);
                  persistFields({ nickname: nv.trim() || null });
                }}
                readonly={readonly}
                maxLength={10}
                placeholder="별명"
                ariaLabel="별명 수정"
                renderDisplay={(v) => (
                  <span
                    className="inline-flex items-center gap-1 font-medium"
                    style={{ color: "#338CF2" }}
                  >
                    {v ? `@${v}` : readonly ? "—" : "별명입력"}
                    {!readonly && <span aria-hidden>✏️</span>}
                  </span>
                )}
                displayClassName="rounded-full text-xs hover:bg-gray-50 transition"
                inputClassName={`${inlineInputCls} w-[160px]`}
              />
              {!hideStatus && (
                <div className="flex items-center gap-2 mt-2">
                  <StatusPill
                    label="부상"
                    active={injured}
                    onColor="#EF3E3E"
                    onBg="rgba(239,62,62,0.10)"
                    readonly={!statusEditable}
                    onClick={toggleInjured}
                  />
                  <StatusPill
                    label="장기불참"
                    active={onLeave}
                    onColor="#1F2937"
                    onBg="rgba(31,41,55,0.08)"
                    readonly={!statusEditable}
                    onClick={toggleOnLeave}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {stats && (
          <>
            <div className="h-px bg-suaza-border" />
            {stats}
          </>
        )}
      </section>

      {/* 가입 입력 단계: 생년월일(커스텀 달력) + 등번호(커스텀 드롭다운 0~99) */}
      {setupMode && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-suaza-ink-muted">
              생년월일 <span className="text-suaza-accent">*</span>
            </span>
            <DatePicker
              value={birth}
              onChange={setBirth}
              defaultView="1987-01-01"
              placeholder="생년월일 선택"
              rounded="rounded-2xl"
              textSize="text-xs"
              padding="px-2.5 py-1.5"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-suaza-ink-muted">
              등번호 <span className="text-suaza-accent">*</span>
            </span>
            <Dropdown
              value={jersey || null}
              placeholder="선택"
              options={JERSEY_OPTIONS}
              onChange={(v) => setJersey(v ?? "")}
              rounded="rounded-2xl"
            />
          </div>
        </div>
      )}

      {/* 주포지션 · 부포지션 · 주발 — 드롭다운 (가로 3등분) */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-suaza-ink-muted">
            주포지션 {setupMode && <span className="text-suaza-accent">*</span>}
          </span>
          <Dropdown
            value={primary}
            placeholder="선택"
            readonly={readonly}
            rounded={setupMode ? "rounded-2xl" : "rounded-xl"}
            options={POSITIONS.map((p) => ({
              value: p,
              label: p,
              color: POSITION_COLOR[p],
            }))}
            onChange={(v) => {
              const next = v as Position | null;
              const ns = next && secondary === next ? null : secondary;
              setPrimary(next);
              if (next && secondary === next) setSecondary(null);
              persistFields({
                positions: [next, ns].filter(
                  (p): p is Position => p != null,
                ),
              });
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-suaza-ink-muted">
            부포지션
          </span>
          <Dropdown
            value={secondary}
            placeholder="없음"
            readonly={readonly}
            rounded={setupMode ? "rounded-2xl" : "rounded-xl"}
            allowClear
            clearLabel="없음"
            options={POSITIONS.filter((p) => p !== primary).map((p) => ({
              value: p,
              label: p,
              color: POSITION_COLOR[p],
            }))}
            onChange={(v) => {
              const next = v as Position | null;
              setSecondary(next);
              persistFields({
                positions: [primary, next].filter(
                  (p): p is Position => p != null,
                ),
              });
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-suaza-ink-muted">
            주발 {setupMode && <span className="text-suaza-accent">*</span>}
          </span>
          <Dropdown
            value={foot}
            placeholder="선택"
            readonly={readonly}
            rounded={setupMode ? "rounded-2xl" : "rounded-xl"}
            options={PREFERRED_FEET.map((f) => ({
              value: f,
              label: FOOT_LABEL[f],
            }))}
            onChange={(v) => {
              const next = v as PreferredFoot | null;
              setFoot(next);
              persistFields({ preferred_foot: next });
            }}
          />
        </div>
      </div>
    </>
  );

  // 포지션/주발 드롭다운 (카드 디자인용 — 라벨 위, 드롭다운 아래, 가로 3등분)
  const positionGrid = (
    <div className="w-full rounded-2xl bg-[#F7F7FA] dark:bg-[#1a2029] px-1 py-3 grid grid-cols-3 divide-x divide-gray-200">
      <div className="flex flex-col items-center gap-2 px-1.5">
        <span className="text-[11px] font-medium text-[#99A3B8]">주포지션</span>
        {readonly ? (
          <PositionPill pos={primary} />
        ) : (
          <Dropdown
            value={primary}
            placeholder="선택"
            rounded="rounded-full"
            colorText
            tint
            bordered={false}
            showChevron={false}
            belowChevron
            triggerClassName="w-[41px] h-[29px]"
            padding="p-0"
            weight="font-bold"
            textSize="text-[14px]"
            options={POSITIONS.map((p) => ({
              value: p,
              label: p,
              color: POSITION_COLOR[p],
            }))}
            onChange={(v) => {
              const next = v as Position | null;
              const ns = next && secondary === next ? null : secondary;
              setPrimary(next);
              if (next && secondary === next) setSecondary(null);
              persistFields({
                positions: [next, ns].filter((p): p is Position => p != null),
              });
            }}
          />
        )}
      </div>
      <div className="flex flex-col items-center gap-2 px-1.5">
        <span className="text-[11px] font-medium text-[#99A3B8]">부포지션</span>
        {readonly ? (
          <PositionPill pos={secondary} />
        ) : (
          <Dropdown
            value={secondary}
            placeholder="없음"
            rounded="rounded-full"
            colorText
            tint
            bordered={false}
            showChevron={false}
            belowChevron
            triggerClassName="w-[41px] h-[29px]"
            padding="p-0"
            weight="font-bold"
            textSize="text-[14px]"
            allowClear
            clearLabel="없음"
            options={POSITIONS.filter((p) => p !== primary).map((p) => ({
              value: p,
              label: p,
              color: POSITION_COLOR[p],
            }))}
            onChange={(v) => {
              const next = v as Position | null;
              setSecondary(next);
              persistFields({
                positions: [primary, next].filter(
                  (p): p is Position => p != null,
                ),
              });
            }}
          />
        )}
      </div>
      <div className="flex flex-col items-center gap-2 px-1.5">
        <span className="text-[11px] font-medium text-[#99A3B8]">주발</span>
        {readonly ? (
          <span className="text-[14px] font-bold text-[#12171F] dark:text-suaza-ink">
            {foot ? FOOT_LABEL[foot] : "—"}
          </span>
        ) : (
          <Dropdown
            value={foot}
            placeholder="선택"
            rounded="rounded-full"
            bordered={false}
            showChevron={false}
            belowChevron
            tint
            fit
            mutedPill
            padding="p-0"
            weight="font-bold"
            textSize="text-[14px]"
            options={PREFERRED_FEET.map((f) => ({
              value: f,
              label: FOOT_LABEL[f],
            }))}
            onChange={(v) => {
              const next = v as PreferredFoot | null;
              setFoot(next);
              persistFields({ preferred_foot: next });
            }}
          />
        )}
      </div>
    </div>
  );

  // 본인 편집·읽기 전용 — 첨부 디자인(그라데이션 헤더 + 겹친 아바타) 카드
  const card = (
    <div className="flex flex-col gap-4">
      {/* 그라데이션 헤더 — 엠블럼 색(네이비). 모바일은 가로 전체(풀블리드) */}
      <div className="relative h-20 -mx-6 sm:mx-0 rounded-t-lg sm:rounded-2xl bg-gradient-to-br from-[#3a5070] to-[#1d2e3e]">
        <span className="absolute top-1/2 -translate-y-1/2 right-6 sm:right-5 text-[34px] font-bold text-white/25 tabular-nums leading-none">
          #{jersey || "--"}
        </span>
      </div>

      <div className="-mt-16 flex flex-col items-center gap-4">
        {/* 아바타 — 헤더에 겹침 */}
        <div className="rounded-full">{avatar}</div>

          {/* 이름 + 직책 */}
          <div className="-mt-2 flex flex-col items-center gap-0">
            <div className="flex items-center gap-1">
              <h1 className="text-[23px] font-bold text-[#12171F] dark:text-suaza-ink">
                {initial.name}
              </h1>
              <span
                className={`text-[11px] font-bold leading-none px-2.5 py-1 rounded-full ${TITLE_BADGE[title] ?? TITLE_BADGE.player}`}
                style={{ color: "#454F61" }}
              >
                {TITLE_LABEL[title] ?? title}
              </span>
            </div>
            {/* 별명 */}
            <InlineEditable
              type="text"
              value={nickname}
              onCommit={(v) => {
                const nv = v.slice(0, 10);
                setNickname(nv);
                persistFields({ nickname: nv.trim() || null });
              }}
              readonly={readonly}
              maxLength={10}
              placeholder="별명"
              ariaLabel="별명 수정"
              renderDisplay={(v) => (
                <span
                  className="inline-flex items-center gap-1 font-medium text-[13px]"
                  style={{ color: "#EF3E3E" }}
                >
                  {v && `@${v}`}
                  {!readonly && <span aria-hidden>✏️</span>}
                </span>
              )}
              displayClassName="rounded-full hover:bg-gray-50 transition"
              inputClassName={`${inlineInputCls} w-[150px] text-center`}
            />
          </div>

          {/* 생년월일 / 이메일 */}
          <div className="w-full rounded-2xl bg-[#F7F7FA] dark:bg-[#1a2029]">
            <div className="flex items-center justify-between px-4 py-3.5 gap-2">
              <span className="flex items-center gap-2 text-[12px] font-medium text-[#99A3B8] shrink-0">
                <span aria-hidden>🎂</span> 생년월일
              </span>
              <span className="text-[13px] font-semibold text-[#12171F] dark:text-suaza-ink">
                {birth ? formatBirth(birth) : "미설정"}
              </span>
            </div>
            {email && (
              <div className="flex items-center justify-between px-4 py-3.5 gap-2 min-w-0">
                <span className="flex items-center gap-2 text-[12px] font-medium text-[#99A3B8] shrink-0">
                  <span aria-hidden>✉️</span> 이메일
                </span>
                <span className="text-[13px] font-semibold text-[#12171F] dark:text-suaza-ink truncate">
                  {email}
                </span>
              </div>
            )}
          </div>

          {/* 주포지션 / 부포지션 / 주발 */}
          {positionGrid}

          {/* 시즌 기록 — 포지션 카드 아래 */}
          {stats}

          {/* 부상 / 장기불참 */}
          {!hideStatus && (
            <div className="w-full grid grid-cols-2 gap-3">
              <StatusButton
                label="부상"
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    className="w-3.5 h-3.5"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" />
                  </svg>
                }
                active={injured}
                onColor="#EF3E3E"
                onBg="rgba(239,62,62,0.10)"
                readonly={!statusEditable}
                onClick={toggleInjured}
              />
              <StatusButton
                label="장기불참"
                icon="🚫"
                active={onLeave}
                onColor="#1F2937"
                onBg="rgba(31,41,55,0.08)"
                readonly={!statusEditable}
                onClick={toggleOnLeave}
              />
            </div>
          )}
      </div>
    </div>
  );

  // 읽기 전용
  if (readonly) {
    return <div className="font-display flex flex-col gap-6">{card}</div>;
  }

  // 가입 첫 입력 단계 — 계정이 아직 없으므로 폼 제출(updateProfile)로 저장/가입한다.
  if (setupMode) {
    return (
      <form
        action={updateProfile.bind(null, profileId)}
        className="flex flex-col gap-6"
      >
        <input type="hidden" name="name" value={initial.name} />
        <input type="hidden" name="nickname" value={nickname} />
        <input type="hidden" name="jersey_number" value={jersey} />
        <input type="hidden" name="birth_date" value={birth} />
        {positions.map((p) => (
          <input key={p} type="hidden" name="positions" value={p} />
        ))}
        {foot && <input type="hidden" name="preferred_foot" value={foot} />}
        <input type="hidden" name="is_injured" value={injured ? "1" : "0"} />
        <input type="hidden" name="on_leave" value={onLeave ? "1" : "0"} />

        <div className="flex items-center gap-3">
          <UsersIcon className="w-9 h-9 text-suaza-ink shrink-0" />
          <h1 className="text-2xl sm:text-[28px] font-bold text-suaza-ink">
            프로필입력
          </h1>
        </div>

        {sections}

        {/* 필수 누락 안내 */}
        {isDirty && !requiredValid && (
          <p className="text-xs text-suaza-accent">
            * 등번호, 생년월일, 주포지션, 주발은 필수 항목입니다
          </p>
        )}

        <button
          type="submit"
          disabled={!canSave}
          className="h-[52px] rounded-2xl bg-[#15224A] text-white text-[16px] font-semibold hover:brightness-125 transition mt-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
        >
          회원가입
        </button>
      </form>
    );
  }

  // 본인 편집 — 저장 버튼 없이 변경 즉시 자동 저장
  return (
    <div className="font-display relative">
      {/* 자동 저장 표시 — 레이아웃 공간을 차지하지 않도록 오버레이 */}
      <span
        className={`absolute left-1 top-1 z-10 text-[11px] transition-opacity ${
          busy ? "opacity-100 text-white/70" : "opacity-0"
        }`}
        aria-live="polite"
      >
        저장 중…
      </span>
      {card}
    </div>
  );
}

// 클릭하면 인라인 입력으로 전환되는 편집 필드 (별명/등번호/생년월일 공용).
// readonly 면 클릭 불가한 정적 표시.
function InlineEditable({
  type,
  value,
  onCommit,
  renderDisplay,
  displayClassName,
  inputClassName,
  placeholder,
  min,
  max,
  maxLength,
  ariaLabel,
  readonly = false,
}: {
  type: "text" | "number" | "date";
  value: string;
  onCommit: (v: string) => void;
  renderDisplay: (v: string) => React.ReactNode;
  displayClassName?: string;
  inputClassName?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  ariaLabel?: string;
  readonly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (readonly) {
    return <span className={displayClassName}>{renderDisplay(value)}</span>;
  }

  if (editing) {
    return (
      <input
        type={type}
        value={draft}
        autoFocus
        placeholder={placeholder}
        min={min}
        max={max}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onCommit(draft);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(draft);
            setEditing(false);
          } else if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={inputClassName}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={displayClassName}
      aria-label={ariaLabel}
    >
      {renderDisplay(value)}
    </button>
  );
}

// "1985-11-30" → "1985.11.30"
function formatBirth(iso: string): string {
  return iso.replaceAll("-", ".");
}

const inlineInputCls =
  "px-2 py-1 rounded-md border border-suaza-button text-sm text-suaza-ink focus:outline-none";

// 상태 칩 (부상/장기불참) — 좌측 컬러 닷 + 라벨. readonly 면 정적 표시.
function StatusPill({
  label,
  active,
  onColor,
  onBg,
  onClick,
  readonly = false,
}: {
  label: string;
  active: boolean;
  /** 활성화 시 닷·텍스트 색 */
  onColor: string;
  /** 활성화 시 배경색 (반투명) */
  onBg: string;
  onClick: () => void;
  readonly?: boolean;
}) {
  const cls = `inline-flex items-center px-2.5 py-1 rounded-full text-[11px] leading-none font-medium transition ${
    active ? "" : `bg-gray-100 text-suaza-ink-muted${readonly ? "" : " hover:bg-gray-200"}`
  }`;
  const style = active ? { backgroundColor: onBg, color: onColor } : undefined;
  const inner = label;
  if (readonly) {
    return (
      <span className={cls} style={style}>
        {inner}
      </span>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onClick}
      className={cls}
      style={style}
    >
      {inner}
    </button>
  );
}

// 읽기 전용 포지션 표시 — 글자 크기에 맞는 캡슐, 배경 = 포지션색 12% 알파.
function PositionPill({ pos }: { pos: Position | null }) {
  if (!pos) {
    return (
      <span className="text-[14px] font-bold text-suaza-ink-faint">—</span>
    );
  }
  const c = POSITION_COLOR[pos];
  return (
    <span
      className="inline-flex items-center justify-center w-[41px] h-[29px] rounded-full text-[14px] font-bold leading-none"
      style={{ color: c, backgroundColor: `${c}1F` }}
    >
      {pos}
    </span>
  );
}

// 부상/장기불참 — 가로 꽉 찬 아웃라인 버튼 (활성 시 색 채움). 첨부 디자인용.
function StatusButton({
  label,
  icon,
  active,
  onColor,
  onBg,
  onClick,
  readonly = false,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onColor: string;
  onBg: string;
  onClick: () => void;
  readonly?: boolean;
}) {
  const cls = `inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border text-sm font-bold transition ${
    active
      ? ""
      : `border-suaza-border text-suaza-ink bg-white${readonly ? "" : " hover:bg-gray-50"}`
  }`;
  const style = active
    ? { backgroundColor: onBg, color: onColor, borderColor: onColor }
    : undefined;
  const inner = (
    <>
      <span aria-hidden>{icon}</span>
      {label}
    </>
  );
  if (readonly) {
    return (
      <span className={cls} style={style}>
        {inner}
      </span>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onClick}
      className={cls}
      style={style}
    >
      {inner}
    </button>
  );
}

// 회원명단 탭과 동일한 사람 아이콘 — "프로필" 제목 앞에 표시
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

