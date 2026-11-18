-- ====================================================================
-- 마이그레이션 파일: 003_default_seed_trigger.sql
-- 설명: 신규 회원가입 시 네이버 가계부 기본 카테고리 및 결제수단 자동 생성 트리거
-- 대상: PostgreSQL (Supabase)
-- ====================================================================

-- 신규 유저 생성 시 기본 데이터를 세팅해주는 함수 정의
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. 기본 결제수단 등록
    INSERT INTO public.payment_methods (user_id, name, type, sort_order) VALUES
    (NEW.id, '현금', 'CASH', 1),
    (NEW.id, '신용카드', 'CARD', 2),
    (NEW.id, '체크카드', 'CARD', 3),
    (NEW.id, '은행계좌', 'BANK', 4);

    -- 2. 기본 지출 카테고리 등록 (네이버 가계부 표준 대분류/소분류)
    INSERT INTO public.categories (user_id, type, major_name, sub_name, color, sort_order) VALUES
    -- 식비
    (NEW.id, 'EXPENSE', '식비', '주식', '#EF4444', 1),
    (NEW.id, 'EXPENSE', '식비', '부식', '#EF4444', 2),
    (NEW.id, 'EXPENSE', '식비', '외식', '#EF4444', 3),
    (NEW.id, 'EXPENSE', '식비', '카페/간식', '#EF4444', 4),
    
    -- 주거/통신
    (NEW.id, 'EXPENSE', '주거/통신', '월세', '#F97316', 5),
    (NEW.id, 'EXPENSE', '주거/통신', '관리비', '#F97316', 6),
    (NEW.id, 'EXPENSE', '주거/통신', '통신비/인터넷', '#F97316', 7),
    (NEW.id, 'EXPENSE', '주거/통신', '공과금', '#F97316', 8),

    -- 생활용품
    (NEW.id, 'EXPENSE', '생활용품', '주방/욕실', '#F59E0B', 9),
    (NEW.id, 'EXPENSE', '생활용품', '가구/가전', '#F59E0B', 10),
    (NEW.id, 'EXPENSE', '생활용품', '잡화', '#F59E0B', 11),

    -- 의복/미용
    (NEW.id, 'EXPENSE', '의복/미용', '의류', '#10B981', 12),
    (NEW.id, 'EXPENSE', '의복/미용', '신발/잡화', '#10B981', 13),
    (NEW.id, 'EXPENSE', '의복/미용', '헤어/뷰티', '#10B981', 14),

    -- 건강/문화
    (NEW.id, 'EXPENSE', '건강/문화', '병원/약국', '#06B6D4', 15),
    (NEW.id, 'EXPENSE', '건강/문화', '운동/레저', '#06B6D4', 16),
    (NEW.id, 'EXPENSE', '건강/문화', '도서/공연/영화', '#06B6D4', 17),

    -- 교통/차량
    (NEW.id, 'EXPENSE', '교통/차량', '대중교통', '#3B82F6', 18),
    (NEW.id, 'EXPENSE', '교통/차량', '주유비', '#3B82F6', 19),
    (NEW.id, 'EXPENSE', '교통/차량', '정비/통행료', '#3B82F6', 20),

    -- 교육/육아
    (NEW.id, 'EXPENSE', '교육/육아', '학원/수강료', '#6366F1', 21),
    (NEW.id, 'EXPENSE', '교육/육아', '교재비', '#6366F1', 22),

    -- 경조사/회비
    (NEW.id, 'EXPENSE', '경조사/회비', '축의/부의', '#8B5CF6', 23),
    (NEW.id, 'EXPENSE', '경조사/회비', '모임회비', '#8B5CF6', 24),
    (NEW.id, 'EXPENSE', '경조사/회비', '선물비', '#8B5CF6', 25),

    -- 기타/금융
    (NEW.id, 'EXPENSE', '금융/보험', '보장성보험', '#EC4899', 26),
    (NEW.id, 'EXPENSE', '금융/보험', '대출이자', '#EC4899', 27),
    (NEW.id, 'EXPENSE', '기타', '기타지출', '#64748B', 28);

    -- 3. 기본 수입 카테고리 등록
    INSERT INTO public.categories (user_id, type, major_name, sub_name, color, sort_order) VALUES
    (NEW.id, 'INCOME', '급여', '기본급', '#10B981', 1),
    (NEW.id, 'INCOME', '급여', '상여금', '#10B981', 2),
    (NEW.id, 'INCOME', '급여', '야근/수당', '#10B981', 3),
    (NEW.id, 'INCOME', '금융소득', '이자/배당', '#3B82F6', 4),
    (NEW.id, 'INCOME', '부수입', '중고판매', '#F59E0B', 5),
    (NEW.id, 'INCOME', '부수입', '기타수입', '#F59E0B', 6);

    RETURN NEW;
END;
$$;

-- 트리거 설정: auth.users 테이블에 신규 회원이 추가된 직후 자동 실행
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_setup();
