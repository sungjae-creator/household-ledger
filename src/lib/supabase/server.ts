import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * 서버 컴포넌트, 서버 액션 또는 Route Handler에서 사용할 Supabase 인스턴스를 생성하는 함수입니다.
 * Next.js 최신 규격에 따라 쿠키(cookies)를 비동기로 읽고 씁니다.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서는 쿠키를 직접 변경할 수 없으므로 예외를 무시합니다.
            // 쿠키 변경은 미들웨어나 서버 액션에서 처리됩니다.
          }
        },
      },
    }
  );
}
