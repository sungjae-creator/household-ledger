import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js 미들웨어: 모든 페이지 요청 전에 실행되어 로그인 세션을 확인하고 갱신합니다.
 * PWA 파일(manifest.json, sw.js, icons) 및 정적 파일은 인증 검사 없이 즉시 통과시킵니다.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;

  // 1. PWA 및 정적 필수 파일은 로그인 검사 없이 즉각 통과 (크롬 WebAPK 앱 설치 인식 보장)
  if (
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/icons/') ||
    pathname.endsWith('.json') ||
    pathname.endsWith('.js')
  ) {
    return supabaseResponse;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Supabase 환경변수가 아직 설정되지 않은 초기 세팅 상태에서는 그대로 통과
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project-id')) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // 로그인된 사용자 정보 확인
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup');

  // 2. 로그인이 안 된 상태에서 보호된 페이지 접근 시 -> 로그인 페이지로 이동
  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 3. 이미 로그인된 상태에서 로그인/회원가입 페이지 접근 시 -> 가계부 메인으로 이동
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

// 미들웨어가 실행될 경로 설정 (정적 리소스, PWA 파일, 이미지 등은 제외)
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json|js)$).*)',
  ],
};
