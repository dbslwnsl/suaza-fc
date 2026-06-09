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

type State =
  | "loading" // 지원 여부/구독 상태 확인 중
  | "unsupported" // 브라우저 미지원
  | "ios-needs-install" // iOS인데 홈 화면 미설치 → 푸시 불가
  | "denied" // 알림 권한 차단됨
  | "subscribed"
  | "unsubscribed";

export default function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    const isStandalone = window.matchMedia(
      "(display-mode: standalone)",
    ).matches;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      // iOS는 홈 화면에 추가해야만 PushManager 가 노출됨
      setState(isIOS && !isStandalone ? "ios-needs-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
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
          // 브라우저엔 구독이 있는데 DB엔 없을 수 있다(이전 실패 등).
          // 멱등 업서트로 항상 서버와 동기화해 둔다.
          const json = sub.toJSON() as {
            endpoint: string;
            keys: { p256dh: string; auth: string };
          };
          const r = await subscribeUser(json, navigator.userAgent);
          if (!r.success) {
            setError(`구독 저장 실패: ${r.error ?? "알 수 없는 오류"}`);
          }
          setState("subscribed");
        } else {
          setState("unsubscribed");
        }
      } catch {
        setState("unsupported");
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "unsubscribed");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ),
      });
      const json = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      const res = await subscribeUser(json, navigator.userAgent);
      if (!res.success) {
        await sub.unsubscribe();
        setError(res.error ?? "구독 저장에 실패했습니다");
        setState("unsubscribed");
        return;
      }
      setState("subscribed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "알림 설정에 실패했습니다");
    } finally {
      setBusy(false);
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
      setState("unsubscribed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "알림 해제에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;

  return (
    <section className="rounded-2xl bg-white border border-suaza-border p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-suaza-ink flex items-center gap-1.5">
            <span aria-hidden>🔔</span> 푸시 알림
          </h3>
          <p className="text-xs text-suaza-ink-muted mt-0.5 leading-relaxed">
            새 경기 일정이 등록되면 알림을 받아요.
          </p>
        </div>

        {(state === "subscribed" || state === "unsubscribed") && (
          <button
            type="button"
            onClick={state === "subscribed" ? disable : enable}
            disabled={busy}
            className={`shrink-0 inline-flex items-center gap-1.5 text-sm rounded-lg px-4 py-2 font-medium transition disabled:opacity-50 ${
              state === "subscribed"
                ? "border border-suaza-border text-suaza-ink hover:bg-suaza-bg"
                : "bg-suaza-button text-white hover:opacity-90"
            }`}
          >
            {busy
              ? "처리 중…"
              : state === "subscribed"
                ? "알림 끄기"
                : "알림 켜기"}
          </button>
        )}
      </div>

      {state === "denied" && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
          브라우저에서 이 사이트의 알림이 <b>차단</b>되어 있어요. 주소창의 자물쇠
          아이콘 → 알림 권한을 &quot;허용&quot;으로 바꿔주세요.
        </p>
      )}
      {state === "ios-needs-install" && (
        <p className="text-xs text-suaza-ink-muted bg-suaza-bg rounded-lg px-3 py-2 leading-relaxed">
          아이폰은 푸시 알림을 받으려면 먼저 <b>홈 화면에 추가</b>해야 해요. 사파리
          공유 버튼 <span aria-hidden>⎋</span> → &quot;홈 화면에 추가&quot; →
          홈에서 앱을 열고 다시 이 화면에서 알림을 켜주세요.
        </p>
      )}
      {state === "unsupported" && (
        <p className="text-xs text-suaza-ink-muted">
          이 브라우저는 푸시 알림을 지원하지 않아요.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  );
}
