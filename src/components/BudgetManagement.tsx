'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Category, Transaction, Budget } from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import {
  Calculator,
  ChevronLeft,
  ChevronRight,
  Copy,
  Save,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  RefreshCw,
  Coins,
  TrendingDown,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts';

interface BudgetManagementProps {
  categories: Category[];
  currentMonth: string; // YYYY-MM
  setCurrentMonth: (month: string) => void;
  transactions: Transaction[]; // 당월 거래내역
  userId?: string | null; // 부모 컴포넌트(page.tsx)에서 전달받은 사용자 고유 ID
}

/**
 * [보안 및 안정성 최적화]
 * 세션 토큰 만료 시 자동 갱신을 지원하는 안전한 사용자 정보 조회 헬퍼 함수
 */
async function getSafeUser(supabase: ReturnType<typeof createClient>) {
  try {
    // 1. 브라우저 로컬 세션 확인 (유효기간 체크 및 자동 갱신)
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionData?.session?.user) {
      return { user: sessionData.session.user, error: null };
    }

    // 2. 만료된 경우 세션 토큰 강제 갱신(Refresh) 시도
    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshData?.user) {
      return { user: refreshData.user, error: null };
    }

    // 3. 서버 API 직접 확인
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userData?.user) {
      return { user: userData.user, error: null };
    }

    return {
      user: null,
      error:
        userErr ||
        refreshErr ||
        sessionErr ||
        new Error('로그인 세션이 만료되었습니다. 페이지를 새로고침하거나 다시 로그인해 주세요.'),
    };
  } catch (e: any) {
    return { user: null, error: e };
  }
}

/**
 * [모바일/화면 최적화] 예산반성용 초경량 미니멀 툴팁
 */
function BudgetReviewCompactTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const val = Number(payload[0].value);
    return (
      <div className="bg-slate-900/90 text-white text-[11px] px-2.5 py-1 rounded-lg shadow-md pointer-events-none backdrop-blur-xs flex items-center gap-1.5 whitespace-nowrap border border-slate-700/50">
        <span className="text-slate-300 font-medium">{label}:</span>
        <span className={`font-bold ${val >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
          {val >= 0 ? `+${val.toLocaleString()}원 (남은돈)` : `${val.toLocaleString()}원 (초과)`}
        </span>
      </div>
    );
  }
  return null;
}

/**
 * [PC 전용 뷰] 예산 vs 실제 지출 비교 상세 툴팁
 */
function BudgetVsExpenseTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const budget = Number(payload.find((p: any) => p.dataKey === 'budget')?.value || 0);
    const expense = Number(payload.find((p: any) => p.dataKey === 'expense')?.value || 0);
    const remaining = budget - expense;

    return (
      <div className="bg-slate-900/95 text-white text-xs p-3 rounded-xl shadow-xl backdrop-blur-xs border border-slate-700 space-y-1.5 min-w-[160px]">
        <div className="font-bold text-slate-200 border-b border-slate-700 pb-1">
          {label}
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-blue-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            설정 예산:
          </span>
          <span className="font-bold font-mono">{budget.toLocaleString()}원</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-rose-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400"></span>
            실제 지출:
          </span>
          <span className="font-bold font-mono">{expense.toLocaleString()}원</span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-700/80 font-bold">
          <span className="text-slate-400">남은 돈:</span>
          <span className={remaining < 0 ? 'text-rose-400' : 'text-emerald-400'}>
            {remaining.toLocaleString()}원
          </span>
        </div>
      </div>
    );
  }
  return null;
}

/**
 * 네이버 가계부 완벽 호환 '예산쓰기' & '예산반성' 컴포넌트
 *
 * [PC 전용 기능 추가]
 * - PC 화면(hidden sm:block): 예산 테이블 상단에 '설정 예산' vs '실제 지출' 비교 막대 그래프 노출
 * - 모바일 화면(block sm:hidden): 모바일 환경에서는 그래프를 숨기고 기존 카드형 뷰를 그대로 유지
 */
export default function BudgetManagement({
  categories,
  currentMonth,
  setCurrentMonth,
  transactions,
  userId: propUserId,
}: BudgetManagementProps) {
  const supabase = createClient();

  // 상단 탭: 'BUDGET_WRITE' (예산쓰기) | 'BUDGET_REVIEW' (예산반성)
  const [tab, setTab] = useState<'BUDGET_WRITE' | 'BUDGET_REVIEW'>('BUDGET_WRITE');

  // 예산쓰기: 현재 편집 중인 대분류별 예산 금액 맵 { '식비': 300000, '주거/통신': 350000 }
  const [budgetMap, setBudgetMap] = useState<{ [major: string]: number }>({});
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 예산반성: 기준 연도 (기본값: currentMonth의 연도)
  const [reviewYear, setReviewYear] = useState<number>(
    currentMonth ? parseInt(currentMonth.split('-')[0], 10) : new Date().getFullYear()
  );
  // 연간 1년치 예산 및 거래내역
  const [yearlyBudgets, setYearlyBudgets] = useState<Budget[]>([]);
  const [yearlyTransactions, setYearlyTransactions] = useState<Transaction[]>([]);
  const [loadingReview, setLoadingReview] = useState<boolean>(false);

  // 고유 지출 대분류 목록
  const expenseMajors = useMemo(() => {
    const list = categories
      .filter((c) => c.type === 'EXPENSE')
      .map((c) => c.major_name);
    return Array.from(new Set(list));
  }, [categories]);

  /**
   * 월간 이동 (타임존 오차 없는 수학적 계산)
   */
  const handlePrevMonth = () => {
    let [year, month] = currentMonth.split('-').map(Number);
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    setCurrentMonth(`${year}-${String(month).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    let [year, month] = currentMonth.split('-').map(Number);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    setCurrentMonth(`${year}-${String(month).padStart(2, '0')}`);
  };

  /**
   * 현재 월의 기저장된 예산 불러오기
   */
  const fetchMonthlyBudgets = useCallback(async () => {
    if (!currentMonth) return;
    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('year_month', currentMonth);

      if (error) {
        console.error('예산 데이터 조회 실패:', error);
        return;
      }

      const map: { [major: string]: number } = {};
      if (data) {
        data.forEach((b: Budget) => {
          map[b.category_major] = Number(b.amount);
        });
      }
      setBudgetMap(map);
    } catch (err) {
      console.error('예산 조회 중 예외:', err);
    }
  }, [currentMonth, supabase]);

  useEffect(() => {
    fetchMonthlyBudgets();
  }, [fetchMonthlyBudgets]);

  /**
   * 예산 금액 입력 변경 핸들러
   */
  const handleAmountChange = (major: string, value: string) => {
    const num = parseFloat(value.replace(/,/g, '')) || 0;
    setBudgetMap((prev) => ({
      ...prev,
      [major]: num,
    }));
  };

  /**
   * 이전 달 예산 복사하기
   */
  const handleCopyPrevMonthBudget = async () => {
    let [year, month] = currentMonth.split('-').map(Number);
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    const prevMonthStr = `${year}-${String(month).padStart(2, '0')}`;

    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('year_month', prevMonthStr);

      if (error) throw error;
      if (!data || data.length === 0) {
        alert(`${prevMonthStr}월에 등록된 예산 데이터가 없습니다.`);
        return;
      }

      const newMap: { [major: string]: number } = { ...budgetMap };
      data.forEach((b: Budget) => {
        newMap[b.category_major] = Number(b.amount);
      });
      setBudgetMap(newMap);
      setSaveSuccess(`${prevMonthStr}월 예산 데이터를 성공적으로 복사해 왔습니다! 저장 버튼을 눌러 적용해 주세요.`);
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err: any) {
      alert(`이전 달 예산 복사 실패: ${err.message}`);
    }
  };

  /**
   * 예산 일괄 저장 (Supabase upsert)
   */
  const handleSaveBudgets = async () => {
    setSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      let activeUserId = propUserId;
      if (!activeUserId) {
        const { user: authUser, error: authErr } = await getSafeUser(supabase);
        if (authErr || !authUser) {
          throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
        }
        activeUserId = authUser.id;
      }

      const rowsToUpsert = expenseMajors.map((major) => ({
        user_id: activeUserId,
        year_month: currentMonth,
        category_major: major,
        amount: budgetMap[major] || 0,
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertErr } = await supabase
        .from('budgets')
        .upsert(rowsToUpsert, { onConflict: 'user_id,year_month,category_major' });

      if (upsertErr) throw upsertErr;

      setSaveSuccess(`${currentMonth}월 예산이 안전하게 저장되었습니다.`);
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (err: any) {
      setSaveError(`예산 저장 실패: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 당월 카테고리 대분류별 실제 지출액 맵 계산
  const monthlyExpenseMap = useMemo(() => {
    const map: { [major: string]: number } = {};
    transactions
      .filter((t) => t.type === 'EXPENSE' && !t.exclude_from_stats)
      .forEach((t) => {
        const major = t.category?.major_name || '기타';
        map[major] = (map[major] || 0) + Number(t.amount);
      });
    return map;
  }, [transactions]);

  // 당월 총 수입
  const monthlyTotalIncome = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'INCOME' && !t.exclude_from_stats)
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [transactions]);

  // 당월 총 예산 합계
  const totalBudgetAmount = useMemo(() => {
    return expenseMajors.reduce((sum, major) => sum + (budgetMap[major] || 0), 0);
  }, [expenseMajors, budgetMap]);

  // 당월 총 실제 지출 합계
  const totalExpenseAmount = useMemo(() => {
    return expenseMajors.reduce((sum, major) => sum + (monthlyExpenseMap[major] || 0), 0);
  }, [expenseMajors, monthlyExpenseMap]);

  // 남은 돈 (총 예산 - 총 지출)
  const totalRemainingAmount = totalBudgetAmount - totalExpenseAmount;

  // [PC 전용 차트 데이터] 대분류별 예산 vs 실제 지출 비교 데이터
  const budgetVsExpenseChartData = useMemo(() => {
    return expenseMajors.map((major) => {
      const budget = budgetMap[major] || 0;
      const expense = monthlyExpenseMap[major] || 0;
      const remaining = budget - expense;
      return {
        major,
        budget,
        expense,
        remaining,
      };
    });
  }, [expenseMajors, budgetMap, monthlyExpenseMap]);

  // ===================================================================
  // [예산반성] 1년치 데이터 조회 및 매트릭스 계산
  // ===================================================================
  const fetchYearlyReviewData = useCallback(async (year: number) => {
    setLoadingReview(true);
    try {
      const startYearStr = `${year}-01`;
      const endYearStr = `${year}-12`;

      // 1년치 거래내역 조회
      const { data: txData, error: txErr } = await supabase
        .from('transactions')
        .select(`
          *,
          category:categories(*)
        `)
        .gte('transaction_date', `${startYearStr}-01`)
        .lte('transaction_date', `${endYearStr}-31`)
        .eq('exclude_from_stats', false);

      if (txErr) console.error('예산반성 거래내역 에러:', txErr);
      setYearlyTransactions((txData || []) as Transaction[]);

      // 1년치 예산 데이터 조회
      const { data: bgData, error: bgErr } = await supabase
        .from('budgets')
        .select('*')
        .gte('year_month', startYearStr)
        .lte('year_month', endYearStr);

      if (bgErr) console.error('예산반성 예산데이터 에러:', bgErr);
      setYearlyBudgets((bgData || []) as Budget[]);
    } catch (err) {
      console.error('예산반성 로딩 실패:', err);
    } finally {
      setLoadingReview(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (tab === 'BUDGET_REVIEW') {
      fetchYearlyReviewData(reviewYear);
    }
  }, [tab, reviewYear, fetchYearlyReviewData]);

  // 예산반성: 1월~12월 월별 예산 vs 지출 성과 (남은돈 / 초과)
  const yearlyReviewChartData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const mStr = `${reviewYear}-${String(i + 1).padStart(2, '0')}`;
      const monthLabel = `${i + 1}월`;

      // 해당 월 총 예산
      const monthBudget = yearlyBudgets
        .filter((b) => b.year_month === mStr)
        .reduce((sum, b) => sum + Number(b.amount), 0);

      // 해당 월 총 실제 지출
      const monthExpense = yearlyTransactions
        .filter((t) => t.type === 'EXPENSE' && !t.exclude_from_stats && t.transaction_date.startsWith(mStr))
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const net = monthBudget - monthExpense; // 양수: 남은 돈, 음수: 예산 초과
      return {
        month: monthLabel,
        net,
        isOver: net < 0,
      };
    });
  }, [reviewYear, yearlyBudgets, yearlyTransactions]);

  // 예산반성: 대분류별 1월~12월 남은 돈 매트릭스 계산
  const matrixData = useMemo(() => {
    // 월별 총합 행
    const totalRow: { [month: number]: number } = {};
    for (let m = 1; m <= 12; m++) {
      const mStr = `${reviewYear}-${String(m).padStart(2, '0')}`;
      const mBudget = yearlyBudgets
        .filter((b) => b.year_month === mStr)
        .reduce((s, b) => s + Number(b.amount), 0);
      const mExpense = yearlyTransactions
        .filter((t) => t.type === 'EXPENSE' && !t.exclude_from_stats && t.transaction_date.startsWith(mStr))
        .reduce((s, t) => s + Number(t.amount), 0);
      totalRow[m] = mBudget - mExpense;
    }

    // 각 대분류별 1~12월 값
    const rows = expenseMajors.map((major) => {
      const values: { [month: number]: number } = {};
      for (let m = 1; m <= 12; m++) {
        const mStr = `${reviewYear}-${String(m).padStart(2, '0')}`;
        // 해당 대분류 해당 월 예산
        const bg = yearlyBudgets.find((b) => b.year_month === mStr && b.category_major === major);
        const bAmount = bg ? Number(bg.amount) : 0;

        // 해당 대분류 해당 월 지출
        const eAmount = yearlyTransactions
          .filter(
            (t) =>
              t.type === 'EXPENSE' &&
              !t.exclude_from_stats &&
              t.transaction_date.startsWith(mStr) &&
              t.category?.major_name === major
          )
          .reduce((s, t) => s + Number(t.amount), 0);

        values[m] = bAmount - eAmount;
      }
      return {
        major,
        values,
      };
    });

    return { totalRow, rows };
  }, [expenseMajors, reviewYear, yearlyBudgets, yearlyTransactions]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. 상단 서브 탭 & 연월 선택기 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
        {/* 서브 탭 버튼 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab('BUDGET_WRITE')}
            className={`px-3.5 sm:px-4 py-2 font-bold text-xs sm:text-sm rounded-xl transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap shadow-xs cursor-pointer ${
              tab === 'BUDGET_WRITE'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:text-slate-900 bg-white sm:bg-transparent border sm:border-transparent border-slate-200'
            }`}
          >
            <Calculator className="w-4 h-4 shrink-0" />
            <span>예산쓰기</span>
          </button>
          <button
            onClick={() => setTab('BUDGET_REVIEW')}
            className={`px-3.5 sm:px-4 py-2 font-bold text-xs sm:text-sm rounded-xl transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap shadow-xs cursor-pointer ${
              tab === 'BUDGET_REVIEW'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:text-slate-900 bg-white sm:bg-transparent border sm:border-transparent border-slate-200'
            }`}
          >
            <BarChart2 className="w-4 h-4 shrink-0" />
            <span>예산반성</span>
          </button>
        </div>

        {/* 월/연도 이동 컨트롤러 */}
        {tab === 'BUDGET_WRITE' ? (
          <div className="flex items-center justify-between sm:justify-end gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs self-start sm:self-auto">
            <button
              onClick={handlePrevMonth}
              className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
              title="이전 달"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-slate-800 text-xs sm:text-sm px-1">{currentMonth}</span>
            <button
              onClick={handleNextMonth}
              className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
              title="다음 달"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between sm:justify-end gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs self-start sm:self-auto">
            <button
              onClick={() => setReviewYear((y) => y - 1)}
              className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
              title="이전 연도"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-slate-800 text-xs sm:text-sm px-1">{reviewYear}년</span>
            <button
              onClick={() => setReviewYear((y) => y + 1)}
              className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
              title="다음 연도"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 피드백 메시지 알림 바 */}
      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center gap-2 text-xs sm:text-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {saveError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-center gap-2 text-xs sm:text-sm">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. [예산쓰기] 메인 뷰                                              */}
      {/* =================================================================== */}
      {tab === 'BUDGET_WRITE' && (
        <div className="space-y-4 sm:space-y-6">
          {/* 상단 컨트롤 및 가이드 문구 */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                  <span>지출예산 작성</span>
                  <span className="text-xs font-normal text-slate-500 whitespace-nowrap">
                    (수입 합계: +{monthlyTotalIncome.toLocaleString()}원)
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  각 카테고리별 목표 지출 예산을 설정하고 지출을 통제하세요.
                </p>
              </div>

              {/* 액션 버튼 그룹 */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyPrevMonthBudget}
                  className="flex-1 sm:flex-none justify-center px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>이전 달 예산 복사</span>
                </button>
                <button
                  onClick={handleSaveBudgets}
                  disabled={saving}
                  className="flex-1 sm:flex-none justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? '저장 중...' : '예산 저장'}</span>
                </button>
              </div>
            </div>

            {/* 상단 요약 카드 */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="bg-slate-50 border border-slate-200/80 p-2.5 sm:p-3.5 rounded-xl text-center">
                <span className="text-[11px] sm:text-xs text-slate-500 font-medium block whitespace-nowrap">
                  총 예산
                </span>
                <p className="text-xs sm:text-lg font-bold text-slate-900 mt-1 truncate">
                  {totalBudgetAmount.toLocaleString()}원
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 p-2.5 sm:p-3.5 rounded-xl text-center">
                <span className="text-[11px] sm:text-xs text-slate-500 font-medium block whitespace-nowrap">
                  실제 지출
                </span>
                <p className="text-xs sm:text-lg font-bold text-rose-600 mt-1 truncate">
                  {totalExpenseAmount.toLocaleString()}원
                </p>
              </div>

              <div
                className={`p-2.5 sm:p-3.5 rounded-xl text-center border ${
                  totalRemainingAmount < 0
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                <span className="text-[11px] sm:text-xs font-medium block whitespace-nowrap">
                  {totalRemainingAmount < 0 ? '예산 초과' : '남은 돈'}
                </span>
                <p className="text-xs sm:text-lg font-bold mt-1 truncate">
                  {totalRemainingAmount.toLocaleString()}원
                </p>
              </div>
            </div>
          </div>

          {/* =================================================================== */}
          {/* [모바일 전용 뷰: block sm:hidden] 스마트폰 화면에 딱 맞는 카드형 리스트 */}
          {/* (사용자 요청: 모바일에서는 그래프를 보여주지 않고 기존 카드형 뷰 유지) */}
          {/* =================================================================== */}
          <div className="block sm:hidden space-y-2.5">
            {expenseMajors.map((major) => {
              const budget = budgetMap[major] || 0;
              const expense = monthlyExpenseMap[major] || 0;
              const remaining = budget - expense;

              return (
                <div
                  key={major}
                  className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5"
                >
                  {/* 1행: 대분류명 & 예산 입력 필드 */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 text-sm whitespace-nowrap">
                      {major}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-400 font-medium">예산</span>
                      <input
                        type="number"
                        value={budgetMap[major] !== undefined ? budgetMap[major] : ''}
                        onChange={(e) => handleAmountChange(major, e.target.value)}
                        placeholder="0"
                        className="w-28 px-2 py-1 text-right text-sm font-semibold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white"
                      />
                      <span className="text-xs text-slate-500 font-semibold">원</span>
                    </div>
                  </div>

                  {/* 2행: 실제 지출 & 남은 돈 실시간 계산 표시 */}
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 font-medium">
                    <div className="text-slate-500">
                      실제 지출: <span className="font-semibold text-slate-800">{expense.toLocaleString()}원</span>
                    </div>
                    <div className="whitespace-nowrap">
                      <span className="text-slate-400 mr-1">남은 돈:</span>
                      <span
                        className={`font-bold ${
                          remaining < 0
                            ? 'text-rose-600'
                            : remaining > 0
                            ? 'text-emerald-700'
                            : 'text-slate-400'
                        }`}
                      >
                        {remaining.toLocaleString()}원
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 모바일 하단 합계 요약 바 */}
            <div className="bg-slate-800 text-white p-3.5 rounded-2xl shadow-sm space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>총 예산 합계</span>
                <span className="font-bold text-white text-sm">{totalBudgetAmount.toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>총 실제 지출</span>
                <span className="font-bold text-rose-400">{totalExpenseAmount.toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-700 font-bold">
                <span className="text-slate-200">최종 남은 돈</span>
                <span className={totalRemainingAmount < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                  {totalRemainingAmount.toLocaleString()}원
                </span>
              </div>
            </div>
          </div>

          {/* =================================================================== */}
          {/* [PC 전용 뷰 1: hidden sm:block] 예산 vs 실제 지출 비교 막대 그래프       */}
          {/* =================================================================== */}
          <div className="hidden sm:block bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-emerald-600" />
                  <span>분류별 예산 vs 실제 지출 비교 그래프</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  각 대분류별로 설정한 목표 예산과 실제 지출액을 한눈에 대조합니다.
                </p>
              </div>

              {/* 범례 표시 */}
              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-blue-500 inline-block shrink-0" />
                  <span className="text-slate-600">설정 예산</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-rose-500 inline-block shrink-0" />
                  <span className="text-slate-600">실제 지출</span>
                </span>
              </div>
            </div>

            {/* 막대 그래프 영역 */}
            <div className="h-64 sm:h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={budgetVsExpenseChartData}
                  margin={{ top: 10, right: 10, left: -15, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey="major"
                    tickLine={false}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: '#94A3B8' }}
                    tickFormatter={(val) =>
                      val >= 10000 ? `${Math.round(val / 10000)}만` : val.toLocaleString()
                    }
                  />
                  <Tooltip content={<BudgetVsExpenseTooltip />} />
                  <Bar
                    dataKey="budget"
                    name="설정 예산"
                    fill="#3B82F6"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="expense"
                    name="실제 지출"
                    fill="#F43F5E"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* =================================================================== */}
          {/* [PC 전용 뷰 2: hidden sm:block] 넓은 화면용 시원한 4열 테이블           */}
          {/* =================================================================== */}
          <div className="hidden sm:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-4 whitespace-nowrap min-w-[120px]">분류 (대분류)</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap min-w-[140px]">예산 (원)</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap min-w-[120px]">실제 지출</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap min-w-[140px]">남은 돈 (예산 - 지출)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {expenseMajors.map((major) => {
                    const budget = budgetMap[major] || 0;
                    const expense = monthlyExpenseMap[major] || 0;
                    const remaining = budget - expense;

                    return (
                      <tr key={major} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                          {major}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <input
                            type="number"
                            value={budgetMap[major] !== undefined ? budgetMap[major] : ''}
                            onChange={(e) => handleAmountChange(major, e.target.value)}
                            placeholder="0"
                            className="w-32 px-2.5 py-1 text-right text-sm font-semibold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50 focus:bg-white transition-all"
                          />
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-700 whitespace-nowrap">
                          {expense.toLocaleString()}원
                        </td>
                        <td className="py-3 px-4 text-right font-bold whitespace-nowrap">
                          <span
                            className={
                              remaining < 0
                                ? 'text-rose-600'
                                : remaining > 0
                                ? 'text-emerald-700'
                                : 'text-slate-400'
                            }
                          >
                            {remaining.toLocaleString()}원
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50/80 font-bold border-t border-slate-200 text-sm">
                    <td className="py-3.5 px-4 text-slate-900 whitespace-nowrap">합계</td>
                    <td className="py-3.5 px-4 text-right text-slate-900 whitespace-nowrap">
                      {totalBudgetAmount.toLocaleString()}원
                    </td>
                    <td className="py-3.5 px-4 text-right text-emerald-700 whitespace-nowrap">
                      {totalExpenseAmount.toLocaleString()}원
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right whitespace-nowrap ${
                        totalRemainingAmount < 0 ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                    >
                      {totalRemainingAmount.toLocaleString()}원
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. [예산반성] 메인 뷰 (1월~12월 성과 그래프 & 대분류별 매트릭스 표)  */}
      {/* =================================================================== */}
      {tab === 'BUDGET_REVIEW' && (
        <div className="space-y-4 sm:space-y-6">
          {/* 3-1. 1년 성과 막대그래프 (네이버 가계부 스크린샷 완벽 재현) */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  예산 대비 지출 (1년 성과)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {reviewYear}년 1월~12월의 예산 달성 성과를 시각적으로 확인합니다.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-semibold self-start sm:self-auto">
                <span className="flex items-center gap-1.5 text-blue-600 whitespace-nowrap">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block shrink-0" />
                  남은돈 (절약)
                </span>
                <span className="flex items-center gap-1.5 text-red-500 whitespace-nowrap">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block shrink-0" />
                  예산초과
                </span>
              </div>
            </div>

            <div className="h-56 sm:h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearlyReviewChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="month" stroke="#64748B" fontSize={10} tickLine={false} />
                  <YAxis
                    stroke="#64748B"
                    fontSize={9}
                    tickLine={false}
                    tickFormatter={(v) => `${(v / 10000).toLocaleString()}만`}
                  />
                  {/* 초슬림 미니멀 툴팁 적용 */}
                  <Tooltip content={<BudgetReviewCompactTooltip />} />
                  <ReferenceLine y={0} stroke="#94A3B8" />
                  <Bar dataKey="net" radius={[4, 4, 0, 0]}>
                    {yearlyReviewChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.net >= 0 ? '#3B82F6' : '#EF4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3-2. 대분류별 1월~12월 상세 매트릭스 표 */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                  대분류별 월간 남은 돈 / 초과 상세 내역
                </h4>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  마이너스(-) 금액은 예산을 초과한 지출 항목입니다. (좌우로 스크롤하여 12개월 확인)
                </p>
              </div>
              {loadingReview && (
                <span className="text-xs text-red-600 font-semibold animate-pulse flex items-center gap-1 self-start sm:self-auto">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  데이터 집계 중...
                </span>
              )}
            </div>

            {/* 첫 번째 열 고정(Sticky) 및 찌그러짐 방지 적용 */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-[11px] sm:text-xs text-right border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 text-left sticky left-0 bg-slate-100 z-10 whitespace-nowrap min-w-[85px] sm:min-w-[100px] shadow-xs">
                      대분류
                    </th>
                    {Array.from({ length: 12 }, (_, i) => (
                      <th key={i} className="px-2.5 py-2.5 min-w-[75px] sm:min-w-[85px] whitespace-nowrap">
                        {i + 1}월
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* 합계 행 (최상단 강조) */}
                  <tr className="bg-slate-100/80 font-extrabold border-b border-slate-200">
                    <td className="px-3 py-2.5 text-left text-slate-900 sticky left-0 bg-slate-200/90 z-10 whitespace-nowrap min-w-[85px] sm:min-w-[100px] shadow-xs">
                      합계
                    </td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const net = matrixData.totalRow[i + 1] || 0;
                      return (
                        <td
                          key={i}
                          className={`px-2.5 py-2.5 whitespace-nowrap ${
                            net < 0 ? 'text-rose-600 font-bold' : net > 0 ? 'text-blue-700' : 'text-slate-400'
                          }`}
                        >
                          {net !== 0 ? net.toLocaleString() : '-'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* 각 대분류별 행 */}
                  {matrixData.rows.map((row) => (
                    <tr key={row.major} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3 py-2 text-left font-semibold text-slate-800 sticky left-0 bg-white z-10 whitespace-nowrap min-w-[85px] sm:min-w-[100px] shadow-xs border-r border-slate-100">
                        {row.major}
                      </td>
                      {Array.from({ length: 12 }, (_, i) => {
                        const val = row.values[i + 1] || 0;
                        return (
                          <td
                            key={i}
                            className={`px-2.5 py-2 font-mono whitespace-nowrap ${
                              val < 0 ? 'text-rose-500 font-semibold' : val > 0 ? 'text-slate-700' : 'text-slate-300'
                            }`}
                          >
                            {val !== 0 ? val.toLocaleString() : '0'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
