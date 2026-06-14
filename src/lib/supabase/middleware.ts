import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 매 요청마다 Supabase 세션 쿠키를 갱신하고,
 * 비로그인 사용자를 /login 으로 리다이렉트한다.
 *
 * - createServerClient ~ getUser 사이에 어떤 로직도 두지 말 것
 *   (세션이 의도치 않게 만료될 수 있음)
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 삭제(탈퇴 처리)된 계정은 세션이 남아 있어도 차단.
  // 신규 가입자는 approved_at = null → 승인 대기 페이지로 격리.
  let isDeleted = false;
  let isPending = false;
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("deleted_at, approved_at")
      .eq("id", user.id)
      .maybeSingle();
    isDeleted = !!prof?.deleted_at;
    // approved_at 컬럼이 없는 환경(마이그레이션 0044 미적용)에선 prof.approved_at === undefined.
    // 이 경우 차단하지 않는다. 명시적으로 null 인 경우만 승인 대기로 본다.
    isPending = prof != null && prof.approved_at === null;
  }
  const activeUser = user && !isDeleted ? user : null;

  const { pathname } = request.nextUrl;
  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  if (!activeUser && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (activeUser && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // 승인 대기 상태: 본인 승인 페이지·로그아웃 외의 모든 경로 차단.
  if (activeUser && isPending && !pathname.startsWith("/pending-approval")) {
    const url = request.nextUrl.clone();
    url.pathname = "/pending-approval";
    return NextResponse.redirect(url);
  }

  // 승인 완료된 사용자가 pending 페이지에 접근하면 홈으로
  if (activeUser && !isPending && pathname.startsWith("/pending-approval")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
