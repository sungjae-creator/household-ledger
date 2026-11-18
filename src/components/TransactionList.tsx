'use client';

import { useState } from 'react';
import { Transaction } from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Edit2,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
} from 'lucide-react';

interface TransactionListProps {
  transactions: Transaction[];
  currentMonth: string; // YYYY-MM
  setCurrentMonth: (month: string) => void;
  onOpenAddModal: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onRefresh: () => void;
}

/**
 * 가계부 거래내역 목록 컴포넌트
 * 타임존(UTC) 오차 없는 안전한 월 이동 로직 적용
 */
export default function TransactionList({
  transactions,
  currentMonth,
  setCurrentMonth,
  onOpenAddModal,
  onEditTransaction,
  onRefresh,
}: TransactionListProps) {
  const supabase = createClient();

  // 검색어 및 유형 필터
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'CARD_PAYMENT'>('ALL');

  /**
   * 이전 달로 이동 (타임존 오차 없는 수학적 연/월 계산)
   */
  const handlePrevMonth = () => {
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
   * 다음 달로 이동 (타임존 오차 없는 수학적 연/월 계산)
   */
  const handleNextMonth = () => {
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
   * 항목 삭제 핸들러 (계좌 잔액 원상복구 포함)
   */
  const handleDelete = async (tx: Transaction) => {
    if (!confirm(`'${tx.description}' 내역을 정말 삭제하시겠습니까?\n(연동된 계좌의 잔액도 원래대로 안전하게 되돌려집니다.)`)) {
      return;
    }

    try {
      const amount = Number(tx.amount);

      // 계좌 잔액 원상복구
      if (tx.type === 'EXPENSE' && tx.payment_method_id) {
        // 지출 삭제 -> 출금계좌에 금액 다시 환원 (+)
        const { data: acc } = await supabase
          .from('payment_methods')
          .select('balance')
          .eq('id', tx.payment_method_id)
          .single();
        if (acc) {
          await supabase
            .from('payment_methods')
            .update({ balance: Number(acc.balance) + amount })
            .eq('id', tx.payment_method_id);
        }
      } else if (tx.type === 'INCOME' && tx.payment_method_id) {
        // 수입 삭제 -> 입금계좌에서 금액 차감 (-)
        const { data: acc } = await supabase
          .from('payment_methods')
          .select('balance')
          .eq('id', tx.payment_method_id)
          .single();
        if (acc) {
          await supabase
            .from('payment_methods')
            .update({ balance: Number(acc.balance) - amount })
            .eq('id', tx.payment_method_id);
        }
      } else if (tx.type === 'CARD_PAYMENT' && tx.payment_method_id) {
        // 카드대금 납부 삭제 -> 출금 통장에 금액 다시 환원 (+)
        const { data: acc } = await supabase
          .from('payment_methods')
          .select('balance')
          .eq('id', tx.payment_method_id)
          .single();
        if (acc) {
          await supabase
            .from('payment_methods')
            .update({ balance: Number(acc.balance) + amount })
            .eq('id', tx.payment_method_id);
        }
      } else if (tx.type === 'TRANSFER') {
        // 이체 삭제 -> 보내는 계좌 환원(+), 받는 계좌 차감(-)
        if (tx.payment_method_id) {
          const { data: fromAcc } = await supabase
            .from('payment_methods')
            .select('balance')
            .eq('id', tx.payment_method_id)
            .single();
          if (fromAcc) {
            await supabase
              .from('payment_methods')
              .update({ balance: Number(fromAcc.balance) + amount })
              .eq('id', tx.payment_method_id);
          }
        }
        if (tx.to_payment_method_id) {
          const { data: toAcc } = await supabase
            .from('payment_methods')
            .select('balance')
            .eq('id', tx.to_payment_method_id)
            .single();
          if (toAcc) {
            await supabase
              .from('payment_methods')
              .update({ balance: Number(toAcc.balance) - amount })
              .eq('id', tx.to_payment_method_id);
          }
        }
      }

      // 거래내역 레코드 삭제
      const { error: delErr } = await supabase
        .from('transactions')
        .delete()
        .eq('id', tx.id);

      if (delErr) throw delErr;

      onRefresh();
    } catch (err: any) {
      alert(`삭제 중 오류 발생: ${err?.message || err}`);
    }
  };

  // 1. 검색 및 필터링 적용
  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch =
      tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.memo && tx.memo.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (tx.category &&
        (`${tx.category.major_name} ${tx.category.sub_name}`)
          .toLowerCase()
          .includes(searchTerm.toLowerCase()));

    const matchesType = typeFilter === 'ALL' || tx.type === typeFilter;
    return matchesSearch && matchesType;
  });

  // 2. 해당 월 통계 집계 (통계 제외 건 제외)
  const totalIncome = transactions
    .filter((tx) => tx.type === 'INCOME' && !tx.exclude_from_stats)
    .reduce((sum, tx) => sum + Number(tx.amount), 0);

  const totalExpense = transactions
    .filter((tx) => tx.type === 'EXPENSE' && !tx.exclude_from_stats)
    .reduce((sum, tx) => sum + Number(tx.amount), 0);

  const netSavings = totalIncome - totalExpense;

  // 3. 날짜별 그룹화
  const groupedByDate: { [date: string]: Transaction[] } = {};
  filteredTransactions.forEach((tx) => {
    if (!groupedByDate[tx.transaction_date]) {
      groupedByDate[tx.transaction_date] = [];
    }
    groupedByDate[tx.transaction_date].push(tx);
  });

  const sortedDates = Object.keys(groupedByDate).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  return (
    <div className="space-y-6">
      {/* 1. 상단 월 선택기 & 요약 카드 */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrevMonth}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition cursor-pointer"
              title="이전 달"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
              {currentMonth.split('-')[0]}년 {currentMonth.split('-')[1]}월
            </h2>
            <button
              onClick={handleNextMonth}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition cursor-pointer"
              title="다음 달"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={onOpenAddModal}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-200 transition cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>내역 추가</span>
          </button>
        </div>

        {/* 3단 요약 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-emerald-50/70 border border-emerald-100 rounded-xl">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-xs font-semibold">총 수입</span>
              <ArrowDownLeft className="w-4 h-4" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-700">
              +{totalIncome.toLocaleString()}원
            </div>
          </div>

          <div className="p-4 bg-red-50/70 border border-red-100 rounded-xl">
            <div className="flex items-center justify-between text-red-700 mb-1">
              <span className="text-xs font-semibold">총 소비 지출</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-red-700">
              -{totalExpense.toLocaleString()}원
            </div>
          </div>

          <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-xl">
            <div className="flex items-center justify-between text-blue-700 mb-1">
              <span className="text-xs font-semibold">순 저축/잔여</span>
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <div
              className={`text-xl sm:text-2xl font-bold ${
                netSavings >= 0 ? 'text-blue-700' : 'text-red-600'
              }`}
            >
              {netSavings >= 0 ? '+' : ''}
              {netSavings.toLocaleString()}원
            </div>
          </div>
        </div>
      </div>

      {/* 2. 검색 및 필터 바 */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="사용처, 카테고리, 메모 검색..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          />
        </div>

        {/* 수입/지출/이체/카드대금 필터 탭 */}
        <div className="flex items-center gap-1 bg-white p-1 border border-slate-200 rounded-xl shadow-xs w-full sm:w-auto overflow-x-auto">
          {(['ALL', 'EXPENSE', 'INCOME', 'TRANSFER', 'CARD_PAYMENT'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`whitespace-nowrap px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                typeFilter === type
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {type === 'ALL'
                ? '전체'
                : type === 'EXPENSE'
                ? '지출'
                : type === 'INCOME'
                ? '수입'
                : type === 'TRANSFER'
                ? '이체'
                : '카드대금'}
            </button>
          ))}
        </div>
      </div>

      {/* 3. 거래내역 목록 */}
      {sortedDates.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
          <Filter className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700">해당 내역이 없습니다</h3>
          <p className="text-xs text-slate-500 mt-1">
            새로운 지출, 수입, 이체 또는 카드대금 납부를 기록해 보세요.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((date) => {
            const dayItems = groupedByDate[date];
            const dayExpense = dayItems
              .filter((i) => i.type === 'EXPENSE')
              .reduce((s, i) => s + Number(i.amount), 0);
            const dayIncome = dayItems
              .filter((i) => i.type === 'INCOME')
              .reduce((s, i) => s + Number(i.amount), 0);

            return (
              <div
                key={date}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs"
              >
                {/* 날짜 헤더 */}
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50/70 border-b border-slate-100 text-xs">
                  <div className="font-bold text-slate-700">
                    {date} ({new Date(date).toLocaleDateString('ko-KR', { weekday: 'short' })})
                  </div>
                  <div className="flex items-center gap-3 font-semibold">
                    {dayIncome > 0 && (
                      <span className="text-emerald-600">+{dayIncome.toLocaleString()}원</span>
                    )}
                    {dayExpense > 0 && (
                      <span className="text-red-500">-{dayExpense.toLocaleString()}원</span>
                    )}
                  </div>
                </div>

                {/* 해당 일자의 거래 목록 */}
                <div className="divide-y divide-slate-100">
                  {dayItems.map((tx) => {
                    const isTransfer = tx.type === 'TRANSFER';
                    const isIncome = tx.type === 'INCOME';
                    const isCardPayment = tx.type === 'CARD_PAYMENT';

                    return (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/60 transition group"
                      >
                        <div className="flex items-center gap-3">
                          {/* 뱃지 아이콘 */}
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 text-white ${
                              isCardPayment
                                ? 'bg-indigo-600'
                                : isTransfer
                                ? 'bg-purple-600'
                                : isIncome
                                ? 'bg-emerald-600'
                                : ''
                            }`}
                            style={{
                              backgroundColor: !isTransfer && !isIncome && !isCardPayment ? (tx.category?.color || '#EF4444') : undefined,
                            }}
                          >
                            {isCardPayment
                              ? '카드'
                              : isTransfer
                              ? '이체'
                              : tx.category
                              ? tx.category.sub_name.slice(0, 2)
                              : isIncome
                              ? '수입'
                              : '지출'}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800 text-sm">
                                {tx.description}
                              </span>
                              {tx.exclude_from_stats && (
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                                  {isCardPayment ? '중복방지 통계제외' : '통계 제외'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-600 mt-0.5">
                              {/* 카드대금 납부일 때 */}
                              {isCardPayment ? (
                                <span className="text-indigo-600 font-medium flex items-center gap-1">
                                  <span>{tx.payment_method?.name || '출금통장'}</span>
                                  <ArrowRight className="w-3 h-3 inline" />
                                  <span>{tx.to_payment_method?.name || '납부카드'}</span>
                                </span>
                              ) : isTransfer ? (
                                /* 이체일 때 */
                                <span className="text-purple-600 font-medium flex items-center gap-1">
                                  <span>{tx.payment_method?.name || '출금계좌'}</span>
                                  <ArrowRight className="w-3 h-3 inline" />
                                  <span>{tx.to_payment_method?.name || '입금계좌'}</span>
                                </span>
                              ) : (
                                /* 일반 지출 / 수입 */
                                <>
                                  {tx.category && (
                                    <span>
                                      {tx.category.major_name} &gt; {tx.category.sub_name}
                                    </span>
                                  )}
                                  {tx.payment_method && (
                                    <>
                                      <span>•</span>
                                      <span className="text-slate-600">
                                        {tx.payment_method.name}
                                      </span>
                                    </>
                                  )}
                                </>
                              )}
                              {tx.memo && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-600 truncate max-w-[180px]">
                                    {tx.memo}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 금액 및 액션 버튼 */}
                        <div className="flex items-center gap-4">
                          <span
                            className={`font-bold text-base ${
                              isIncome
                                ? 'text-emerald-600'
                                : isCardPayment
                                ? 'text-indigo-600'
                                : isTransfer
                                ? 'text-purple-600'
                                : 'text-red-600'
                            }`}
                          >
                            {isIncome ? '+' : isTransfer ? '' : isCardPayment ? '납부 ' : '-'}
                            {Number(tx.amount).toLocaleString()}원
                          </span>

                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                            <button
                              onClick={() => onEditTransaction(tx)}
                              title="수정"
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(tx)}
                              title="삭제"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
