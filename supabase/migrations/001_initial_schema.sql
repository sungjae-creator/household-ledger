-- ====================================================================
-- 마이그레이션 파일: 001_initial_schema.sql
-- 설명: 가계부 핵심 테이블(카테고리, 결제수단, 거래내역) 생성
-- 대상: PostgreSQL (Supabase)
-- ====================================================================

-- 1. 카테고리 테이블 (네이버 가계부 호환 대분류/소분류 체계)
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')), -- 수입(INCOME) 또는 지출(EXPENSE)
    major_name VARCHAR(50) NOT NULL, -- 대분류 (예: 식비, 교통/차량, 주거/통신, 급여 등)
    sub_name VARCHAR(50) NOT NULL,   -- 소분류 (예: 외식, 부식, 주유비, 월세, 기본급 등)
    icon VARCHAR(30) DEFAULT 'Tag',  -- Lucide 아이콘 명칭
    color VARCHAR(20) DEFAULT '#3B82F6', -- 카테고리 대표 색상(HEX)
    sort_order INT DEFAULT 0,        -- 정렬 순서
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, type, major_name, sub_name) -- 사용자 내 중복 방지
);

-- 카테고리 검색 성능을 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_categories_user_type ON public.categories (user_id, type);

-- 2. 결제수단/계좌 테이블 (카드, 계좌, 현금 등)
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,       -- 결제수단 명칭 (예: 신한카드, 카카오뱅크, 현금)
    type VARCHAR(20) NOT NULL CHECK (type IN ('CARD', 'BANK', 'CASH', 'ETC')), -- 종류
    memo VARCHAR(100),              -- 메모
    sort_order INT DEFAULT 0,        -- 정렬 순서
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, name)            -- 사용자 내 결제수단 중복 방지
);

-- 결제수단 사용자 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON public.payment_methods (user_id);

-- 3. 거래내역(가계부 항목) 테이블
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,  -- 거래 일자 (YYYY-MM-DD)
    type VARCHAR(10) NOT NULL CHECK (type IN ('INCOME', 'EXPENSE', 'TRANSFER')), -- 수입, 지출, 이체
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0), -- 금액
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL, -- 카테고리 외래키
    payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL, -- 결제수단 외래키
    description VARCHAR(100) NOT NULL, -- 사용처 또는 내역 설명
    memo TEXT,                       -- 상세 메모
    exclude_from_stats BOOLEAN DEFAULT FALSE NOT NULL, -- 통계 및 집계에서 제외할지 여부
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 거래내역 조회 최적화를 위한 복합 인덱스 (월별/일별 조회 빈번)
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions (user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payment ON public.transactions (payment_method_id);
