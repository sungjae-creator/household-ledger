-- ====================================================================
-- 마이그레이션 파일: 007_create_budgets_table.sql
-- 설명: 네이버 가계부 스타일의 월별/대분류별 예산(budgets) 테이블 생성 및 보안 정책
-- ====================================================================

-- 1. 예산 테이블 생성
CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    year_month VARCHAR(7) NOT NULL, -- YYYY-MM 형식 (예: '2026-11')
    category_major VARCHAR(50) NOT NULL, -- 지출 대분류명 (예: 식비, 주거/통신 등)
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0), -- 설정 예산액
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, year_month, category_major) -- 사용자별/연월별/대분류별 유일성 보장
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_budgets_user_ym ON public.budgets (user_id, year_month);

-- 2. RLS(행 수준 보안) 활성화 및 정책 설정
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "사용자는 본인의 예산만 조회할 수 있습니다." ON public.budgets;
CREATE POLICY "사용자는 본인의 예산만 조회할 수 있습니다."
ON public.budgets FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 본인의 예산만 추가할 수 있습니다." ON public.budgets;
CREATE POLICY "사용자는 본인의 예산만 추가할 수 있습니다."
ON public.budgets FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 본인의 예산만 수정할 수 있습니다." ON public.budgets;
CREATE POLICY "사용자는 본인의 예산만 수정할 수 있습니다."
ON public.budgets FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 본인의 예산만 삭제할 수 있습니다." ON public.budgets;
CREATE POLICY "사용자는 본인의 예산만 삭제할 수 있습니다."
ON public.budgets FOR DELETE
USING (auth.uid() = user_id);

-- 3. 권한 부여
GRANT ALL ON TABLE public.budgets TO authenticated;
