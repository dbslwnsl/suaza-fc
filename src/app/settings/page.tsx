import { redirect } from "next/navigation";

// 감독 설정 진입 시 "기록 항목 관리" 페이지로 이동.
// 접근 권한(회장/감독 = manager)은 /settings/stats 에서 강제한다.
export default function SettingsPage() {
  redirect("/settings/stats");
}
