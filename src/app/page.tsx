'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Category, PaymentMethod, Transaction } from '@/types/database';
import Header from '@/components/Header';
import TransactionList from '@/components/TransactionList';
import TransactionFormModal from '@/components/TransactionFormModal';
import AccountManagement from '@/components/AccountManagement';
import BudgetManagement from '@/components/BudgetManagement';
import ExcelImportModal from '@/components/ExcelImportModal';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import { RefreshCw, Sparkles, AlertCircle } from 'lucide-react';

/**
 * 가계부 메인 페이지 컴포넌트
 */
export default function Home() {
  const router = useRouter();
  const supabase = createClient();

  // 사용자 정보 및 활성 탭 (transactions | accounts | dashboard | budget | import)
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'transactions' | 'dashboard' | 'accounts' | 'budget' | 'import'>('transactions');

  // 현재 조회 기준 월 (YYYY-MM 형식)
  const [currentMonth, setCurrentMonth] = useState<string>('');

  // 데이터베이스 상태
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [dbErrorMessage, setDbErrorMessage] = useState<string | null>(null);
  const [seeding, setSeeding] = useState<boolean>(false);

  // 모달 제어 상태
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // 컴포넌트 마운트 시 오늘 연월 초기화
  useEffect(() => {
    setCurrentMonth(new Date().toISOString().slice(0, 7));
  }, []);

  /**
   * 카테고리 및 결제수단/계좌 기초 데이터 불러오기
   */
  const fetchBaseData = useCallback(async () => {
    try {
      setDbErrorMessage(null);
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        router.push('/login');
        return;
      }
      setUserEmail(user.email ?? null);
      setCurrentUserId(user.id);

      // 1. 카테고리 목록 조회
      const { data: catData, error: catErr } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true });

      if (catErr) {
        console.error('카테고리 로딩 실패:', catErr);
        setDbErrorMessage(`데이터베이스 오류: ${catErr.message}`);
      } else {
        setCategories(catData || []);
      }

      // 2. 결제수단 및 계좌 목록 조회
      const { data: pmData, error: pmErr } = await supabase
        .from('payment_methods')
        .select('*')
        .order('sort_order', { ascending: true });

      if (pmErr) {
        console.error('결제수단 로딩 실패:', pmErr);
      } else {
        setPaymentMethods(pmData || []);
      }
    } catch (err: any) {
      console.error('기초 데이터 로딩 중 예외:', err);
      setDbErrorMessage(`오류가 발생했습니다: ${err?.message || String(err)}`);
    }
  }, [supabase, router]);

  /**
   * 선택된 월(currentMonth)의 거래내역 불러오기
   */
  const fetchTransactions = useCallback(async () => {
    if (!currentMonth) return;

    try {
      setLoading(true);

      const [year, month] = currentMonth.split('-').map(Number);
      const startDate = `${currentMonth}-01`;
      const nextMonthDate = new Date(year, month, 1);
      const endDate = nextMonthDate.toISOString().split('T')[0];

      // 거래내역 조회
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          category:categories(*)
        `)
        .gte('transaction_date', startDate)
        .lt('transaction_date', endDate)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('거래내역 로딩 실패:', error);
      } else {
        setTransactions(data || []);
      }
    } catch (err) {
      console.error('거래내역 조회 중 예외:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, currentMonth]);

  // 페이지 진입 시 초기 기초 데이터 로딩
  useEffect(() => {
    fetchBaseData();
  }, [fetchBaseData]);

  // 기준 월이 설정/변경될 때마다 거래내역 다시 조회
  useEffect(() => {
    if (currentMonth) {
      fetchTransactions();
    }
  }, [currentMonth, fetchTransactions]);

  /**
   * 결제수단 정보를 트랜잭션과 결합 (출금 수단 및 입금 대상 계좌)
   */
  const populatedTransactions = transactions.map((t) => {
    const paymentMethod = paymentMethods.find((p) => p.id === t.payment_method_id);
    const toPaymentMethod = t.to_payment_method_id
      ? paymentMethods.find((p) => p.id === t.to_payment_method_id)
      : undefined;

    return {
      ...t,
      payment_method: paymentMethod,
      to_payment_method: toPaymentMethod,
    };
  });

  /**
   * 내역 등록 모달 열기
   */
  const handleOpenAddModal = () => {
    setEditingTransaction(null);
    setIsModalOpen(true);
  };

  /**
   * 내역 수정 모달 열기
   */
  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsModalOpen(true);
  };

  /**
   * 거래내역 단건 삭제
   */
  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('정말로 이 내역을 삭제하시겠습니까?')) {
      return;
    }

    try {
      const { error } = await supabase.from('transactions').delete().eq('id', id);

      if (error) {
        alert(`삭제 실패: ${error.message}`);
      } else {
        // 성공 시 목록과 자산 잔액 즉시 갱신
        fetchTransactions();
        fetchBaseData();
      }
    } catch (err: any) {
      alert(`오류: ${err.message}`);
    }
  };

  /**
   * 카테고리가 비어있을 때 네이버 가계부 기본 카테고리 수동 시딩
   */
  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('로그인 정보가 없습니다.');

      const defaultCategories = [
        // 지출 대분류 & 소분류
        { user_id: user.id, name: '부식', major_name: '식비', type: 'EXPENSE', sort_order: 1 },
        { user_id: user.id, name: '외식', major_name: '식비', type: 'EXPENSE', sort_order: 2 },
        { user_id: user.id, name: '카페/간식', major_name: '식비', type: 'EXPENSE', sort_order: 3 },
        { user_id: user.id, name: '관리비', major_name: '주거/통신', type: 'EXPENSE', sort_order: 4 },
        { user_id: user.id, name: '통신비', major_name: '주거/통신', type: 'EXPENSE', sort_order: 5 },
        { user_id: user.id, name: '생필품', major_name: '생활용품', type: 'EXPENSE', sort_order: 6 },
        { user_id: user.id, name: '의류/신발', major_name: '의복/미용', type: 'EXPENSE', sort_order: 7 },
        { user_id: user.id, name: '병원/약국', major_name: '건강/문화', type: 'EXPENSE', sort_order: 8 },
        { user_id: user.id, name: '대중교통', major_name: '교통/차량', type: 'EXPENSE', sort_order: 9 },
        { user_id: user.id, name: '주유비', major_name: '교통/차량', type: 'EXPENSE', sort_order: 10 },
        { user_id: user.id, name: '경조사비', major_name: '경조사/회비', type: 'EXPENSE', sort_order: 11 },
        // 수입 대분류 & 소분류
        { user_id: user.id, name: '급여', major_name: '주수입', type: 'INCOME', sort_order: 12 },
        { user_id: user.id, name: '상여금', major_name: '주수입', type: 'INCOME', sort_order: 13 },
        { user_id: user.id, name: '이자수입', major_name: '부수입', type: 'INCOME', sort_order: 14 },
        { user_id: user.id, name: '기타수입', major_name: '부수입', type: 'INCOME', sort_order: 15 },
      ];

      const defaultPayments = [
        { user_id: user.id, name: '현금', type: 'CASH', sort_order: 1 },
        { user_id: user.id, name: '주거래 은행', type: 'BANK', sort_order: 2 },
        { user_id: user.id, name: '신용카드', type: 'CARD', sort_order: 3 },
        { user_id: user.id, name: '체크카드', type: 'CARD', sort_order: 4 },
      ];

      await supabase.from('categories').insert(defaultCategories);
      await supabase.from('payment_methods').insert(defaultPayments);

      alert('네이버 가계부 기본 카테고리와 결제수단이 생성되었습니다!');
      fetchBaseData();
    } catch (err: any) {
      alert(`시딩 실패: ${err.message}`);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* 1. 상단 공통 헤더 */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userEmail={userEmail}
      />

      {/* 2. 메인 컨텐츠 영역 (모바일 하단 탭 바 가림 방지를 위해 pb-24 적용) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
        {/* DB 오류 안내 배너 */}
        {dbErrorMessage && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 text-sm">
              <p className="font-bold">데이터베이스 연동 안내</p>
              <p className="mt-1">{dbErrorMessage}</p>
              <p className="mt-2 text-xs text-amber-700">
                Supabase SQL Editor에서 마이그레이션 스크립트를 실행했는지 확인해 주세요.
              </p>
            </div>
          </div>
        )}

        {/* 신규 계정용 기본 데이터 생성 안내 배너 */}
        {!loading && categories.length === 0 && !dbErrorMessage && (
          <div className="mb-6 p-6 bg-white border border-emerald-200 rounded-2xl shadow-xs text-center space-y-3">
            <Sparkles className="w-8 h-8 text-emerald-600 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">
              네이버 가계부 표준 카테고리 초기화
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              현재 등록된 카테고리가 없습니다. 버튼 한 번으로 네이버 가계부의 필수 카테고리 30여 개를 바로 시작할 수 있습니다.
            </p>
            <button
              onClick={handleSeedDefaults}
              disabled={seeding}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-sm rounded-xl transition-colors shadow-xs"
            >
              {seeding ? '생성 중...' : '네이버 가계부 카테고리 자동 설정'}
            </button>
          </div>
        )}

        {/* 탭별 뷰 렌더링 */}
        {loading && transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
            <p className="text-sm">가계부 데이터를 불러오는 중입니다...</p>
          </div>
        ) : (
          <>
            {/* [탭 1] 가계부 거래내역 화면 */}
            {activeTab === 'transactions' && (
              <TransactionList
                transactions={populatedTransactions}
                currentMonth={currentMonth}
                setCurrentMonth={setCurrentMonth}
                onOpenAddModal={handleOpenAddModal}
                onEditTransaction={handleEditTransaction}
                onRefresh={() => {
                  fetchTransactions();
                  fetchBaseData();
                }}
              />
            )}

            {/* [탭 2] 자산 및 통장 계좌 관리 화면 */}
            {activeTab === 'accounts' && (
              <AccountManagement
                paymentMethods={paymentMethods}
                onRefresh={() => {
                  fetchBaseData();
                  fetchTransactions();
                }}
              />
            )}

            {/* [탭 3] 통계 & 시각화 대시보드 */}
            {activeTab === 'dashboard' && (
              <AnalyticsDashboard
                transactions={populatedTransactions}
                currentMonth={currentMonth || new Date().toISOString().slice(0, 7)}
                setCurrentMonth={setCurrentMonth}
                paymentMethods={paymentMethods}
              />
            )}

            {/* [탭 4] 네이버 가계부 스타일 '예산쓰기' & '예산반성' */}
            {activeTab === 'budget' && (
              <BudgetManagement
                categories={categories}
                currentMonth={currentMonth || new Date().toISOString().slice(0, 7)}
                setCurrentMonth={setCurrentMonth}
                transactions={populatedTransactions}
                userId={currentUserId}
              />
            )}

            {/* [탭 5] 네이버 가계부 / 엑셀 가져오기 */}
            {activeTab === 'import' && (
              <ExcelImportModal
                categories={categories}
                paymentMethods={paymentMethods}
                onSuccess={() => {
                  fetchTransactions();
                  fetchBaseData();
                  setActiveTab('transactions');
                }}
              />
            )}
          </>
        )}
      </main>

      {/* 3. 거래내역 추가 / 수정 공통 모달 */}
      <TransactionFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTransaction(null);
        }}
        onSuccess={() => {
          fetchTransactions();
          fetchBaseData();
        }}
        categories={categories}
        paymentMethods={paymentMethods}
        editingTransaction={editingTransaction}
      />
    </div>
  );
}
