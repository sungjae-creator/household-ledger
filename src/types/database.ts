/**
 * 가계부 데이터베이스 타입 정의
 * Supabase 테이블 스키마와 1:1로 대응되는 TypeScript 인터페이스입니다.
 */

// 거래 유형: 수입(INCOME), 지출(EXPENSE), 이체(TRANSFER), 카드대금결제(CARD_PAYMENT)
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'CARD_PAYMENT';

// 결제수단 유형: 카드(CARD), 은행(BANK), 현금(CASH), 기타(ETC)
export type PaymentMethodType = 'CARD' | 'BANK' | 'CASH' | 'ETC';

// 카테고리 정보
export interface Category {
  id: string;
  user_id: string;
  type: 'INCOME' | 'EXPENSE';
  major_name: string; // 대분류 (예: 식비, 주거/통신, 급여)
  sub_name: string;   // 소분류 (예: 외식, 부식, 월세, 기본급)
  icon?: string;
  color?: string;
  sort_order: number;
  created_at: string;
}

// 결제수단 및 자산/계좌 정보
export interface PaymentMethod {
  id: string;
  user_id: string;
  name: string;       // 계좌/결제수단 이름 (예: 신한 주거래통장, 국민카드, 현금)
  type: PaymentMethodType;
  balance: number;    // 현재 잔액 (은행 계좌 및 현금)
  memo?: string;
  sort_order: number;
  created_at: string;
}

// 거래내역 정보
export interface Transaction {
  id: string;
  user_id: string;
  transaction_date: string; // YYYY-MM-DD
  type: TransactionType;
  amount: number;
  category_id?: string | null;
  payment_method_id?: string | null;       // 결제수단/출금계좌 ID
  to_payment_method_id?: string | null;    // (이체 시 입금계좌 / 카드결제 시 대상 카드 ID)
  description: string;      // 사용처(지출), 입금처(수입), 이체목적(이체), 카드결제내용
  memo?: string | null;     // 상세 메모
  exclude_from_stats: boolean; // 통계 제외 여부 (카드결제는 기본 true)
  created_at: string;
  updated_at: string;

  // 조인(Join) 시 함께 가져올 수 있는 부가 정보
  category?: Category | null;
  payment_method?: PaymentMethod | null;
  to_payment_method?: PaymentMethod | null;
}
