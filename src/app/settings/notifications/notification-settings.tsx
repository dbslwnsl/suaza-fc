"use client";

import { useEffect, useState } from "react";
import { subscribeUser, unsubscribeUser } from "@/lib/push/actions";

// VAPID 공개키(base64url) → Uint8Array (PushManager.subscribe 요구 형식)
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type PushState =
  | "loading"
  | "unsupported"
  | "ios-needs-install"
  | "denied"
  | "subscribed"
  | "unsubscribed";

type CategoryItem = {
  key: string;
  char: string;
  color: string;
  title: string;
  desc: string;
  /** 아직 미구현 — 음영처리하고 토글을 잠근다. */
  comingSoon?: boolean;
};

const SECTIONS: { section: string; items: CategoryItem[] }[] = [
  {
    section: "커뮤니티",
    items: [
      { key: "new_post", char: "글", color: "#3B82F6", title: "새 글 알람", desc: "게시판에 새 글이 등록될 때" },
      { key: "comment", char: "댓", color: "#F97316", title: "새 댓글 알람", desc: "내 글·댓글에 댓글이 달릴 때" },
      { key: "notice", char: "공", color: "#EF4444", title: "공지사항 알람", desc: "운영자 공지가 등록될 때" },
    ],
  },
  {
    section: "경기",
    items: [
      { key: "match_schedule", char: "일", color: "#22C55E", title: "경기 일정 알람", desc: "새로운 경기가 등록될 때" },
      { key: "team_change", char: "팀", color: "#6366F1", title: "팀 편성 알람", desc: "내 팀 배정이 정해지거나 바뀔 때" },
      { key: "match_result", char: "결", color: "#1E293B", title: "경기 결과 알람", desc: "경기 결과가 입력될 때", comingSoon: true },
    ],
  },
  {
    section: "클럽 활동",
    items: [
      { key: "new_member", char: "멤", color: "#14B8A6", title: "새 멤버 알람", desc: "새 회원이 가입할 때", comingSoon: true },
      { key: "points", char: "포", color: "#F97316", title: "포인트 획득 알람", desc: "포인트가 추가될 때", comingSoon: true },
    ],
  },
];

// 카테고리 토글 기본값 — 구현된(토글 가능한) 항목만.
const DEFAULT_PREFS: Record<string, boolean> = {
  new_post: false,
  comment: true,
  notice: true,
  match_schedule: true,
  team_change: true,
};

// 카테고리별 on/off 는 아직 서버 발송에 반영되지 않는 UI 상태 — 기기 로컬에 저장만 한다.
const PREFS_KEY = "suaza:notif-prefs";
// 마스터 토글의 직전 상태 캐시 — 재진입 시 스피너 없이 즉시 표시하기 위함.
const MASTER_KEY = "suaza:notif-master";

function Toggle({
  checked,
  onChange,
  disabled,
  loading,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** 현재 상태 확인 중 — on/off 대신 스피너를 표시해 잘못된 상태가 깜빡이지 않게 한다 */
  loading?: boolean;
}) {
  if (loading) {
    return (
      <span className="relative inline-flex h-[31px] w-[51px] shrink-0 items-center justify-center rounded-full bg-gray-100">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
      </span>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed ${
        checked ? "bg-green-500" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-[27px] w-[27px] transform rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

function SettingRow({
  char,
  color,
  title,
  desc,
  checked,
  onToggle,
  disabled,
  last,
  charDark,
  comingSoon,
  loading,
}: {
  char: string;
  color: string;
  title: string;
  desc: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
  last?: boolean;
  charDark?: boolean;
  comingSoon?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 pl-4 bg-white">
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold text-[15px] ${
          comingSoon ? "opacity-40 grayscale" : ""
        }`}
        style={{ backgroundColor: color, color: charDark ? "#B45309" : "#fff" }}
      >
        {char}
      </span>
      <div
        className={`flex flex-1 min-w-0 items-center gap-3 py-3 pr-4 ${
          last ? "" : "border-b border-gray-100"
        }`}
      >
        <div className={`min-w-0 flex-1 ${comingSoon ? "opacity-40" : ""}`}>
          <p className="font-bold text-suaza-ink text-[15px] leading-tight flex items-center gap-1.5">
            {title}
            {comingSoon && (
              <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                준비 중
              </span>
            )}
          </p>
          <p className="text-[13px] text-suaza-ink-muted mt-0.5 leading-snug">
            {desc}
          </p>
        </div>
        <Toggle
          checked={comingSoon ? false : checked}
          onChange={onToggle}
          disabled={disabled || comingSoon}
          loading={loading}
        />
      </div>
    </div>
  );
}

export default function NotificationSettings() {
  // 이 컴포넌트는 ssr:false 로 클라이언트에서만 렌더된다(아래 wrapper 참고).
  // 따라서 초기 state 를 localStorage 에서 "동기적으로" 읽어, 첫 페인트부터
  // 올바른 상태를 표시한다 → OFF→ON 깜빡임 없음. (서버 기본값 HTML 자체가 없음)
  const [pushState, setPushState] = useState<PushState>(() => {
    if (typeof window === "undefined") return "loading";
    try {
      const c = localStorage.getItem(MASTER_KEY);
      if (c === "on") return "subscribed";
      if (c === "off") return "unsubscribed";
    } catch {
      // 무시
    }
    return "loading";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 마스터 토글 낙관 상태 — 탭 즉시 스위치를 움직이고, 비동기 구독 완료/실패 후 실제값으로 정리.
  const [optimisticMaster, setOptimisticMaster] = useState<boolean | null>(
    null,
  );
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return DEFAULT_PREFS;
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  });

  // 푸시 지원 여부 / 현재 구독 상태 확인
  useEffect(() => {
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    const isStandalone = window.matchMedia(
      "(display-mode: standalone)",
    ).matches;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState(isIOS && !isStandalone ? "ios-needs-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("denied");
      try {
        localStorage.setItem(MASTER_KEY, "off");
      } catch {}
      return;
    }

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          // 표시는 즉시 반영하고, DB 재동기화는 백그라운드로 (네트워크 대기로 스피너가 남지 않게).
          setPushState("subscribed");
          try {
            localStorage.setItem(MASTER_KEY, "on");
          } catch {}
          const json = sub.toJSON() as {
            endpoint: string;
            keys: { p256dh: string; auth: string };
          };
          subscribeUser(json, navigator.userAgent)
            .then((r) => {
              if (!r.success) {
                setError(`구독 저장 실패: ${r.error ?? "알 수 없는 오류"}`);
              }
            })
            .catch(() => {});
        } else {
          setPushState("unsubscribed");
          try {
            localStorage.setItem(MASTER_KEY, "off");
          } catch {}
        }
      } catch {
        setPushState("unsupported");
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        setError(
          "알림 키(VAPID)가 설정되지 않았습니다. 관리자에게 문의해 주세요.",
        );
        setPushState("unsubscribed");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "unsubscribed");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const json = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      const res = await subscribeUser(json, navigator.userAgent);
      if (!res.success) {
        await sub.unsubscribe();
        setError(res.error ?? "구독 저장에 실패했습니다");
        setPushState("unsubscribed");
        try {
          localStorage.setItem(MASTER_KEY, "off");
        } catch {}
        return;
      }
      setPushState("subscribed");
      try {
        localStorage.setItem(MASTER_KEY, "on");
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "알림 설정에 실패했습니다");
    } finally {
      setBusy(false);
      setOptimisticMaster(null); // 실제 상태로 정리(실패 시 자동 되돌림)
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribeUser(sub.endpoint);
        await sub.unsubscribe();
      }
      setPushState("unsubscribed");
      try {
        localStorage.setItem(MASTER_KEY, "off");
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "알림 해제에 실패했습니다");
    } finally {
      setBusy(false);
      setOptimisticMaster(null); // 실제 상태로 정리(실패 시 자동 되돌림)
    }
  }

  function setPref(key: string, v: boolean) {
    setPrefs((prev) => {
      const next = { ...prev, [key]: v };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // 무시
      }
      return next;
    });
  }

  const loading = pushState === "loading";
  const masterAvailable =
    pushState === "subscribed" || pushState === "unsubscribed";
  const masterOn = pushState === "subscribed";
  // 스위치 표시값 — 낙관 상태가 있으면 그걸 우선(탭 즉시 이동), 없으면 실제 구독 상태.
  const masterChecked = optimisticMaster ?? masterOn;
  // 상태 확인 중에는 카테고리를 흐리게 하지 않는다 (마스터와 같은 깜빡임 방지)
  const categoriesDisabled = !loading && (!masterOn || busy);

  function onMasterToggle(v: boolean) {
    if (busy || !masterAvailable) return;
    setOptimisticMaster(v); // 스위치 즉시 이동
    if (v) enable();
    else disable();
  }

  const banner =
    pushState === "denied"
      ? {
          cls: "bg-amber-50 text-amber-800 border-amber-200",
          text: "브라우저에서 이 사이트의 알림이 차단되어 있어요. 주소창의 자물쇠 아이콘 → 알림 권한을 ‘허용’으로 바꿔주세요.",
        }
      : pushState === "ios-needs-install"
        ? {
            cls: "bg-suaza-bg text-suaza-ink-muted border-suaza-border",
            text: "아이폰은 푸시 알림을 받으려면 먼저 홈 화면에 추가한 뒤, 홈에서 앱을 열고 다시 이 화면에서 알림을 켜주세요.",
          }
        : pushState === "unsupported"
          ? {
              cls: "bg-suaza-bg text-suaza-ink-muted border-suaza-border",
              text: "이 브라우저는 푸시 알림을 지원하지 않아요.",
            }
          : null;

  return (
    <div>
      {/* 마스터 토글 */}
      <div className="mt-3 mx-4 bg-white rounded-2xl overflow-hidden border border-suaza-border/60">
        <SettingRow
          char="알"
          color="#FCE9A6"
          charDark
          title="알람"
          desc="모든 알람을 켜거나 끕니다"
          checked={masterChecked}
          onToggle={onMasterToggle}
          disabled={!masterAvailable || busy}
          loading={loading}
          last
        />
      </div>

      {banner && (
        <p
          className={`mx-4 mt-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${banner.cls}`}
        >
          {banner.text}
        </p>
      )}
      {error && (
        <p className="mx-4 mt-2 text-xs text-red-600">{error}</p>
      )}

      {/* 카테고리별 알림 */}
      <div
        className={`transition-opacity ${
          categoriesDisabled ? "opacity-50" : ""
        }`}
      >
        {SECTIONS.map((sec) => (
          <div key={sec.section}>
            <h2 className="px-5 pt-5 pb-2 text-[13px] font-bold text-suaza-ink-muted">
              {sec.section}
            </h2>
            <div className="mx-4 bg-white rounded-2xl overflow-hidden border border-suaza-border/60">
              {sec.items.map((it, i) => (
                <SettingRow
                  key={it.key}
                  char={it.char}
                  color={it.color}
                  title={it.title}
                  desc={it.desc}
                  comingSoon={it.comingSoon}
                  checked={!!prefs[it.key]}
                  onToggle={(v) => setPref(it.key, v)}
                  disabled={categoriesDisabled}
                  last={i === sec.items.length - 1}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
