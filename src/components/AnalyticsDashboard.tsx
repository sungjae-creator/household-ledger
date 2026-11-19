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
  Layers,
  Store,
  Table as TableIcon,
  CalendarDays,
  Wallet,
  Banknote,
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
 * [모바일/화면 최적화] 초경량 미니멀 단일 툴팁
 * - 거대한 흰색 박스 대신 아담한 11px 크기로 화면 가림을 원천 방지
 */
function SingleCompactTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const data = payload[0];
    const name = data.payload?.fullName || data.payload?.name || label || data.name;
    const value = Number(data.value);
    return (
      <div className="bg-slate-900/90 text-white text-[11px] px-2.5 py-1 rounded-lg shadow-md pointer-events-none backdrop-blur-xs flex items-center gap-1.5 whitespace-nowrap border border-slate-700/50">
        <span className="text-slate-300 font-medium">{name}:</span>
        <span className="font-bold text-white">{value.toLocaleString()}원</span>
      </div>
    );
  }
  return null;
}

/**
 * [모바일/화면 최적화] 연간 수입/지출 비교 2중 툴팁
 */
function DualCompactTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/90 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-md pointer-events-none backdrop-blur-xs whitespace-nowrap border border-slate-700/50 space-y-0.5">
        <div className="font-bold text-slate-300 text-[10px] border-b border-slate-700/60 pb-0.5 mb-1">{label}</div>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-2.5">
            <span style={{ color: entry.color }} className="font-medium text-[10px]">{entry.name}:</span>
            <span className="font-bold">{Number(entry.value).toLocaleString()}원</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

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

  // 지출 현황 뷰 형태: 'PIE' (파이형) | 'BAR' (대분류 지출 막대 그래프형)
  const [expenseViewType, setExpenseViewType] = useState<'PIE' | 'BAR'>('PIE');

  // 지출 분석 탭: 'CATEGORY' (분류별 지출) | 'MERCHANT' (주요 사용처)
  const [analysisTab, setAnalysisTab] = useState<'CATEGORY' | 'MERCHANT'>('CATEGORY');

  // 분류별 지출에서 선택된 대분류 이름 (기본값: 지출 1위 대분류)
  const [selectedMajorCategory, setSelectedMajorCategory] = useState<string>('');

  // [신규 요청] 결제 수단별 지출 탭: 'CASH' (현금 및 결제 계좌) | 'CARD' (카드)
  const [paymentTab, setPaymentTab] = useState<'CASH' | 'CARD'>('CASH');

  // 연간 분석 기준 연도 (기본값: 현재 선택된 월의 연도)
  const initialYear = currentMonth ? parseInt(currentMonth.split('-')[0], 10) : new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);

  // 연간 1년치 전체 거래내역 상태
  const [yearlyTransactions, setYearlyTransactions] = useState<Transaction[]>([]);
  const [loadingYearly, setLoadingYearly] = useState<boolean>(false);

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
    month -= 1;
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
  // 당월 지출 내역 (통계 제외 플래그 제외)
  const monthlyExpenseTransactions = useMemo(() => {
    return transactions.filter(
      (tx) => tx.type === 'EXPENSE' && !tx.exclude_from_stats
    );
  }, [transactions]);

  // 당월 총 지출액
  const monthlyTotalExpense = useMemo(() => {
    return monthlyExpenseTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
  }, [monthlyExpenseTransactions]);

  // 당월 총 수입액
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

  // 대분류가 변경되거나 로드되었을 때, 선택된 대분류 기본값을 지출 1위 대분류로 자동 동기화
  useEffect(() => {
    if (categoryMajorData.length > 0) {
      const exists = categoryMajorData.some((item) => item.name === selectedMajorCategory);
      if (!selectedMajorCategory || !exists) {
        setSelectedMajorCategory(categoryMajorData[0].name);
      }
    } else {
      setSelectedMajorCategory('');
    }
  }, [categoryMajorData, selectedMajorCategory]);

  // (2-A) 선택된 대분류 내의 "소분류별 지출 내역"
  const subCategoryOfSelectedMajor = useMemo(() => {
    if (!selectedMajorCategory) return [];

    const targetTransactions = monthlyExpenseTransactions.filter(
      (tx) => (tx.category ? tx.category.major_name : '기타/미분류') === selectedMajorCategory
    );

    const majorTotalSpent = targetTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
    const map: { [sub: string]: number } = {};

    targetTransactions.forEach((tx) => {
      const sub = tx.category ? tx.category.sub_name : '기타';
      map[sub] = (map[sub] || 0) + Number(tx.amount);
    });

    return Object.entries(map)
      .map(([name, value]) => ({
        name,
        value,
        percentage: majorTotalSpent > 0 ? ((value / majorTotalSpent) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.value - a.value);
  }, [monthlyExpenseTransactions, selectedMajorCategory]);

  // (2-B) 주요 사용처(description) 상위 10개 랭킹
  const topMerchantRankingData = useMemo(() => {
    const map: { [merchant: string]: number } = {};

    monthlyExpenseTransactions.forEach((tx) => {
      const merchant = tx.description ? tx.description.trim() : '미기재';
      map[merchant] = (map[merchant] || 0) + Number(tx.amount);
    });

    return Object.entries(map)
      .map(([name, amount]) => ({
        fullName: name,
        shortName: name.length > 7 ? `${name.slice(0, 6)}…` : name,
        amount,
        percentage: monthlyTotalExpense > 0 ? ((amount / monthlyTotalExpense) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [monthlyExpenseTransactions, monthlyTotalExpense]);

  // =========================================================================
  // (3) [신규 개편] 결제 수단별 지출 (현금/계좌 탭 vs 카드 탭)
  // =========================================================================
  const paymentMethodExpenseData = useMemo(() => {
    // 1) 카드 지출 맵 (CARD)
    const cardMap: { [cardName: string]: number } = {};
    let totalCard = 0;

    // 2) 현금 및 결제 계좌 지출 맵 (CASH, BANK)
    const cashMap: { [cashName: string]: { amount: number; type: string } } = {};
    let totalCash = 0;

    monthlyExpenseTransactions.forEach((tx) => {
      const pm = tx.payment_method || paymentMethods.find((p) => p.id === tx.payment_method_id);
      const amount = Number(tx.amount);

      if (pm) {
        if (pm.type === 'CARD') {
          cardMap[pm.name] = (cardMap[pm.name] || 0) + amount;
          totalCard += amount;
        } else if (pm.type === 'CASH' || pm.type === 'BANK') {
          if (!cashMap[pm.name]) {
            cashMap[pm.name] = { amount: 0, type: pm.type };
          }
          cashMap[pm.name].amount += amount;
          totalCash += amount;
        }
      } else {
        // 결제수단 미지정 건은 현금 범주에 포함
        const fallbackName = '기타/미지정 현금';
        if (!cashMap[fallbackName]) {
          cashMap[fallbackName] = { amount: 0, type: 'CASH' };
        }
        cashMap[fallbackName].amount += amount;
        totalCash += amount;
      }
    });

    const cardItems = Object.entries(cardMap)
      .map(([name, amount]) => ({
        name,
        type: 'CARD',
        amount,
        percentage: totalCard > 0 ? ((amount / totalCard) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.amount - a.amount);

    const cashItems = Object.entries(cashMap)
      .map(([name, data]) => ({
        name,
        type: data.type, // 'CASH' 또는 'BANK'
        amount: data.amount,
        percentage: totalCash > 0 ? ((data.amount / totalCash) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      card: {
        total: totalCard,
        items: cardItems,
      },
      cash: {
        total: totalCash,
        items: cashItems,
      },
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
                지출 내역을 기록하시면 카테고리 비중, 분류별 지출, 사용처 순위, 결제 수단별 통계가 실시간으로 나타납니다.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 상단 2열 그리드: [지출 현황] vs [지출 분석 (분류별 지출 / 주요 사용처)] */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1) [지출 현황] 파이형 vs 지출 막대 그래프형 */}
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
                    {expenseViewType === 'PIE' ? (
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
                            <Tooltip content={<SingleCompactTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      /* [옵션 B] 순수 대분류별 지출 막대 그래프 (지출 현황 그래프형) */
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={categoryMajorData}
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#334155' }} />
                            <YAxis
                              tick={{ fontSize: 10, fill: '#64748B' }}
                              tickFormatter={(val) => `${(val / 10000).toFixed(0)}만`}
                            />
                            <Tooltip content={<SingleCompactTooltip />} />
                            <Bar dataKey="value" name="지출액" radius={[4, 4, 0, 0]}>
                              {categoryMajorData.map((_, index) => (
                                <Cell
                                  key={`cell-bar-${index}`}
                                  fill={COLORS[index % COLORS.length]}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* 대분류 상세 지출 내역 목록 */}
                    <div className="mt-4 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {categoryMajorData.map((item, idx) => (
                        <div
                          key={item.name}
                          className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-none"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                            />
                            <span className="font-semibold text-slate-700">{item.name}</span>
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
                  </div>
                </div>

                {/* 2) 지출 분석 (분류별 지출 vs 주요 사용처 2개 탭) */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div>
                    {/* 상단 타이틀 및 탭 전환 버튼 */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                        <Award className="w-5 h-5 text-amber-500" />
                        지출 분석
                      </h3>

                      {/* 탭 1: 분류별 지출 | 탭 2: 주요 사용처 */}
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 self-start sm:self-auto">
                        <button
                          onClick={() => setAnalysisTab('CATEGORY')}
                          className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors flex items-center gap-1 ${
                            analysisTab === 'CATEGORY'
                              ? 'bg-white text-blue-600 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>분류별 지출</span>
                        </button>
                        <button
                          onClick={() => setAnalysisTab('MERCHANT')}
                          className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors flex items-center gap-1 ${
                            analysisTab === 'MERCHANT'
                              ? 'bg-white text-blue-600 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <Store className="w-3.5 h-3.5" />
                          <span>주요 사용처</span>
                        </button>
                      </div>
                    </div>

                    {/* [탭 1: 분류별 지출] 대분류 드롭다운 + 소분류 지출 막대 그래프 */}
                    {analysisTab === 'CATEGORY' && (
                      <div>
                        <div className="flex items-center justify-between mb-3 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/70">
                          <span className="text-xs font-semibold text-slate-600">대분류 선택:</span>
                          <select
                            value={selectedMajorCategory}
                            onChange={(e) => setSelectedMajorCategory(e.target.value)}
                            className="text-xs font-bold bg-white text-slate-800 border border-slate-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                          >
                            {categoryMajorData.map((major) => (
                              <option key={major.name} value={major.name}>
                                {major.name} ({Number(major.value).toLocaleString()}원)
                              </option>
                            ))}
                          </select>
                        </div>

                        {subCategoryOfSelectedMajor.length === 0 ? (
                          <div className="h-64 flex items-center justify-center text-xs text-slate-400">
                            선택된 대분류에 등록된 소분류 지출 내역이 없습니다.
                          </div>
                        ) : (
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={subCategoryOfSelectedMajor}
                                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#334155' }} />
                                <YAxis
                                  tick={{ fontSize: 10, fill: '#64748B' }}
                                  tickFormatter={(val) => `${(val / 10000).toFixed(0)}만`}
                                />
                                <Tooltip content={<SingleCompactTooltip />} />
                                <Bar dataKey="value" name="지출액" radius={[4, 4, 0, 0]}>
                                  {subCategoryOfSelectedMajor.map((_, index) => (
                                    <Cell
                                      key={`cell-sub-${index}`}
                                      fill={COLORS[index % COLORS.length]}
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        <div className="mt-4 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {subCategoryOfSelectedMajor.map((item, idx) => (
                            <div
                              key={item.name}
                              className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-none"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                                />
                                <span className="font-semibold text-slate-700">{item.name}</span>
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
                      </div>
                    )}

                    {/* [탭 2: 주요 사용처] 상위 10개 사용처 세로 랭킹 바 차트 */}
                    {analysisTab === 'MERCHANT' && (
                      <div>
                        <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
                          <span>당월 지출액 기준 상위 사용처</span>
                          <span>TOP 10</span>
                        </div>

                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={topMerchantRankingData}
                              layout="vertical"
                              margin={{ top: 5, right: 15, left: -5, bottom: 5 }}
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
                                interval={0}
                                tick={{ fontSize: 10, fill: '#334155' }}
                                width={72}
                                tickLine={false}
                              />
                              <Tooltip content={<SingleCompactTooltip />} />
                              <Bar dataKey="amount" fill="#3B82F6" radius={[0, 6, 6, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="mt-4 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {topMerchantRankingData.map((item, idx) => (
                            <div
                              key={item.fullName}
                              className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-none"
                            >
                              <div className="flex items-center gap-2 min-w-0">
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
                    )}
                  </div>
                </div>
              </div>

              {/* ============================================================= */}
              {/* 3) [신규 개편] 결제 수단별 지출 (현금 탭 vs 카드 탭)           */}
              {/* ============================================================= */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                  <div>
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                      <Wallet className="w-5 h-5 text-indigo-600" />
                      결제 수단별 지출
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      현금(출금통장 포함)과 신용/체크카드별 소비액을 나누어 정밀하게 분석합니다.
                    </p>
                  </div>

                  {/* 현금 / 카드 탭 토글 & 총액 뱃지 */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* 탭 버튼: 현금 vs 카드 */}
                    <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                      <button
                        onClick={() => setPaymentTab('CASH')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors flex items-center gap-1.5 ${
                          paymentTab === 'CASH'
                            ? 'bg-white text-emerald-600 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Banknote className="w-3.5 h-3.5" />
                        <span>현금</span>
                      </button>
                      <button
                        onClick={() => setPaymentTab('CARD')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors flex items-center gap-1.5 ${
                          paymentTab === 'CARD'
                            ? 'bg-white text-purple-600 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>카드</span>
                      </button>
                    </div>

                    {/* 해당 탭 총 지출 뱃지 */}
                    <div
                      className={`font-bold px-3 py-1.5 rounded-xl text-xs ${
                        paymentTab === 'CASH'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-purple-50 text-purple-700'
                      }`}
                    >
                      {paymentTab === 'CASH' ? '현금 총 지출' : '카드 총 지출'}:{' '}
                      {(paymentTab === 'CASH'
                        ? paymentMethodExpenseData.cash.total
                        : paymentMethodExpenseData.card.total
                      ).toLocaleString()}원
                    </div>
                  </div>
                </div>

                {/* [탭 1: 현금 및 결제 계좌 지출 목록] */}
                {paymentTab === 'CASH' && (
                  <div>
                    {paymentMethodExpenseData.cash.items.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl">
                        이번 달에 현금 또는 결제 계좌(출금통장)로 지출된 내역이 없습니다.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {paymentMethodExpenseData.cash.items.map((item, idx) => (
                          <div
                            key={item.name}
                            className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-2"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 font-bold text-slate-800">
                                {item.type === 'BANK' ? (
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                ) : (
                                  <Banknote className="w-4 h-4 text-emerald-600 shrink-0" />
                                )}
                                <span>{item.name}</span>
                                <span className="text-[10px] bg-slate-200/60 text-slate-500 px-1.5 py-0.2 rounded font-normal">
                                  {item.type === 'BANK' ? '결제계좌' : '현금'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400 font-mono">{item.percentage}%</span>
                                <span className="font-extrabold text-emerald-700 text-sm">
                                  {item.amount.toLocaleString()}원
                                </span>
                              </div>
                            </div>

                            {/* 프로그레스 바 */}
                            <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${item.percentage}%`,
                                  backgroundColor: COLORS[idx % COLORS.length],
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* [탭 2: 카드별 지출 목록] */}
                {paymentTab === 'CARD' && (
                  <div>
                    {paymentMethodExpenseData.card.items.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl">
                        이번 달에 신용/체크카드로 결제된 지출 내역이 없습니다.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {paymentMethodExpenseData.card.items.map((card, idx) => (
                          <div
                            key={card.name}
                            className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-2"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 font-bold text-slate-800">
                                <CreditCard className="w-4 h-4 text-purple-600 shrink-0" />
                                <span>{card.name}</span>
                                <span className="text-[10px] bg-purple-100/60 text-purple-600 px-1.5 py-0.2 rounded font-normal">
                                  카드
                                </span>
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
                                className="h-full rounded-full transition-all duration-500"
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
          {/* 3-1. 연간 3단 요약 카드 (PC/모바일 공통 표시) */}
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

          {/* =================================================================== */}
          {/* [모바일 전용 뷰: block sm:hidden]                                   */}
          {/* 모바일에서는 월별 주요 요약 카드만 전면에 시원하게 표시                 */}
          {/* =================================================================== */}
          <div className="block sm:hidden space-y-3">
            <div className="flex items-center justify-between px-1">
              <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-indigo-600" />
                {selectedYear}년 월별 요약 카드
              </h4>
              <span className="text-[11px] text-slate-400">1월 ~ 12월 전체</span>
            </div>

            <div className="space-y-2.5">
              {yearlyMonthlyComparisonData.map((row) => {
                const net = row.income - row.expense;
                const rate = row.income > 0 ? ((net / row.income) * 100).toFixed(1) : '0.0';
                const hasData = row.income > 0 || row.expense > 0;

                return (
                  <div
                    key={`mobile-card-${row.month}`}
                    className={`p-4 rounded-2xl border transition-all ${
                      hasData
                        ? 'bg-white border-slate-200 shadow-2xs'
                        : 'bg-slate-50/70 border-slate-200/60'
                    }`}
                  >
                    {/* 상단: 월 뱃지 & 순잔여액 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-sm bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-lg border border-indigo-100">
                          {row.month}
                        </span>
                        {hasData && row.income > 0 && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                            저축률 {rate}%
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block -mb-0.5">순 저축/잔여</span>
                        <span
                          className={`font-black text-sm font-mono ${
                            net > 0 ? 'text-blue-600' : net < 0 ? 'text-red-500' : 'text-slate-400'
                          }`}
                        >
                          {hasData
                            ? `${net > 0 ? '+' : ''}${net.toLocaleString()}원`
                            : '-'}
                        </span>
                      </div>
                    </div>

                    {/* 하단: 수입 / 지출 2단 분할 */}
                    {hasData ? (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                        <div className="bg-emerald-50/50 p-2 rounded-xl">
                          <span className="text-emerald-700 text-[10px] font-medium block">수입 합계</span>
                          <span className="text-emerald-600 font-extrabold font-mono text-xs">
                            {row.income > 0 ? `+${row.income.toLocaleString()}원` : '0원'}
                          </span>
                        </div>
                        <div className="bg-red-50/50 p-2 rounded-xl text-right">
                          <span className="text-red-700 text-[10px] font-medium block">지출 합계</span>
                          <span className="text-red-600 font-extrabold font-mono text-xs">
                            {row.expense > 0 ? `-${row.expense.toLocaleString()}원` : '0원'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-1.5 border-t border-slate-100 text-center text-slate-400 text-xs py-1">
                        등록된 거래 내역이 없습니다.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* =================================================================== */}
          {/* [PC/태블릿 전용 뷰: hidden sm:block]                                */}
          {/* =================================================================== */}
          <div className="hidden sm:block space-y-6">
            {/* 1월~12월 월별 수입 vs 지출 비교 막대 그래프 (PC 전용) */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-6">
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
                    <Tooltip content={<DualCompactTooltip />} />
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

            {/* 1월~12월 상세 요약 테이블 (PC 전용 엑셀 피벗 시트 뷰) */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <h4 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-indigo-600" />
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
                        <tr key={row.month} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-2.5 font-bold text-slate-700">{row.month}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-600 font-semibold font-mono">
                            {row.income > 0 ? `+${row.income.toLocaleString()}원` : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-right text-red-600 font-semibold font-mono">
                            {row.expense > 0 ? `-${row.expense.toLocaleString()}원` : '-'}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right font-bold font-mono ${
                              net > 0 ? 'text-blue-700' : net < 0 ? 'text-red-600' : 'text-slate-400'
                            }`}
                          >
                            {net !== 0 ? `${net > 0 ? '+' : ''}${net.toLocaleString()}원` : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-500">
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
        </div>
      )}
    </div>
  );
}
