'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Category, PaymentMethod, Transaction } from '@/types/database';
import Header from '@/components/Header';
import TransactionList from '@/components/TransactionList';
import TransactionFormModal from '@/components/TransactionFormModal';
import AccountManagement from '@/components/AccountManagement';
import ExcelImportModal from '@/components/ExcelImportModal';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import { RefreshCw, Sparkles, AlertCircle } from 'lucide-react';

/**
 * 가계부 메인 페이지 컴포넌트
 */
export default function Home() {
  const router = useRouter();
  const supabase = createClient();

  // 사용자 정보 및 활성 탭 (transactions | accounts | dashboard | import)
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'transactions' | 'dashboard' | 'accounts' | 'import'>('transactions');

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
        const rawTransactions = (data || []) as Transaction[];
        setTransactions(rawTransactions);
      }
    } catch (err) {
      console.error('거래내역 로딩 중 오류:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, currentMonth]);

  // 첫 마운트 시 기초 데이터 로드
  useEffect(() => {
    fetchBaseData();
  }, [fetchBaseData]);

  // 월이 변경될 때마다 거래내역 다시 조회
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // 거래내역에 최신 결제수단 및 입금계좌 정보 결합
  const populatedTransactions = transactions.map((tx) => ({
    ...tx,
    payment_method: paymentMethods.find((p) => p.id === tx.payment_method_id) || null,
    to_payment_method: paymentMethods.find((p) => p.id === tx.to_payment_method_id) || null,
  }));

  /**
   * 기본 카테고리 자동 생성
   */
  const handleSeedDefaultData = async () => {
    try {
      setSeeding(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert('로그인이 필요합니다.');
        return;
      }

      // 1. 기본 결제수단/계좌 등록
      await supabase.from('payment_methods').insert([
        { user_id: user.id, name: '주거래 은행통장', type: 'BANK', balance: 0, sort_order: 1 },
        { user_id: user.id, name: '체크카드', type: 'CARD', balance: 0, sort_order: 2 },
        { user_id: user.id, name: '신용카드', type: 'CARD', balance: 0, sort_order: 3 },
        { user_id: user.id, name: '현금', type: 'CASH', balance: 0, sort_order: 4 },
      ]);

      // 2. 기본 카테고리 등록
      const defaultCategories = [
        { user_id: user.id, type: 'EXPENSE', major_name: '식비', sub_name: '주식', color: '#EF4444', sort_order: 1 },
        { user_id: user.id, type: 'EXPENSE', major_name: '식비', sub_name: '부식', color: '#EF4444', sort_order: 2 },
        { user_id: user.id, type: 'EXPENSE', major_name: '식비', sub_name: '외식', color: '#EF4444', sort_order: 3 },
        { user_id: user.id, type: 'EXPENSE', major_name: '식비', sub_name: '카페/간식', color: '#EF4444', sort_order: 4 },
        { user_id: user.id, type: 'EXPENSE', major_name: '주거/통신', sub_name: '월세', color: '#F97316', sort_order: 5 },
        { user_id: user.id, type: 'EXPENSE', major_name: '주거/통신', sub_name: '관리비', color: '#F97316', sort_order: 6 },
        { user_id: user.id, type: 'EXPENSE', major_name: '주거/통신', sub_name: '통신비', color: '#F97316', sort_order: 7 },
        { user_id: user.id, type: 'EXPENSE', major_name: '생활용품', sub_name: '생필품', color: '#F59E0B', sort_order: 8 },
        { user_id: user.id, type: 'EXPENSE', major_name: '교통/차량', sub_name: '대중교통', color: '#3B82F6', sort_order: 9 },
        { user_id: user.id, type: 'EXPENSE', major_name: '교통/차량', sub_name: '주유비', color: '#3B82F6', sort_order: 10 },
        { user_id: user.id, type: 'EXPENSE', major_name: '건강/문화', sub_name: '병원/약국', color: '#06B6D4', sort_order: 11 },
        { user_id: user.id, type: 'EXPENSE', major_name: '건강/문화', sub_name: '문화/여가', color: '#06B6D4', sort_order: 12 },
        { user_id: user.id, type: 'EXPENSE', major_name: '기타', sub_name: '기타지출', color: '#64748B', sort_order: 13 },
        { user_id: user.id, type: 'INCOME', major_name: '급여', sub_name: '기본급', color: '#10B981', sort_order: 1 },
        { user_id: user.id, type: 'INCOME', major_name: '급여', sub_name: '상여금', color: '#10B981', sort_order: 2 },
        { user_id: user.id, type: 'INCOME', major_name: '금융소득', sub_name: '이자/배당', color: '#3B82F6', sort_order: 3 },
        { user_id: user.id, type: 'INCOME', major_name: '부수입', sub_name: '기타수입', color: '#F59E0B', sort_order: 4 },
      ];

      const { error: catErr } = await supabase.from('categories').insert(defaultCategories);
      if (catErr) {
        alert(`생성 중 오류: ${catErr.message}`);
      } else {
        alert('기본 카테고리와 결제수단이 성공적으로 생성되었습니다!');
        fetchBaseData();
      }
    } catch (err: any) {
      alert(`오류 발생: ${err?.message || err}`);
    } finally {
      setSeeding(false);
    }
  };

  /**
   * 새 내역 추가 모달 열기
   */
  const handleOpenAddModal = () => {
    setEditingTransaction(null);
    setIsModalOpen(true);
  };

  /**
   * 특정 내역 수정 모달 열기
   */
  const handleEditTransaction = (tx: Transaction) => {
    setEditingTransaction(tx);
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* 1. 상단 전역 헤더 & 모바일 하단 탭 바 */}
      <Header
        userEmail={userEmail}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* 2. 메인 컨텐츠 영역 (모바일 하단 탭 바 높이를 고려하여 pb-24 패딩 적용) */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 sm:pb-8">
        {/* DB 오류 배너 */}
        {dbErrorMessage && (
          <div className="mb-4 sm:mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">데이터베이스 연동 안내</div>
              <div>{dbErrorMessage}</div>
            </div>
          </div>
        )}

        {/* 초기 카테고리가 없을 때 자동 생성 배너 */}
        {!dbErrorMessage && categories.length === 0 && !loading && (
          <div className="mb-4 sm:mb-6 p-4 sm:p-5 bg-blue-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-blue-900 text-sm">
                  기본 카테고리가 아직 등록되지 않았습니다
                </h4>
                <p className="text-xs text-blue-700 mt-0.5">
                  버튼 한 번으로 네이버 가계부 표준 카테고리와 기본 결제수단을 즉시 생성할 수 있습니다.
                </p>
              </div>
            </div>

            <button
              onClick={handleSeedDefaultData}
              disabled={seeding}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-blue-200 transition shrink-0 cursor-pointer disabled:opacity-50"
            >
              {seeding ? '생성 중...' : '기본 카테고리 자동 생성하기'}
            </button>
          </div>
        )}

        {loading && populatedTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mb-3 text-blue-600" />
            <p className="text-sm font-medium">가계부 데이터를 불러오는 중입니다...</p>
          </div>
        ) : (
          <>
            {/* [탭 1] 가계부 거래내역 목록 */}
            {activeTab === 'transactions' && (
              <TransactionList
                transactions={populatedTransactions}
                currentMonth={currentMonth || new Date().toISOString().slice(0, 7)}
                setCurrentMonth={setCurrentMonth}
                onOpenAddModal={handleOpenAddModal}
                onEditTransaction={handleEditTransaction}
                onRefresh={() => {
                  fetchTransactions();
                  fetchBaseData();
                }}
              />
            )}

            {/* [탭 2] 자산 & 은행 계좌 종합 관리 */}
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

            {/* [탭 4] 네이버 가계부 / 엑셀 가져오기 */}
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

      {/* 3. 거래내역 등록/수정 모달 */}
      <TransactionFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
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
