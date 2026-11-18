import { createBrowserClient } from '@supabase/ssr';

/**
 * 브라우저(클라이언트 컴포넌트)에서 사용할 Supabase 인스턴스를 생성하는 함수입니다.
 * 
 * - 사용처: 'use client' 환경에서 로그인, 실시간 데이터 조회, 폼 제출 시 사용
 * - 환경 변수 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 참조합니다.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      '⚠️ Supabase URL 또는 Anon Key가 설정되지 않았습니다. .env.local 파일을 확인해 주세요.'
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
