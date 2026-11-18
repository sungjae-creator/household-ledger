-- ====================================================================
-- 마이그레이션 파일: 005_add_account_balances_and_transfer.sql
-- 설명: 
-- 1. 결제수단(payment_methods)에 계좌 잔액(balance) 컬럼 추가
-- 2. 거래내역(transactions)에 이체 대상 계좌(to_payment_method_id) 컬럼 추가
-- ====================================================================

-- 1. 결제수단/계좌 테이블에 현재 잔액 컬럼 추가
ALTER TABLE public.payment_methods
ADD COLUMN IF NOT EXISTS balance NUMERIC(14, 2) DEFAULT 0 NOT NULL;

-- 2. 거래내역 테이블에 '받는 계좌(to_payment_method_id)' 외래키 컬럼 추가
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS to_payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_transactions_to_payment ON public.transactions (to_payment_method_id);

-- 권한 재확인
GRANT ALL ON TABLE public.payment_methods TO authenticated;
GRANT ALL ON TABLE public.transactions TO authenticated;
