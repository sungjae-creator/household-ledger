-- ====================================================================
-- 마이그레이션 파일: 004_grant_permissions.sql
-- 설명: 로그인한 사용자(authenticated)에게 테이블 접근 기본 권한 부여
-- 'permission denied for table categories' 오류를 해결합니다.
-- ====================================================================

-- public 스키마 사용 권한 부여
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 가계부 3개 핵심 테이블에 대해 로그인한 사용자(authenticated)에게 권한 부여
GRANT ALL ON TABLE public.categories TO authenticated;
GRANT ALL ON TABLE public.payment_methods TO authenticated;
GRANT ALL ON TABLE public.transactions TO authenticated;

-- 혹시 사용할 수 있는 시퀀스(ID 자동증가 등) 권한 부여
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
