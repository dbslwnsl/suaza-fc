import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * service_role 키를 사용하는 서버 전용 admin 클라이언트.
 * - 절대 브라우저로 노출되면 안 됨 (RLS 우회 가능).
 * - auth.admin.deleteUser 같은 관리자 API 호출 시에만 사용.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다. .env.local 확인 필요",
    );
  }
  return createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
