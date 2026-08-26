import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "./supabase";

// ============================================================
// 네이티브 푸시 등록
//
// 서버(웹의 src/lib/push/send.ts)는 Expo Push Service 로 보내고,
// Expo 가 토큰을 보고 APNs(iOS) / FCM(Android) 으로 분배한다.
// 따라서 이 파일은 iOS 를 추가해도 그대로다.
//
// 저장 위치는 웹과 같은 push_subscriptions 테이블이며 platform 으로 구분한다.
//   web    → endpoint + p256dh + auth
//   ios    → expo_push_token
//   android→ expo_push_token
//
// 등록은 본인 행만 건드리므로 RLS(push_sub_insert_own)로 충분하다.
// service_role 이 필요 없어 별도 API 없이 앱에서 직접 upsert 한다.
// ============================================================

/** Android 알림 채널 — 서버가 보내는 channelId 와 일치해야 소리/중요도가 적용된다. */
const ANDROID_CHANNEL_ID = "default";

export type PushRegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

/** 앱이 포그라운드일 때도 알림을 띄운다. 모듈 로드 시 1회 설정. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | null {
  // eas init 을 실행하면 app.json 의 extra.eas.projectId 에 채워진다.
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId;
  const fromEas = Constants.easConfig?.projectId;
  return (fromExtra as string | undefined) ?? fromEas ?? null;
}

/**
 * 권한을 요청하고 Expo 푸시 토큰을 받아 DB 에 등록한다.
 * 이미 등록된 기기면 갱신된다(expo_push_token unique).
 */
export async function registerForPushNotifications(): Promise<PushRegisterResult> {
  if (!Device.isDevice) {
    // 에뮬레이터/시뮬레이터는 실제 푸시 토큰을 받지 못한다.
    return { ok: false, reason: "실기기에서만 푸시를 등록할 수 있습니다." };
  }

  const projectId = getProjectId();
  if (!projectId) {
    return {
      ok: false,
      reason:
        "EAS projectId 가 없습니다. `npx eas init` 을 먼저 실행하세요 (app.json 의 extra.eas.projectId).",
    };
  }

  // Android 는 채널이 없으면 알림이 조용히 무시되므로 토큰 요청 전에 만든다.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: "기본 알림",
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    // 한 번 거부하면 iOS 는 다시 물어보지 않는다. 그때는 설정 앱으로 안내해야 한다.
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") {
    return { ok: false, reason: "알림 권한이 거부되었습니다." };
  }

  let token: string;
  try {
    const res = await Notifications.getExpoPushTokenAsync({ projectId });
    token = res.data;
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "푸시 토큰을 받지 못했습니다.",
    };
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, reason: "로그인이 필요합니다." };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: auth.user.id,
      platform: Platform.OS === "ios" ? "ios" : "android",
      expo_push_token: token,
      device_name: Device.modelName ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "expo_push_token" },
  );

  if (error) return { ok: false, reason: error.message };

  return { ok: true, token };
}

/** 이 기기의 알림 끄기 — 토큰 행만 지운다. 다른 기기는 유지된다. */
export async function unregisterPushNotifications(
  token: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, reason: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("expo_push_token", token)
    .eq("user_id", auth.user.id);

  return error ? { ok: false, reason: error.message } : { ok: true };
}

/**
 * 알림 탭 → 이동할 경로를 꺼낸다.
 * 서버가 data.url 에 웹과 같은 경로("/matches/xxx")를 넣어 보낸다.
 */
export function extractUrl(
  response: Notifications.NotificationResponse,
): string | null {
  const url = response.notification.request.content.data?.url;
  return typeof url === "string" ? url : null;
}
