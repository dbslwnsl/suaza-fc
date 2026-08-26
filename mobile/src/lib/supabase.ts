import "react-native-url-polyfill/auto";

import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

import { secureStorage } from "./secure-storage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY 가 없습니다. " +
      "mobile/.env.local 을 확인하세요 (.env.example 참고).",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // 네이티브에는 URL 콜백이 없다. OAuth 딥링크를 붙일 때 다시 검토할 것.
    detectSessionInUrl: false,
  },
});

// 앱이 백그라운드로 가면 토큰 자동 갱신 타이머를 멈춘다.
// 그대로 두면 백그라운드에서 불필요한 네트워크 요청이 계속 나간다.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
