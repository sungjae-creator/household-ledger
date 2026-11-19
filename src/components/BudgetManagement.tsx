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
  TrendingDown,
  TrendingUp,
  BarChart2,
  ArrowRight,
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
}

/**
 * 네이버 가계부 완벽 호환 '예산쓰기' & '예산반성' 컴포넌트
 */
export default function BudgetManagement({
  categories,
  currentMonth,
  setCurrentMonth,
  transactions,
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
   * 해당 월(currentMonth)의 DB 예산 불러오기
   */
  const fetchMonthlyBudgets = useCallback(async () => {
    if (!currentMonth) return;
    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('year_month', currentMonth);

      if (error) {
        console.error('예산 로딩 오류:', error);
      } else {
        const map: { [major: string]: number } = {};
        (data || []).forEach((b: Budget) => {
          map[b.category_major] = Number(b.amount);
        });
        setBudgetMap(map);
      }
    } catch (err) {
      console.error('예산 데이터 조회 실패:', err);
    }
  }, [supabase, currentMonth]);

  useEffect(() => {
    fetchMonthlyBudgets();
    setSaveSuccess(null);
    setSaveError(null);
  }, [fetchMonthlyBudgets]);

  /**
   * 예산 금액 입력 핸들러
   */
  const handleAmountChange = (major: string, valStr: string) => {
    const num = parseFloat(valStr.replace(/,/g, '')) || 0;
    setBudgetMap((prev) => ({
      ...prev,
      [major]: num,
    }));
  };

  /**
   * [예산쓰기] 현재 입력된 예산 일괄 저장
   */
  const handleSaveBudgets = async () => {
    setSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) throw new Error('로그인이 필요합니다.');

      // 대분류별 예산 upsert 데이터 생성
      const upsertData = expenseMajors.map((major) => ({
        user_id: user.id,
        year_month: currentMonth,
        category_major: major,
        amount: budgetMap[major] || 0,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('budgets')
        .upsert(upsertData, { onConflict: 'user_id, year_month, category_major' });

      if (error) throw error;

      setSaveSuccess(`${currentMonth} 예산이 안전하게 저장되었습니다!`);
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (err: any) {
      setSaveError(`예산 저장 실패: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  /**
   * [네이버 가계부 핵심] 이전 달 예산 그대로 복사해오기
   */
  const handleCopyPrevMonthBudget = async () => {
    let [year, month] = currentMonth.split('-').map(Number);
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    const prevMonthStr = `${year}-${String(month).padStart(2, '0')}`;

    if (!confirm(`${prevMonthStr}의 예산 설정을 ${currentMonth}로 복사하시겠습니까?`)) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('year_month', prevMonthStr);

      if (error) throw error;

      if (!data || data.length === 0) {
        alert(`${prevMonthStr}에 등록된 예산 데이터가 없습니다.`);
        return;
      }

      const map: { [major: string]: number } = {};
      data.forEach((b: Budget) => {
        map[b.category_major] = Number(b.amount);
      });

      setBudgetMap((prev) => ({
        ...prev,
        ...map,
      }));

      alert(`${prevMonthStr} 예산을 불러왔습니다. 확인 후 [예산 저장]을 눌러주세요.`);
    } catch (err: any) {
      alert(`복사 실패: ${err?.message || err}`);
    }
  };

  // =========================================================================
  // 1. [예산쓰기] 당월 지출 집계 계산
  // =========================================================================
  const monthlyExpenseMap = useMemo(() => {
    const map: { [major: string]: number } = {};
    transactions
      .filter((t) => t.type === 'EXPENSE' && !t.exclude_from_stats)
      .forEach((t) => {
        const major = t.category ? t.category.major_name : '기타';
        map[major] = (map[major] || 0) + Number(t.amount);
      });
    return map;
  }, [transactions]);

  // 당월 수입 합계
  const monthlyTotalIncome = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'INCOME' && !t.exclude_from_stats)
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [transactions]);

  // 당월 총 예산, 총 지출, 총 남은 돈
  const totalBudgetAmount = useMemo(() => {
    return expenseMajors.reduce((sum, m) => sum + (budgetMap[m] || 0), 0);
  }, [expenseMajors, budgetMap]);

  const totalExpenseAmount = useMemo(() => {
    return Object.values(monthlyExpenseMap).reduce((sum, val) => sum + val, 0);
  }, [monthlyExpenseMap]);

  const totalRemainingAmount = totalBudgetAmount - totalExpenseAmount;

  // =========================================================================
  // 2. [예산반성] 1년치 데이터 조회 및 매트릭스 계산
  // =========================================================================
  const fetchYearlyReviewData = useCallback(async (year: number) => {
    setLoadingReview(true);
    try {
      const startDate = `${year}-01-01`;
      const endDate = `${year + 1}-01-01`;

      // 1년치 거래내역
      const { data: txData } = await supabase
        .from('transactions')
        .select('*, category:categories(*)')
        .gte('transaction_date', startDate)
        .lt('transaction_date', endDate);

      // 1년치 예산
      const { data: bgData } = await supabase
        .from('budgets')
        .select('*')
        .gte('year_month', `${year}-01`)
        .lte('year_month', `${year}-12`);

      setYearlyTransactions((txData || []) as Transaction[]);
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
    // 1. 전체 합계 행
    const totalRow: { [m: number]: number } = {};
    for (let m = 1; m <= 12; m++) {
      const mStr = `${reviewYear}-${String(m).padStart(2, '0')}`;
      const bg = yearlyBudgets.filter((b) => b.year_month === mStr).reduce((s, b) => s + Number(b.amount), 0);
      const ex = yearlyTransactions
        .filter((t) => t.type === 'EXPENSE' && !t.exclude_from_stats && t.transaction_date.startsWith(mStr))
        .reduce((s, t) => s + Number(t.amount), 0);
      totalRow[m] = bg - ex;
    }

    // 2. 대분류별 행
    const rows = expenseMajors.map((major) => {
      const monthValues: { [m: number]: number } = {};
      for (let m = 1; m <= 12; m++) {
        const mStr = `${reviewYear}-${String(m).padStart(2, '0')}`;
        const bg = yearlyBudgets
          .filter((b) => b.year_month === mStr && b.category_major === major)
          .reduce((s, b) => s + Number(b.amount), 0);

        const ex = yearlyTransactions
          .filter(
            (t) =>
              t.type === 'EXPENSE' &&
              !t.exclude_from_stats &&
              t.transaction_date.startsWith(mStr) &&
              t.category?.major_name === major
          )
          .reduce((s, t) => s + Number(t.amount), 0);

        monthValues[m] = bg - ex;
      }
      return {
        major,
        values: monthValues,
      };
    });

    return { totalRow, rows };
  }, [reviewYear, expenseMajors, yearlyBudgets, yearlyTransactions]);

  return (
    <div className="space-y-6">
      {/* 1. 상단 모드 탭 (예산쓰기 vs 예산반성) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setTab('BUDGET_WRITE')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${
              tab === 'BUDGET_WRITE'
                ? 'bg-white text-emerald-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>예산쓰기</span>
          </button>

          <button
            onClick={() => setTab('BUDGET_REVIEW')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${
              tab === 'BUDGET_REVIEW'
                ? 'bg-white text-red-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            <span>예산반성</span>
          </button>
        </div>

        {/* 기간 선택 컨트롤러 */}
        {tab === 'BUDGET_WRITE' ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition"
              title="이전 달"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-bold text-slate-800 text-base sm:text-lg min-w-[130px] text-center">
              {currentMonth.split('-')[0]}년 {currentMonth.split('-')[1]}월
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition"
              title="다음 달"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReviewYear((y) => y - 1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition"
              title="이전 해"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-bold text-red-900 text-base sm:text-lg min-w-[120px] text-center">
              {reviewYear}년 예산반성
            </span>
            <button
              onClick={() => setReviewYear((y) => y + 1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition"
              title="다음 해"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 2. [예산쓰기] 화면 (네이버 가계부 스크린샷 1과 동일 구조)               */}
      {/* ===================================================================== */}
      {tab === 'BUDGET_WRITE' && (
        <div className="space-y-6">
          {/* 상단 알림 메시지 */}
          {saveSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{saveSuccess}</span>
            </div>
          )}

          {saveError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* 상단 요약 카드 & 액션 버튼 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <span>지출예산 작성</span>
                  <span className="text-xs text-slate-400 font-normal">
                    (수입 합계: +{monthlyTotalIncome.toLocaleString()}원)
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  각 카테고리별 목표 지출 예산을 설정하고 지출을 통제하세요.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={handleCopyPrevMonthBudget}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>이전 달 예산 복사</span>
                </button>

                <button
                  onClick={handleSaveBudgets}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-200 transition cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? '저장 중...' : '예산 저장'}</span>
                </button>
              </div>
            </div>

            {/* 3단 수치 배너 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl text-center">
                <span className="text-[11px] text-slate-500 font-semibold block mb-0.5">총 예산</span>
                <span className="text-sm sm:text-lg font-extrabold text-slate-800">
                  {totalBudgetAmount.toLocaleString()}원
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl text-center">
                <span className="text-[11px] text-slate-500 font-semibold block mb-0.5">실제 지출</span>
                <span className="text-sm sm:text-lg font-extrabold text-red-600">
                  {totalExpenseAmount.toLocaleString()}원
                </span>
              </div>

              <div className={`p-3 rounded-xl text-center ${totalRemainingAmount >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <span className="text-[11px] font-semibold block mb-0.5 text-slate-600">남은 돈</span>
                <span
                  className={`text-sm sm:text-lg font-extrabold ${
                    totalRemainingAmount >= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {totalRemainingAmount.toLocaleString()}원
                </span>
              </div>
            </div>
          </div>

          {/* 예산쓰기 테이블 (네이버 가계부 스타일) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">분류 (대분류)</th>
                    <th className="px-5 py-3 text-right w-44">예산 (원)</th>
                    <th className="px-5 py-3 text-right w-40">실제 지출</th>
                    <th className="px-5 py-3 text-right w-44">남은 돈 (예산 - 지출)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenseMajors.map((major) => {
                    const budget = budgetMap[major] || 0;
                    const spent = monthlyExpenseMap[major] || 0;
                    const remaining = budget - spent;
                    const isOver = remaining < 0;

                    return (
                      <tr key={major} className="hover:bg-slate-50/60 transition">
                        <td className="px-5 py-3 font-bold text-slate-700">{major}</td>
                        <td className="px-5 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={budgetMap[major] !== undefined ? budgetMap[major] : ''}
                            onChange={(e) => handleAmountChange(major, e.target.value)}
                            placeholder="0"
                            className="w-32 px-2.5 py-1 text-right bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-slate-700">
                          {spent > 0 ? `${spent.toLocaleString()}원` : '0원'}
                        </td>
                        <td
                          className={`px-5 py-3 text-right font-extrabold ${
                            isOver ? 'text-red-600' : 'text-slate-800'
                          }`}
                        >
                          {remaining.toLocaleString()}원
                        </td>
                      </tr>
                    );
                  })}

                  {/* 합계 행 */}
                  <tr className="bg-slate-50/90 font-bold border-t-2 border-slate-200">
                    <td className="px-5 py-3.5 text-slate-900">합계</td>
                    <td className="px-5 py-3.5 text-right text-slate-900">
                      {totalBudgetAmount.toLocaleString()}원
                    </td>
                    <td className="px-5 py-3.5 text-right text-emerald-600">
                      {totalExpenseAmount.toLocaleString()}원
                    </td>
                    <td
                      className={`px-5 py-3.5 text-right font-black ${
                        totalRemainingAmount >= 0 ? 'text-slate-900' : 'text-red-600'
                      }`}
                    >
                      {totalRemainingAmount.toLocaleString()}원
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. [예산반성] 화면 (네이버 가계부 스크린샷 2와 동일 구조)               */}
      {/* ===================================================================== */}
      {tab === 'BUDGET_REVIEW' && (
        <div className="space-y-6">
          {/* 상단 1월~12월 성과 막대 그래프 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base">예산 대비 지출 성과 (남은 돈 vs 예산 초과)</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  빨간색 막대는 예산을 초과한 달이며, 파란색 막대는 예산 내에서 절약한 달입니다.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-blue-600 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> 남은 돈
                </span>
                <span className="flex items-center gap-1 text-red-600 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> 예산 초과
                </span>
              </div>
            </div>

            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearlyReviewChartData} margin={{ top: 20, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    tickFormatter={(val) => `${(val / 10000).toFixed(0)}만`}
                  />
                  <Tooltip
                    formatter={(val: unknown) => `${Number(val).toLocaleString()}원`}
                  />
                  <ReferenceLine y={0} stroke="#94A3B8" />
                  <Bar dataKey="net" name="예산 잔여/초과">
                    {yearlyReviewChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.isOver ? '#EF4444' : '#3B82F6'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 대분류별 1월~12월 상세 매트릭스 표 (스크린샷 2와 100% 동일) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="font-bold text-slate-800 text-sm">
                {reviewYear}년 대분류별 월간 예산 잔여/초과 상세표
              </h4>
              {loadingReview && (
                <span className="text-xs text-red-600 font-semibold animate-pulse">
                  데이터 집계 중...
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[11px] text-right">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 text-left sticky left-0 bg-slate-50 shadow-xs">대분류</th>
                    {Array.from({ length: 12 }, (_, i) => (
                      <th key={i} className="px-2.5 py-2.5 min-w-[85px]">
                        {i + 1}월
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* 합계 행 (스크린샷처럼 최상단에 강조) */}
                  <tr className="bg-slate-100/80 font-extrabold border-b border-slate-200">
                    <td className="px-3 py-2.5 text-left text-slate-900 sticky left-0 bg-slate-100 shadow-xs">
                      합계
                    </td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const net = matrixData.totalRow[i + 1] || 0;
                      return (
                        <td
                          key={i}
                          className={`px-2.5 py-2.5 ${
                            net < 0 ? 'text-red-600 font-bold' : net > 0 ? 'text-blue-700' : 'text-slate-400'
                          }`}
                        >
                          {net !== 0 ? net.toLocaleString() : '-'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* 각 대분류별 행 */}
                  {matrixData.rows.map((row) => (
                    <tr key={row.major} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 text-left font-semibold text-slate-700 sticky left-0 bg-white shadow-xs">
                        {row.major}
                      </td>
                      {Array.from({ length: 12 }, (_, i) => {
                        const val = row.values[i + 1] || 0;
                        return (
                          <td
                            key={i}
                            className={`px-2.5 py-2 font-mono ${
                              val < 0 ? 'text-red-500 font-semibold' : val > 0 ? 'text-slate-700' : 'text-slate-300'
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
