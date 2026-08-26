import { Stack } from "expo-router";

import { usePush } from "@/lib/use-push";

export default function AppLayout() {
  // 로그인 이후 영역에서만 푸시를 등록한다 (등록에 user_id 가 필요).
  usePush();

  return <Stack screenOptions={{ headerShown: false }} />;
}
