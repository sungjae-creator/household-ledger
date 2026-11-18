-- ====================================================================
-- 마이그레이션 파일: 006_allow_card_payment_type.sql
-- 설명: 거래 유형(type)에 '카드대금 납부(CARD_PAYMENT)' 유형 추가
-- 카드대금 출금 시 이중 지출 집계를 방지하면서 계좌 잔액을 정확히 차감합니다.
-- ====================================================================

-- 기존 type 체크 제약조건 해제 후 CARD_PAYMENT 포함하여 재설정
ALTER TABLE public.transactions
DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE public.transactions
ADD CONSTRAINT transactions_type_check
CHECK (type IN ('INCOME', 'EXPENSE', 'TRANSFER', 'CARD_PAYMENT'));
