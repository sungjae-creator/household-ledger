'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Transaction, PaymentMethod } from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  PieChart as PieIcon,
  BarChart3,
  CreditCard,
  Award,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Coins,
  Calendar,
} from 'lucide-react';

interface AnalyticsDashboardProps {
  transactions: Transaction[];
  currentMonth: string; // YYYY-MM
  setCurrentMonth?: (month: string) => void;
  paymentMethods?: PaymentMethod[];
}

// 차트 색상 팔레트
const COLORS = [
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#64748B', // Slate
  '#84CC16', // Lime
];

/**
 * 엑셀 및 네이버 가계부를 뛰어넘는 정밀 통계 & 대시보드 컴포넌트
 */
export default function AnalyticsDashboard({
  transactions,
  currentMonth,
  setCurrentMonth,
  paymentMethods = [],
}: AnalyticsDashboardProps) {
  const supabase = createClient();

  // 대시보드 뷰 모드: 'MONTHLY' (월간 분석) | 'YEARLY' (연간 분석)
  const [viewMode, setViewMode] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

  // [신규 요청] 지출 현황 뷰 형태: 'PIE' (파이형) | 'BAR' (예산 vs 지출 비교 그래프형)
  const [expenseViewType, setExpenseViewType] = useState<'PIE' | 'BAR'>('PIE');

  // 당월 대분류별 예산 데이터 맵 { '식비': 300000, '주거/통신': 350000 }
  const [monthlyBudgets, setMonthlyBudgets] = useState<{ [major: string]: number }>({});

  // 연간 분석 기준 연도 (기본값: 현재 선택된 월의 연도)
  const initialYear = currentMonth ? parseInt(currentMonth.split('-')[0], 10) : new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);

  // 연간 1년치 전체 거래내역 상태
  const [yearlyTransactions, setYearlyTransactions] = useState<Transaction[]>([]);
  const [loadingYearly, setLoadingYearly] = useState<boolean>(false);

  /**
   * 해당 월의 예산 데이터 불러오기
   */
  const fetchMonthlyBudgets = useCallback(async () => {
    if (!currentMonth) return;
    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('year_month', currentMonth);

      if (!error && data) {
        const map: { [major: string]: number } = {};
        data.forEach((b: any) => {
          map[b.category_major] = Number(b.amount);
        });
        setMonthlyBudgets(map);
      }
    } catch (err) {
      console.error('예산 데이터 조회 실패:', err);
    }
  }, [supabase, currentMonth]);

  useEffect(() => {
    fetchMonthlyBudgets();
  }, [fetchMonthlyBudgets]);

  /**
   * 월간 분석: 이전 달로 이동
   */
  const handlePrevMonth = () => {
    if (!setCurrentMonth || !currentMonth) return;
    let [year, month] = currentMonth.split('-').map(Number);
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    const formattedMonth = String(month).padStart(2, '0');
    setCurrentMonth(`${year}-${formattedMonth}`);
  };

  /**
   * 월간 분석: 다음 달로 이동
   */
  const handleNextMonth = () => {
    if (!setCurrentMonth || !currentMonth) return;
    let [year, month] = currentMonth.split('-').map(Number);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const formattedMonth = String(month).padStart(2, '0');
    setCurrentMonth(`${year}-${formattedMonth}`);
  };

  /**
   * 연간 1년치 전체 거래내역 불러오기
   */
  const fetchYearlyData = useCallback(async (year: number) => {
    try {
      setLoadingYearly(true);
      const startDate = `${year}-01-01`;
      const endDate = `${year + 1}-01-01`;

      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          category:categories(*)
        `)
        .gte('transaction_date', startDate)
        .lt('transaction_date', endDate);

      if (error) {
        console.error('연간 거래내역 조회 실패:', error);
      } else {
        setYearlyTransactions((data || []) as Transaction[]);
      }
    } catch (err) {
      console.error('연간 통계 로딩 오류:', err);
    } finally {
      setLoadingYearly(false);
    }
  }, [supabase]);

  // 연간 모드로 전환되거나 기준 연도가 바뀔 때 1년치 데이터 조회
  useEffect(() => {
    if (viewMode === 'YEARLY') {
      fetchYearlyData(selectedYear);
    }
  }, [viewMode, selectedYear, fetchYearlyData]);

  // =========================================================================
  // 1. 월간 분석 데이터 계산
  // =========================================================================
  const monthlyExpenseTransactions = useMemo(() => {
    return transactions.filter(
      (tx) => tx.type === 'EXPENSE' && !tx.exclude_from_stats
    );
  }, [transactions]);

  const monthlyTotalExpense = useMemo(() => {
    return monthlyExpenseTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
  }, [monthlyExpenseTransactions]);

  const monthlyTotalIncome = useMemo(() => {
    return transactions
      .filter((tx) => tx.type === 'INCOME' && !tx.exclude_from_stats)
      .reduce((sum, tx) => sum + Number(tx.amount), 0);
  }, [transactions]);

  // (1) 월간 대분류별 비중
  const categoryMajorData = useMemo(() => {
    const map: { [major: string]: number } = {};
    monthlyExpenseTransactions.forEach((tx) => {
      const major = tx.category ? tx.category.major_name : '기타/미분류';
      map[major] = (map[major] || 0) + Number(tx.amount);
    });

    return Object.entries(map)
      .map(([name, value]) => ({
        name,
        value,
        percentage: monthlyTotalExpense > 0 ? ((value / monthlyTotalExpense) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.value - a.value);
  }, [monthlyExpenseTransactions, monthlyTotalExpense]);

  // (1-B) [신규 요청] 대분류별 예산 vs 실제 지출 비교 데이터 및 총계
  const { budgetVsExpenseData, totalBudgetVsExpense } = useMemo(() => {
    const majors = new Set<string>();
    Object.keys(monthlyBudgets).forEach((m) => majors.add(m));
    categoryMajorData.forEach((item) => majors.add(item.name));

    let sumBudget = 0;
    let sumExpense = 0;

    const list = Array.from(majors)
      .map((major) => {
        const budget = monthlyBudgets[major] || 0;
        const expenseItem = categoryMajorData.find((item) => item.name === major);
        const expense = expenseItem ? expenseItem.value : 0;
        sumBudget += budget;
        sumExpense += expense;
        return {
          major,
          budget,
          expense,
          diff: budget - expense,
        };
      })
      .sort((a, b) => b.budget - a.budget || b.expense - a.expense);

    return {
      budgetVsExpenseData: list,
      totalBudgetVsExpense: {
        totalBudget: sumBudget,
        totalExpense: sumExpense,
        totalRemaining: sumBudget - sumExpense,
      },
    };
  }, [monthlyBudgets, categoryMajorData]);

  // (2) [신규 요청 반영] 지출분석: 소분류 상위 10개 랭킹 (0점 좌측 정렬 & 10개 제한)
  const subCategoryRankingData = useMemo(() => {
    const map: { [sub: string]: { major: string; subName: string; amount: number } } = {};
    monthlyExpenseTransactions.forEach((tx) => {
      const subName = tx.category ? tx.category.sub_name : '기타';
      const majorName = tx.category ? tx.category.major_name : '기타';
      const key = `${majorName} > ${subName}`;

      if (!map[key]) {
        map[key] = { major: majorName, subName, amount: 0 };
      }
      map[key].amount += Number(tx.amount);
    });

    return Object.entries(map)
      .map(([name, data]) => ({
        fullName: name,
        shortName: data.subName, // 차트 Y축에는 짧은 소분류명 표시하여 0축을 좌측으로 바짝 이동
        amount: data.amount,
        percentage: monthlyTotalExpense > 0 ? ((data.amount / monthlyTotalExpense) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10); // 상위 10개로 제한
  }, [monthlyExpenseTransactions, monthlyTotalExpense]);

  // (3) 카드별 지출 금액 통계 데이터 (카드로 결제된 내역만 필터링)
  const cardExpenseData = useMemo(() => {
    const map: { [cardName: string]: number } = {};
    let totalCardSpent = 0;

    monthlyExpenseTransactions.forEach((tx) => {
      const pm = tx.payment_method || paymentMethods.find((p) => p.id === tx.payment_method_id);
      if (pm && pm.type === 'CARD') {
        map[pm.name] = (map[pm.name] || 0) + Number(tx.amount);
        totalCardSpent += Number(tx.amount);
      }
    });

    return {
      totalCardSpent,
      items: Object.entries(map)
        .map(([name, amount]) => ({
          name,
          amount,
          percentage: totalCardSpent > 0 ? ((amount / totalCardSpent) * 100).toFixed(1) : '0',
        }))
        .sort((a, b) => b.amount - a.amount),
    };
  }, [monthlyExpenseTransactions, paymentMethods]);

  // =========================================================================
  // 2. 연간 종합 분석 데이터 계산 (1월~12월 수입/지출)
  // =========================================================================
  const yearlyMonthlyComparisonData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: `${i + 1}월`,
      income: 0,
      expense: 0,
    }));

    yearlyTransactions.forEach((tx) => {
      if (tx.exclude_from_stats) return;

      const date = new Date(tx.transaction_date);
      const mIdx = date.getMonth(); // 0~11

      if (mIdx >= 0 && mIdx < 12) {
        if (tx.type === 'INCOME') {
          months[mIdx].income += Number(tx.amount);
        } else if (tx.type === 'EXPENSE') {
          months[mIdx].expense += Number(tx.amount);
        }
      }
    });

    return months;
  }, [yearlyTransactions]);

  // 연간 누적 총수입, 총지출, 순저축액
  const yearlyTotalIncome = useMemo(() => {
    return yearlyMonthlyComparisonData.reduce((sum, m) => sum + m.income, 0);
  }, [yearlyMonthlyComparisonData]);

  const yearlyTotalExpense = useMemo(() => {
    return yearlyMonthlyComparisonData.reduce((sum, m) => sum + m.expense, 0);
  }, [yearlyMonthlyComparisonData]);

  const yearlyNetSavings = yearlyTotalIncome - yearlyTotalExpense;

  return (
    <div className="space-y-6">
      {/* 1. 상단 뷰 전환 탭: '월간 분석' vs '연간 종합 분석' 및 날짜 이동기 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        {/* 모드 전환 탭 */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setViewMode('MONTHLY')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs sm:text-sm transition-colors ${
              viewMode === 'MONTHLY'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PieIcon className="w-4 h-4" />
            월간 분석
          </button>
          <button
            onClick={() => setViewMode('YEARLY')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs sm:text-sm transition-colors ${
              viewMode === 'YEARLY'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            연간 종합 분석
          </button>
        </div>

        {/* 날짜 선택 및 이전/다음 이동기 */}
        {viewMode === 'MONTHLY' ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition"
              title="이전 달"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-bold text-slate-800 text-base sm:text-lg min-w-[130px] text-center">
              {currentMonth.split('-')[0]}년 {currentMonth.split('-')[1]}월 통계
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
              onClick={() => setSelectedYear((y) => y - 1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition"
              title="이전 해"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-bold text-indigo-900 text-base sm:text-lg min-w-[120px] text-center">
              {selectedYear}년 연간 통계
            </span>
            <button
              onClick={() => setSelectedYear((y) => y + 1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition"
              title="다음 해"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 2. [월간 분석 모드] 화면                                                */}
      {/* ===================================================================== */}
      {viewMode === 'MONTHLY' && (
        <div className="space-y-6">
          {/* 월간 요약 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between text-emerald-600 text-xs font-semibold mb-1">
                <span>당월 총 수입</span>
                <TrendingUp className="w-4 h-4" />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-800">
                +{monthlyTotalIncome.toLocaleString()}원
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between text-red-600 text-xs font-semibold mb-1">
                <span>당월 총 소비 지출</span>
                <TrendingDown className="w-4 h-4" />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-800">
                -{monthlyTotalExpense.toLocaleString()}원
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between text-blue-600 text-xs font-semibold mb-1">
                <span>당월 순 저축/잔여</span>
                <Coins className="w-4 h-4" />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-800">
                {(monthlyTotalIncome - monthlyTotalExpense).toLocaleString()}원
              </div>
            </div>
          </div>

          {monthlyExpenseTransactions.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
              <PieIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700">
                {currentMonth.split('-')[0]}년 {currentMonth.split('-')[1]}월에는 지출 데이터가 없습니다
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                지출 내역을 기록하시면 카테고리 비중, 소분류 순위, 카드별 통계가 실시간으로 나타납니다.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 상단 2열 그리드: [지출 현황] vs [지출분석] */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1) [지출 현황] 파이형 vs 예산 비교 그래프형 */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                        <PieIcon className="w-5 h-5 text-blue-600" />
                        지출 현황
                      </h3>

                      {/* 파이형 / 그래프형 선택 탭 토글 */}
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          onClick={() => setExpenseViewType('PIE')}
                          className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors flex items-center gap-1 ${
                            expenseViewType === 'PIE'
                              ? 'bg-white text-blue-600 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <PieIcon className="w-3.5 h-3.5" />
                          <span>파이형</span>
                        </button>
                        <button
                          onClick={() => setExpenseViewType('BAR')}
                          className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors flex items-center gap-1 ${
                            expenseViewType === 'BAR'
                              ? 'bg-white text-blue-600 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          <span>그래프형</span>
                        </button>
                      </div>
                    </div>

                    {/* [옵션 A] 파이형 도넛 차트 */}
                    {expenseViewType === 'PIE' && (
                      <>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={categoryMajorData}
                                cx="50%"
                                cy="50%"
                                innerRadius={65}
                                outerRadius={95}
                                paddingAngle={3}
                                dataKey="value"
                              >
                                {categoryMajorData.map((_, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={COLORS[index % COLORS.length]}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(val: unknown) => `${Number(val).toLocaleString()}원`}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>

                        {/* 대분류 상세 비중 목록 */}
                        <div className="mt-4 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {categoryMajorData.map((item, idx) => (
                            <div
                              key={item.name}
                              className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-none"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                                />
                                <span className="font-medium text-slate-700">{item.name}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-slate-400 font-mono">{item.percentage}%</span>
                                <span className="font-bold text-slate-800">
                                  {item.value.toLocaleString()}원
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* [옵션 B: 사용자 요청 완벽 반영] 예산과 실제 지출을 비교하는 그래프 & 테이블 뷰 */}
                    {expenseViewType === 'BAR' && (
                      <>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={budgetVsExpenseData}
                              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                              <XAxis dataKey="major" tick={{ fontSize: 10, fill: '#334155' }} />
                              <YAxis
                                tick={{ fontSize: 10, fill: '#64748B' }}
                                tickFormatter={(val) => `${(val / 10000).toFixed(0)}만`}
                              />
                              <Tooltip
                                formatter={(val: unknown) => `${Number(val).toLocaleString()}원`}
                              />
                              <Legend
                                verticalAlign="top"
                                align="right"
                                wrapperStyle={{ paddingBottom: '6px', fontSize: '11px' }}
                              />
                              <Bar dataKey="budget" name="예산" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="expense" name="실제 지출" fill="#EF4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* [요청 반영] 한 줄 슬래시(/) 제거 -> 깔끔하고 정돈된 테이블(표) 구조로 변경 */}
                        <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                          <div className="max-h-52 overflow-y-auto">
                            <table className="w-full text-xs text-right border-collapse">
                              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-2xs">
                                <tr>
                                  <th className="px-3 py-2 text-left whitespace-nowrap bg-slate-50">대분류</th>
                                  <th className="px-3 py-2 text-blue-600 whitespace-nowrap bg-slate-50">예산</th>
                                  <th className="px-3 py-2 text-red-600 whitespace-nowrap bg-slate-50">실제 지출</th>
                                  <th className="px-3 py-2 whitespace-nowrap bg-slate-50">남은 돈</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-mono">
                                {budgetVsExpenseData.map((item) => {
                                  const remaining = item.budget - item.expense;
                                  return (
                                    <tr key={item.major} className="hover:bg-slate-50/70 transition-colors">
                                      <td className="px-3 py-2 text-left font-sans font-semibold text-slate-800 whitespace-nowrap">
                                        {item.major}
                                      </td>
                                      <td className="px-3 py-2 text-blue-600 font-medium whitespace-nowrap">
                                        {item.budget.toLocaleString()}원
                                      </td>
                                      <td className="px-3 py-2 text-red-600 font-medium whitespace-nowrap">
                                        {item.expense.toLocaleString()}원
                                      </td>
                                      <td
                                        className={`px-3 py-2 font-bold whitespace-nowrap ${
                                          remaining < 0
                                            ? 'text-rose-600'
                                            : remaining > 0
                                            ? 'text-emerald-700'
                                            : 'text-slate-400'
                                        }`}
                                      >
                                        {remaining > 0 ? `+${remaining.toLocaleString()}원` : `${remaining.toLocaleString()}원`}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot className="bg-slate-100 font-bold border-t border-slate-200 sticky bottom-0 z-10 shadow-xs">
                                <tr>
                                  <td className="px-3 py-2 text-left font-sans text-slate-900 whitespace-nowrap bg-slate-100">
                                    합계
                                  </td>
                                  <td className="px-3 py-2 text-blue-700 whitespace-nowrap bg-slate-100">
                                    {totalBudgetVsExpense.totalBudget.toLocaleString()}원
                                  </td>
                                  <td className="px-3 py-2 text-red-700 whitespace-nowrap bg-slate-100">
                                    {totalBudgetVsExpense.totalExpense.toLocaleString()}원
                                  </td>
                                  <td
                                    className={`px-3 py-2 whitespace-nowrap bg-slate-100 ${
                                      totalBudgetVsExpense.totalRemaining < 0 ? 'text-rose-600' : 'text-emerald-700'
                                    }`}
                                  >
                                    {totalBudgetVsExpense.totalRemaining > 0
                                      ? `+${totalBudgetVsExpense.totalRemaining.toLocaleString()}원`
                                      : `${totalBudgetVsExpense.totalRemaining.toLocaleString()}원`}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 2) 지출분석 (0점 좌측 정렬 & 10개 제한) */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                        <Award className="w-5 h-5 text-amber-500" />
                        지출분석
                      </h3>
                      <span className="text-xs text-slate-400">상위 10개 항목</span>
                    </div>

                    {/* 모바일에서 0선이 좌측으로 정돈된 막대 그래프 */}
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={subCategoryRankingData}
                          layout="vertical"
                          margin={{ top: 5, right: 15, left: -10, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                          <XAxis
                            type="number"
                            domain={[0, 'auto']}
                            tick={{ fontSize: 10, fill: '#64748B' }}
                            tickFormatter={(val) => `${(val / 10000).toFixed(0)}만`}
                          />
                          <YAxis
                            type="category"
                            dataKey="shortName"
                            tick={{ fontSize: 10, fill: '#334155' }}
                            width={65}
                            tickLine={false}
                          />
                          <Tooltip
                            formatter={(val: unknown, _name, item: any) => [
                              `${Number(val).toLocaleString()}원`,
                              item.payload.fullName,
                            ]}
                          />
                          <Bar dataKey="amount" fill="#3B82F6" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* 소분류 상세 랭킹 리스트 (최대 10개) */}
                  <div className="mt-4 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {subCategoryRankingData.map((item, idx) => (
                      <div
                        key={item.fullName}
                        className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-none"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-slate-700 truncate">{item.fullName}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-slate-400 font-mono">{item.percentage}%</span>
                          <span className="font-bold text-slate-800">
                            {item.amount.toLocaleString()}원
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3) 카드별 지출 금액 통계 화면 */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                  <div>
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                      <CreditCard className="w-5 h-5 text-purple-600" />
                      카드별 지출 금액 실적
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      이번 달 신용/체크카드로 결제된 내역만 모아 카드별 소비액을 분석합니다.
                    </p>
                  </div>
                  <div className="bg-purple-50 text-purple-700 font-bold px-3 py-1.5 rounded-xl text-xs self-start sm:self-auto">
                    카드 총 지출: {cardExpenseData.totalCardSpent.toLocaleString()}원
                  </div>
                </div>

                {cardExpenseData.items.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl">
                    이번 달에 카드로 결제된 지출 내역이 없습니다.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {cardExpenseData.items.map((card, idx) => (
                      <div
                        key={card.name}
                        className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 font-bold text-slate-800">
                            <CreditCard className="w-4 h-4 text-purple-600" />
                            <span>{card.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 font-mono">{card.percentage}%</span>
                            <span className="font-extrabold text-purple-700 text-sm">
                              {card.amount.toLocaleString()}원
                            </span>
                          </div>
                        </div>

                        {/* 프로그레스 바 */}
                        <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-600 rounded-full transition-all duration-500"
                            style={{
                              width: `${card.percentage}%`,
                              backgroundColor: COLORS[idx % COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. [연간 종합 분석 모드] 화면                                          */}
      {/* ===================================================================== */}
      {viewMode === 'YEARLY' && (
        <div className="space-y-6">
          {/* 연간 3단 요약 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-emerald-600 text-xs font-semibold mb-1">
                <span>{selectedYear}년 연간 총 수입</span>
                <TrendingUp className="w-4 h-4" />
              </div>
              <div className="text-2xl font-extrabold text-slate-800">
                +{yearlyTotalIncome.toLocaleString()}원
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                월평균 약 {Math.round(yearlyTotalIncome / 12).toLocaleString()}원
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-red-600 text-xs font-semibold mb-1">
                <span>{selectedYear}년 연간 총 소비 지출</span>
                <TrendingDown className="w-4 h-4" />
              </div>
              <div className="text-2xl font-extrabold text-slate-800">
                -{yearlyTotalExpense.toLocaleString()}원
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                월평균 약 {Math.round(yearlyTotalExpense / 12).toLocaleString()}원
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-indigo-600 text-xs font-semibold mb-1">
                <span>{selectedYear}년 연간 순 저축액</span>
                <Coins className="w-4 h-4" />
              </div>
              <div
                className={`text-2xl font-extrabold ${
                  yearlyNetSavings >= 0 ? 'text-indigo-700' : 'text-red-600'
                }`}
              >
                {yearlyNetSavings >= 0 ? '+' : ''}
                {yearlyNetSavings.toLocaleString()}원
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                저축률: {yearlyTotalIncome > 0 ? ((yearlyNetSavings / yearlyTotalIncome) * 100).toFixed(1) : 0}%
              </span>
            </div>
          </div>

          {/* 1월~12월 월별 수입 vs 지출 비교 막대 그래프 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                  <BarChart3 className="w-5 h-5 text-indigo-600" />
                  {selectedYear}년 월별 수입 및 지출 추이 비교
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  매달의 수입(초록)과 소비 지출(빨강)의 변화를 1월부터 12월까지 나란히 비교합니다.
                </p>
              </div>

              {loadingYearly && (
                <span className="text-xs text-indigo-600 font-semibold animate-pulse">
                  1년치 데이터 분석 중...
                </span>
              )}
            </div>

            <div className="h-80 sm:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={yearlyMonthlyComparisonData}
                  margin={{ top: 20, right: 20, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#334155' }} />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#64748B' }}
                    tickFormatter={(val) => `${(val / 10000).toFixed(0)}만`}
                  />
                  <Tooltip
                    formatter={(val: unknown) => `${Number(val).toLocaleString()}원`}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: '10px', fontSize: '12px' }}
                  />
                  <Bar dataKey="income" name="수입" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="지출" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 1월~12월 상세 요약 테이블 (엑셀 피벗 스타일) */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <h4 className="font-bold text-slate-800 text-sm mb-4">
              {selectedYear}년 월별 데이터 요약표 (엑셀 시트 뷰)
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">월</th>
                    <th className="px-4 py-2.5 text-right">수입 합계</th>
                    <th className="px-4 py-2.5 text-right">지출 합계</th>
                    <th className="px-4 py-2.5 text-right">순 저축/잔여</th>
                    <th className="px-4 py-2.5 text-right">저축률</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {yearlyMonthlyComparisonData.map((row) => {
                    const net = row.income - row.expense;
                    const rate = row.income > 0 ? ((net / row.income) * 100).toFixed(1) : '0.0';

                    return (
                      <tr key={row.month} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2 font-bold text-slate-700">{row.month}</td>
                        <td className="px-4 py-2 text-right text-emerald-600 font-medium">
                          {row.income > 0 ? `+${row.income.toLocaleString()}원` : '-'}
                        </td>
                        <td className="px-4 py-2 text-right text-red-600 font-medium">
                          {row.expense > 0 ? `-${row.expense.toLocaleString()}원` : '-'}
                        </td>
                        <td
                          className={`px-4 py-2 text-right font-bold ${
                            net > 0 ? 'text-blue-700' : net < 0 ? 'text-red-600' : 'text-slate-400'
                          }`}
                        >
                          {net !== 0 ? `${net > 0 ? '+' : ''}${net.toLocaleString()}원` : '-'}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-500">
                          {row.income > 0 ? `${rate}%` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
