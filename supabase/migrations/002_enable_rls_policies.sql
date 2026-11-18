-- ====================================================================
-- 마이그레이션 파일: 002_enable_rls_policies.sql
-- 설명: Row Level Security(행 수준 보안, RLS) 활성화 및 사용자별 격리 정책 정의
-- 여러 번 실행해도 에러가 나지 않도록 DROP POLICY IF EXISTS를 포함합니다.
-- ====================================================================

-- 1. 카테고리(categories) 테이블 RLS 활성화
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "사용자는 본인의 카테고리만 조회할 수 있습니다." ON public.categories;
CREATE POLICY "사용자는 본인의 카테고리만 조회할 수 있습니다."
ON public.categories
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 본인의 카테고리만 추가할 수 있습니다." ON public.categories;
CREATE POLICY "사용자는 본인의 카테고리만 추가할 수 있습니다."
ON public.categories
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 본인의 카테고리만 수정할 수 있습니다." ON public.categories;
CREATE POLICY "사용자는 본인의 카테고리만 수정할 수 있습니다."
ON public.categories
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 본인의 카테고리만 삭제할 수 있습니다." ON public.categories;
CREATE POLICY "사용자는 본인의 카테고리만 삭제할 수 있습니다."
ON public.categories
FOR DELETE
USING (auth.uid() = user_id);


-- 2. 결제수단(payment_methods) 테이블 RLS 활성화
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "사용자는 본인의 결제수단만 조회할 수 있습니다." ON public.payment_methods;
CREATE POLICY "사용자는 본인의 결제수단만 조회할 수 있습니다."
ON public.payment_methods
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 본인의 결제수단만 추가할 수 있습니다." ON public.payment_methods;
CREATE POLICY "사용자는 본인의 결제수단만 추가할 수 있습니다."
ON public.payment_methods
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 본인의 결제수단만 수정할 수 있습니다." ON public.payment_methods;
CREATE POLICY "사용자는 본인의 결제수단만 수정할 수 있습니다."
ON public.payment_methods
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 본인의 결제수단만 삭제할 수 있습니다." ON public.payment_methods;
CREATE POLICY "사용자는 본인의 결제수단만 삭제할 수 있습니다."
ON public.payment_methods
FOR DELETE
USING (auth.uid() = user_id);


-- 3. 거래내역(transactions) 테이블 RLS 활성화
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "사용자는 본인의 거래내역만 조회할 수 있습니다." ON public.transactions;
CREATE POLICY "사용자는 본인의 거래내역만 조회할 수 있습니다."
ON public.transactions
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 본인의 거래내역만 추가할 수 있습니다." ON public.transactions;
CREATE POLICY "사용자는 본인의 거래내역만 추가할 수 있습니다."
ON public.transactions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 본인의 거래내역만 수정할 수 있습니다." ON public.transactions;
CREATE POLICY "사용자는 본인의 거래내역만 수정할 수 있습니다."
ON public.transactions
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 본인의 거래내역만 삭제할 수 있습니다." ON public.transactions;
CREATE POLICY "사용자는 본인의 거래내역만 삭제할 수 있습니다."
ON public.transactions
FOR DELETE
USING (auth.uid() = user_id);
