'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Category, PaymentMethod, Transaction, TransactionType, PaymentMethodType } from '@/types/database';
import {
  X,
  Check,
  Calendar,
  CreditCard,
  Tag,
  AlignLeft,
  FileText,
  AlertCircle,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  ArrowLeftRight,
  Landmark,
  ShieldCheck,
} from 'lucide-react';

interface TransactionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  editingTransaction?: Transaction | null;
}

/**
 * 가계부 거래내역 등록 및 수정 모달 컴포넌트
 * 
 * 1. 라벨 정리: '1단계', '2단계' 제거하고 '지출 대분류', '소분류', '결제수단 구분', '상세 결제수단'으로 표기
 * 2. '카드대금 납부' 탭 추가: 
 *    - 이중 지출 집계 방지를 위해 통계에서 자동 제외
 *    - 출금 계좌의 잔액은 정확하게 차감
 */
export default function TransactionFormModal({
  isOpen,
  onClose,
  onSuccess,
  categories,
  paymentMethods,
  editingTransaction,
}: TransactionFormModalProps) {
  const supabase = createClient();

  // 거래 유형 (지출 / 수입 / 이체 / 카드대금 납부)
  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [transactionDate, setTransactionDate] = useState<string>('');
  const [amount, setAmount] = useState<string>('');

  // 카테고리: 대분류 & 소분류
  const [selectedMajor, setSelectedMajor] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');

  // 지출 결제수단 구분 및 상세 수단
  const [selectedExpensePaymentType, setSelectedExpensePaymentType] = useState<PaymentMethodType | ''>('CARD');
  const [paymentMethodId, setPaymentMethodId] = useState<string>(''); // 출금계좌 또는 결제수단
  const [toPaymentMethodId, setToPaymentMethodId] = useState<string>(''); // (이체 시 입금계좌 / 카드결제 시 대상 카드)

  // 사용처 / 내역명 및 메모
  const [description, setDescription] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [excludeFromStats, setExcludeFromStats] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 순수 자산 계좌(은행 계좌, 현금) 목록
  const assetAccounts = useMemo(() => {
    return paymentMethods.filter((pm) => pm.type === 'BANK' || pm.type === 'CASH');
  }, [paymentMethods]);

  // 카드 목록
  const cardAccounts = useMemo(() => {
    return paymentMethods.filter((pm) => pm.type === 'CARD');
  }, [paymentMethods]);

  // 지출: 선택된 구분에 속하는 결제수단들
  const filteredExpensePaymentMethods = useMemo(() => {
    if (!selectedExpensePaymentType) return [];
    return paymentMethods.filter((pm) => pm.type === selectedExpensePaymentType);
  }, [paymentMethods, selectedExpensePaymentType]);

  // 모달 오픈 또는 수정 대상 변경 시 초기화
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];

    if (editingTransaction) {
      setType(editingTransaction.type);
      setTransactionDate(editingTransaction.transaction_date);
      setAmount(editingTransaction.amount.toString());
      setPaymentMethodId(editingTransaction.payment_method_id || '');
      setToPaymentMethodId(editingTransaction.to_payment_method_id || '');
      setDescription(editingTransaction.description);
      setMemo(editingTransaction.memo || '');
      setExcludeFromStats(editingTransaction.exclude_from_stats);

      // 결제수단 종류 복원
      if (editingTransaction.payment_method_id) {
        const foundPm = paymentMethods.find((p) => p.id === editingTransaction.payment_method_id);
        if (foundPm) {
          setSelectedExpensePaymentType(foundPm.type);
        }
      }

      // 카테고리 대분류/소분류 복원
      if (editingTransaction.category_id) {
        const foundCategory = categories.find((c) => c.id === editingTransaction.category_id);
        if (foundCategory) {
          setSelectedMajor(foundCategory.major_name);
          setCategoryId(foundCategory.id);
        }
      }
    } else {
      // 신규 등록 기본값 초기화
      setType('EXPENSE');
      setTransactionDate(today);
      setAmount('');
      setSelectedMajor('');
      setCategoryId('');
      setSelectedExpensePaymentType('CARD');
      setPaymentMethodId('');
      setToPaymentMethodId('');
      setDescription('');
      setMemo('');
      setExcludeFromStats(false);
    }
    setError(null);
  }, [editingTransaction, isOpen, categories, paymentMethods]);

  // 카드대금 납부 선택 시 기본 설명 자동 생성
  useEffect(() => {
    if (type === 'CARD_PAYMENT' && !editingTransaction) {
      const targetCard = cardAccounts.find((c) => c.id === toPaymentMethodId);
      if (targetCard) {
        setDescription(`${targetCard.name} 대금 결제`);
      } else {
        setDescription('신용카드 대금 결제');
      }
    }
  }, [type, toPaymentMethodId, cardAccounts, editingTransaction]);

  // 대분류 목록 추출
  const availableMajors = useMemo(() => {
    if (type === 'TRANSFER' || type === 'CARD_PAYMENT') return [];
    const majors = categories
      .filter((c) => c.type === type)
      .map((c) => c.major_name);
    return Array.from(new Set(majors));
  }, [categories, type]);

  // 소분류 목록 추출
  const availableSubCategories = useMemo(() => {
    if (type === 'TRANSFER' || type === 'CARD_PAYMENT' || !selectedMajor) return [];
    return categories.filter(
      (c) => c.type === type && c.major_name === selectedMajor
    );
  }, [categories, type, selectedMajor]);

  const handleMajorChange = (major: string) => {
    setSelectedMajor(major);
    setCategoryId('');
  };

  const handleExpensePaymentTypeChange = (pType: PaymentMethodType | '') => {
    setSelectedExpensePaymentType(pType);
    setPaymentMethodId('');
  };

  if (!isOpen) return null;

  /**
   * 계좌 잔액 업데이트 헬퍼 (BANK, CASH 자산만 잔액 증감)
   */
  const updateAccountBalance = async (accountId: string, delta: number) => {
    if (!accountId || delta === 0) return;
    const targetAccount = paymentMethods.find((p) => p.id === accountId);
    if (!targetAccount) return;

    if (targetAccount.type !== 'BANK' && targetAccount.type !== 'CASH') {
      return;
    }

    const newBalance = Number(targetAccount.balance || 0) + delta;
    await supabase
      .from('payment_methods')
      .update({ balance: newBalance })
      .eq('id', accountId);
  };

  /**
   * 저장 핸들러
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const parsedAmount = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('올바른 금액을 입력해 주세요.');
      setLoading(false);
      return;
    }

    if (!description.trim()) {
      setError('내역 설명을 입력해 주세요.');
      setLoading(false);
      return;
    }

    // 유효성 검사
    if (type === 'TRANSFER') {
      if (!paymentMethodId || !toPaymentMethodId) {
        setError('보내는 계좌와 받는 계좌를 모두 선택해 주세요.');
        setLoading(false);
        return;
      }
      if (paymentMethodId === toPaymentMethodId) {
        setError('보내는 계좌와 받는 계좌는 서로 달라야 합니다.');
        setLoading(false);
        return;
      }
    }

    if (type === 'CARD_PAYMENT') {
      if (!paymentMethodId) {
        setError('출금될 은행 통장 또는 현금을 선택해 주세요.');
        setLoading(false);
        return;
      }
      if (!toPaymentMethodId) {
        setError('납부할 대상 카드를 선택해 주세요.');
        setLoading(false);
        return;
      }
    }

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError('로그인이 필요합니다. 다시 로그인해 주세요.');
        setLoading(false);
        return;
      }

      // 카드대금 납부 및 이체는 통계 합계에서 자동 제외 (중복 지출 방지)
      const isAutoExcluded = type === 'CARD_PAYMENT' || type === 'TRANSFER';

      const payload = {
        user_id: user.id,
        type,
        transaction_date: transactionDate,
        amount: parsedAmount,
        category_id: type === 'TRANSFER' || type === 'CARD_PAYMENT' ? null : categoryId ? categoryId : null,
        payment_method_id: paymentMethodId ? paymentMethodId : null,
        to_payment_method_id: type === 'TRANSFER' || type === 'CARD_PAYMENT' ? toPaymentMethodId : null,
        description: description.trim(),
        memo: memo.trim() ? memo.trim() : null,
        exclude_from_stats: isAutoExcluded ? true : excludeFromStats,
      };

      if (editingTransaction) {
        // 기존 거래 잔액 롤백
        const oldAmount = Number(editingTransaction.amount);
        if (editingTransaction.type === 'EXPENSE' && editingTransaction.payment_method_id) {
          await updateAccountBalance(editingTransaction.payment_method_id, +oldAmount);
        } else if (editingTransaction.type === 'INCOME' && editingTransaction.payment_method_id) {
          await updateAccountBalance(editingTransaction.payment_method_id, -oldAmount);
        } else if (editingTransaction.type === 'CARD_PAYMENT' && editingTransaction.payment_method_id) {
          await updateAccountBalance(editingTransaction.payment_method_id, +oldAmount);
        } else if (editingTransaction.type === 'TRANSFER') {
          if (editingTransaction.payment_method_id) {
            await updateAccountBalance(editingTransaction.payment_method_id, +oldAmount);
          }
          if (editingTransaction.to_payment_method_id) {
            await updateAccountBalance(editingTransaction.to_payment_method_id, -oldAmount);
          }
        }

        const { error: updateError } = await supabase
          .from('transactions')
          .update({
            ...payload,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingTransaction.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('transactions')
          .insert([payload]);

        if (insertError) throw insertError;
      }

      // 신규/수정된 거래에 대해 자산 잔액 반영
      if (type === 'EXPENSE' && paymentMethodId) {
        await updateAccountBalance(paymentMethodId, -parsedAmount);
      } else if (type === 'INCOME' && paymentMethodId) {
        await updateAccountBalance(paymentMethodId, +parsedAmount);
      } else if (type === 'CARD_PAYMENT' && paymentMethodId) {
        // 카드대금 납부 -> 출금 통장에서 잔액 차감
        await updateAccountBalance(paymentMethodId, -parsedAmount);
      } else if (type === 'TRANSFER') {
        if (paymentMethodId) await updateAccountBalance(paymentMethodId, -parsedAmount);
        if (toPaymentMethodId) await updateAccountBalance(toPaymentMethodId, +parsedAmount);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(`저장 실패: ${err?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-slate-800">
            {editingTransaction ? '가계부 내역 수정' : '새 거래내역 작성'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 폼 본문 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="break-all">{error}</div>
            </div>
          )}

          {/* 1. 4개 유형 선택 탭 (지출 / 수입 / 이체 / 카드대금 납부) */}
          <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-xl text-xs sm:text-sm font-semibold">
            <button
              type="button"
              onClick={() => {
                setType('EXPENSE');
                setSelectedMajor('');
                setCategoryId('');
                setSelectedExpensePaymentType('CARD');
                setPaymentMethodId('');
              }}
              className={`flex items-center justify-center gap-1 py-2 rounded-lg transition cursor-pointer ${
                type === 'EXPENSE'
                  ? 'bg-red-500 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingDown className="w-4 h-4" />
              <span>지출</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setType('INCOME');
                setSelectedMajor('');
                setCategoryId('');
                setPaymentMethodId('');
              }}
              className={`flex items-center justify-center gap-1 py-2 rounded-lg transition cursor-pointer ${
                type === 'INCOME'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>수입</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setType('TRANSFER');
                setSelectedMajor('');
                setCategoryId('');
                setPaymentMethodId('');
              }}
              className={`flex items-center justify-center gap-1 py-2 rounded-lg transition cursor-pointer ${
                type === 'TRANSFER'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>이체</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setType('CARD_PAYMENT');
                setSelectedMajor('');
                setCategoryId('');
                setPaymentMethodId('');
                setToPaymentMethodId('');
              }}
              className={`flex items-center justify-center gap-1 py-2 rounded-lg transition cursor-pointer ${
                type === 'CARD_PAYMENT'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>카드대금</span>
            </button>
          </div>

          {/* 2. 날짜 및 금액 입력 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> 날짜
              </label>
              <input
                type="date"
                required
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {type === 'INCOME'
                  ? '수입 금액 (원)'
                  : type === 'TRANSFER'
                  ? '이체 금액 (원)'
                  : type === 'CARD_PAYMENT'
                  ? '카드 납부 금액 (원)'
                  : '지출 금액 (원)'}
              </label>
              <input
                type="number"
                required
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="예: 50000"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 3. [지출 / 수입] 카테고리 선택 (단계 표시 없이 바로 대분류 / 소분류로 명시) */}
          {(type === 'EXPENSE' || type === 'INCOME') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-blue-500" />
                  {type === 'INCOME' ? '수입 대분류' : '지출 대분류'}
                </label>
                <select
                  value={selectedMajor}
                  onChange={(e) => handleMajorChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">대분류 선택</option>
                  {availableMajors.map((major) => (
                    <option key={major} value={major}>
                      {major}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-emerald-500" />
                  소분류
                </label>
                <select
                  value={categoryId}
                  disabled={!selectedMajor}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">
                    {!selectedMajor ? '대분류를 먼저 선택하세요' : '소분류 선택'}
                  </option>
                  {availableSubCategories.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.sub_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 4. [결제수단 선택 영역] */}

          {/* 4-1. [지출]: 단계 표시 없이 결제수단구분 -> 상세결제수단 */}
          {type === 'EXPENSE' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-red-50/40 border border-red-100 rounded-xl">
              <div>
                <label className="block text-xs font-bold text-red-900 mb-1 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5" /> 결제수단 구분
                </label>
                <select
                  value={selectedExpensePaymentType}
                  onChange={(e) =>
                    handleExpensePaymentTypeChange(e.target.value as PaymentMethodType | '')
                  }
                  className="w-full px-3 py-2 bg-white border border-red-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">결제 구분 선택</option>
                  <option value="CARD">💳 카드 결제 (신용/체크)</option>
                  <option value="BANK">🏦 은행 계좌 (이체/출금)</option>
                  <option value="CASH">💵 현금 결제</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-red-900 mb-1 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> 상세 {selectedExpensePaymentType === 'CARD' ? '카드' : selectedExpensePaymentType === 'BANK' ? '계좌' : '수단'} 선택
                </label>
                <select
                  value={paymentMethodId}
                  disabled={!selectedExpensePaymentType}
                  onChange={(e) => setPaymentMethodId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-red-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                >
                  <option value="">
                    {!selectedExpensePaymentType
                      ? '구분을 먼저 선택하세요'
                      : filteredExpensePaymentMethods.length === 0
                      ? '등록된 항목이 없습니다'
                      : '선택하세요'}
                  </option>
                  {filteredExpensePaymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name}
                      {pm.type === 'BANK' || pm.type === 'CASH'
                        ? ` (잔액: ${Number(pm.balance || 0).toLocaleString()}원)`
                        : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 4-2. [수입]: 입금 자산 선택 */}
          {type === 'INCOME' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <Landmark className="w-3.5 h-3.5 text-emerald-600" /> 입금 자산 (입금된 통장 또는 현금)
              </label>
              <select
                required
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">입금받을 계좌/현금 선택</option>
                {assetAccounts.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.type === 'BANK' ? '🏦 ' : '💵 '} {pm.name} (잔액: {Number(pm.balance || 0).toLocaleString()}원)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 4-3. [이체]: 출금 계좌 -> 입금 계좌 */}
          {type === 'TRANSFER' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-purple-50/50 border border-purple-100 rounded-xl">
              <div>
                <label className="block text-xs font-bold text-purple-900 mb-1">
                  보내는 자산 (출금 통장/현금)
                </label>
                <select
                  required
                  value={paymentMethodId}
                  onChange={(e) => setPaymentMethodId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">출금 계좌 선택</option>
                  {assetAccounts.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.type === 'BANK' ? '🏦 ' : '💵 '} {pm.name} (잔액: {Number(pm.balance || 0).toLocaleString()}원)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-purple-900 mb-1 flex items-center gap-1">
                  <ArrowRight className="w-3.5 h-3.5" /> 받는 자산 (입금 통장/현금)
                </label>
                <select
                  required
                  value={toPaymentMethodId}
                  onChange={(e) => setToPaymentMethodId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">입금 계좌 선택</option>
                  {assetAccounts
                    .filter((pm) => pm.id !== paymentMethodId)
                    .map((pm) => (
                      <option key={pm.id} value={pm.id}>
                        {pm.type === 'BANK' ? '🏦 ' : '💵 '} {pm.name} (잔액: {Number(pm.balance || 0).toLocaleString()}원)
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          {/* 4-4. [카드대금 납부]: 출금 통장 -> 대상 카드 (중복 지출 방지) */}
          {type === 'CARD_PAYMENT' && (
            <div className="space-y-3 p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-indigo-950 mb-1 flex items-center gap-1">
                    <Landmark className="w-3.5 h-3.5 text-indigo-600" /> 출금 계좌 (카드값이 빠져나간 통장)
                  </label>
                  <select
                    required
                    value={paymentMethodId}
                    onChange={(e) => setPaymentMethodId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">출금 통장 선택</option>
                    {assetAccounts.map((pm) => (
                      <option key={pm.id} value={pm.id}>
                        {pm.type === 'BANK' ? '🏦 ' : '💵 '} {pm.name} (잔액: {Number(pm.balance || 0).toLocaleString()}원)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-indigo-950 mb-1 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-indigo-600" /> 납부 대상 카드
                  </label>
                  <select
                    required
                    value={toPaymentMethodId}
                    onChange={(e) => setToPaymentMethodId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">결제할 카드 선택</option>
                    {cardAccounts.map((pm) => (
                      <option key={pm.id} value={pm.id}>
                        💳 {pm.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 중복 지출 방지 안내문 */}
              <div className="flex items-start gap-2 p-2.5 bg-white/80 border border-indigo-100 rounded-lg text-xs text-indigo-800">
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  카드대금 납부는 <strong>월간 소비 지출 합계에서 자동으로 제외</strong>되어 이중 집계를 방지하며, <strong>출금 통장의 잔액만 정확하게 차감</strong>됩니다.
                </span>
              </div>
            </div>
          )}

          {/* 5. 사용처 / 입금처 / 내역명 */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
              <AlignLeft className="w-3.5 h-3.5" />
              {type === 'INCOME'
                ? '입금처 / 출처'
                : type === 'TRANSFER'
                ? '이체 내용 / 목적'
                : type === 'CARD_PAYMENT'
                ? '카드 결제 내용'
                : '사용처 / 가맹점'}
            </label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                type === 'INCOME'
                  ? '예: 회사 (11월 급여), 중고거래 판매대금 등'
                  : type === 'TRANSFER'
                  ? '예: 적금통장 납입, 비상금 이체 등'
                  : type === 'CARD_PAYMENT'
                  ? '예: 신한카드 11월 결제대금 출금'
                  : '예: 스타벅스 강남점, 이마트 역삼점 등'
              }
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 6. 상세 메모 */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> 상세 메모 (선택)
            </label>
            <textarea
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="필요한 추가 메모를 작성하세요"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 7. 통계 제외 여부 (지출, 수입에서만 노출 / 이체와 카드결제는 자동 제외) */}
          {(type === 'EXPENSE' || type === 'INCOME') && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="excludeFromStats"
                checked={excludeFromStats}
                onChange={(e) => setExcludeFromStats(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="excludeFromStats" className="text-xs text-slate-600 cursor-pointer select-none">
                합계 및 소비 통계 분석에서 제외
              </label>
            </div>
          )}

          {/* 모달 하단 버튼 */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2 text-white text-sm font-semibold rounded-xl shadow-md flex items-center gap-1.5 transition disabled:opacity-60 cursor-pointer ${
                type === 'EXPENSE'
                  ? 'bg-red-500 hover:bg-red-600 shadow-red-200'
                  : type === 'INCOME'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                  : type === 'CARD_PAYMENT'
                  ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                  : 'bg-purple-600 hover:bg-purple-700 shadow-purple-200'
              }`}
            >
              <Check className="w-4 h-4" />
              {loading ? '처리 중...' : editingTransaction ? '수정 완료' : '등록하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
