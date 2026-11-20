'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PaymentMethod, PaymentMethodType } from '@/types/database';
import {
  Landmark,
  CreditCard,
  Banknote,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Wallet,
  AlertCircle,
  Coins,
  History,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Filter,
  Calendar,
  Clock,
} from 'lucide-react';

interface AccountManagementProps {
  paymentMethods: PaymentMethod[];
  onRefresh: () => void;
}

type HistoryPeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL';

/**
 * 자산(은행 계좌 & 현금) 및 결제 카드 분리 관리 컴포넌트
 *
 * [주요 기능]
 * 1. 보유 자산: 실제 잔액을 보유한 은행 계좌(BANK)와 현금(CASH)
 * 2. 결제 수단: 지출을 발생시키는 신용/체크카드(CARD)
 * 3. [내역] 기능: 각 은행 계좌 및 현금의 잔액 증감(플러스/마이너스) 거래 내역 상세 조회 모달
 * 4. [기간 필터]: 데이터 증가 시 성능 저하 방지를 위한 기간 필터(1개월[기본]/3개월/6개월/1년/전체) 적용
 */
export default function AccountManagement({
  paymentMethods,
  onRefresh,
}: AccountManagementProps) {
  const supabase = createClient();

  // 화면 관리 탭: 'ASSETS' (은행/현금 자산) vs 'CARDS' (결제 카드)
  const [viewTab, setViewTab] = useState<'ASSETS' | 'CARDS'>('ASSETS');

  // 등록/수정 폼 상태
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<PaymentMethodType>('BANK');
  const [balance, setBalance] = useState<string>('0');
  const [memo, setMemo] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 계좌별 잔액 증감 내역 모달 상태 (기본 기간: 최근 1개월)
  const [selectedAccountForHistory, setSelectedAccountForHistory] = useState<PaymentMethod | null>(null);
  const [historyTransactions, setHistoryTransactions] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('1M'); // 기본 1개월
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [historySearch, setHistorySearch] = useState<string>('');

  // 1. 순수 자산(은행 계좌 + 현금)만 분리
  const assetAccounts = paymentMethods.filter(
    (pm) => pm.type === 'BANK' || pm.type === 'CASH'
  );

  // 2. 결제 카드(신용/체크카드)만 분리
  const cardAccounts = paymentMethods.filter(
    (pm) => pm.type === 'CARD'
  );

  // 총 순자산 합계 (은행 계좌 잔액 + 현금 잔액만 합산, 카드는 제외!)
  const totalAssetBalance = assetAccounts.reduce(
    (sum, pm) => sum + Number(pm.balance || 0),
    0
  );

  /**
   * 새 항목 추가 폼 열기
   */
  const handleOpenAddForm = (defaultType: PaymentMethodType) => {
    setEditingId(null);
    setName('');
    setType(defaultType);
    setBalance('0');
    setMemo('');
    setError(null);
    setIsEditing(true);
  };

  /**
   * 기존 항목 수정 폼 열기
   */
  const handleOpenEditForm = (pm: PaymentMethod) => {
    setEditingId(pm.id);
    setName(pm.name);
    setType(pm.type);
    setBalance(pm.balance.toString());
    setMemo(pm.memo || '');
    setError(null);
    setIsEditing(true);
  };

  /**
   * 기간에 따른 시작일(YYYY-MM-DD) 계산 헬퍼
   */
  const getStartDateByPeriod = (period: HistoryPeriod): string | null => {
    if (period === 'ALL') return null;
    const date = new Date();
    if (period === '1M') {
      date.setMonth(date.getMonth() - 1);
    } else if (period === '3M') {
      date.setMonth(date.getMonth() - 3);
    } else if (period === '6M') {
      date.setMonth(date.getMonth() - 6);
    } else if (period === '1Y') {
      date.setFullYear(date.getFullYear() - 1);
    }
    return date.toISOString().split('T')[0];
  };

  /**
   * 선택된 자산 및 기간에 맞게 내역 데이터를 Supabase에서 가져오는 함수
   */
  const fetchAccountHistory = async (pm: PaymentMethod, period: HistoryPeriod) => {
    setLoadingHistory(true);
    try {
      const startDate = getStartDateByPeriod(period);

      let query = supabase
        .from('transactions')
        .select(`
          *,
          category:categories(*)
        `)
        .or(`payment_method_id.eq.${pm.id},to_payment_method_id.eq.${pm.id}`)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });

      // 기간 필터 적용 (데이터 과부하 방지)
      if (startDate) {
        query = query.gte('transaction_date', startDate);
      }

      const { data, error: histErr } = await query;
      if (histErr) throw histErr;
      setHistoryTransactions(data || []);
    } catch (err: any) {
      alert(`내역 조회 실패: ${err?.message || err}`);
    } finally {
      setLoadingHistory(false);
    }
  };

  /**
   * 특정 자산(계좌/현금)의 증감 내역 모달 열기 (기본 최근 1개월)
   */
  const handleOpenHistory = async (pm: PaymentMethod) => {
    setSelectedAccountForHistory(pm);
    setHistoryPeriod('1M'); // 기본 1개월
    setHistoryFilter('ALL');
    setHistorySearch('');
    await fetchAccountHistory(pm, '1M');
  };

  /**
   * 모달 내에서 기간 필터 변경 시 호출
   */
  const handlePeriodChange = async (newPeriod: HistoryPeriod) => {
    if (!selectedAccountForHistory) return;
    setHistoryPeriod(newPeriod);
    await fetchAccountHistory(selectedAccountForHistory, newPeriod);
  };

  /**
   * 특정 거래가 해당 계좌에 미치는 증감 영향(Delta) 계산 헬퍼
   */
  const getTransactionImpact = (tx: any, accountId: string) => {
    let delta = 0;
    let label = '';
    let badgeColor = '';

    const amount = Number(tx.amount || 0);

    if (tx.type === 'INCOME') {
      delta = amount; // 입금 (+)
      label = '수입 입금';
      badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    } else if (tx.type === 'EXPENSE') {
      delta = -amount; // 지출 출금 (-)
      label = '지출 출금';
      badgeColor = 'bg-red-50 text-red-700 border-red-200';
    } else if (tx.type === 'CARD_PAYMENT') {
      delta = -amount; // 카드대금 납부 출금 (-)
      label = '카드대금 납부';
      badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
    } else if (tx.type === 'TRANSFER') {
      if (tx.to_payment_method_id === accountId) {
        delta = amount; // 다른 계좌에서 이체되어 입금 (+)
        label = '이체 입금';
        badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
      } else {
        delta = -amount; // 다른 계좌로 송금 출금 (-)
        label = '이체 출금';
        badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
      }
    }

    return { delta, label, badgeColor };
  };

  /**
   * 저장 핸들러
   */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('명칭을 입력해 주세요.');
      return;
    }

    setLoading(true);
    setError(null);

    // 카드는 잔액이 필요 없으므로 0으로 설정
    const parsedBalance = type === 'CARD' ? 0 : parseFloat(balance.replace(/,/g, '')) || 0;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('로그인이 필요합니다.');

      if (editingId) {
        // 수정 (UPDATE)
        const { error: updateErr } = await supabase
          .from('payment_methods')
          .update({
            name: name.trim(),
            type,
            balance: parsedBalance,
            memo: memo.trim() ? memo.trim() : null,
          })
          .eq('id', editingId);

        if (updateErr) throw updateErr;
      } else {
        // 신규 추가 (INSERT)
        const { error: insertErr } = await supabase
          .from('payment_methods')
          .insert([
            {
              user_id: user.id,
              name: name.trim(),
              type,
              balance: parsedBalance,
              memo: memo.trim() ? memo.trim() : null,
              sort_order: paymentMethods.length + 1,
            },
          ]);

        if (insertErr) throw insertErr;
      }

      setIsEditing(false);
      onRefresh();
    } catch (err: any) {
      setError(`저장 실패: ${err?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 삭제 핸들러
   */
  const handleDelete = async (id: string, accountName: string) => {
    if (
      !confirm(
        `'${accountName}'을(를) 정말 삭제하시겠습니까?\n(기존 거래내역의 결제수단 표시는 '미지정'으로 유지됩니다.)`
      )
    ) {
      return;
    }

    const { error: deleteErr } = await supabase
      .from('payment_methods')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      alert(`삭제 실패: ${deleteErr.message}`);
    } else {
      onRefresh();
    }
  };

  // 내역 모달 필터링 및 통계 계산
  const processedHistory = selectedAccountForHistory
    ? historyTransactions.map((tx) => {
        const impact = getTransactionImpact(tx, selectedAccountForHistory.id);
        return { ...tx, ...impact };
      })
    : [];

  const filteredHistory = processedHistory.filter((item) => {
    // 1) 탭 필터 (전체 / 입금만 / 출금만)
    if (historyFilter === 'INCOME' && item.delta <= 0) return false;
    if (historyFilter === 'EXPENSE' && item.delta >= 0) return false;

    // 2) 검색어 필터
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      const matchDesc = (item.description || '').toLowerCase().includes(q);
      const matchMemo = (item.memo || '').toLowerCase().includes(q);
      const matchCategory =
        item.category &&
        (`${item.category.major_name} ${item.category.sub_name}`)
          .toLowerCase()
          .includes(q);
      return matchDesc || matchMemo || matchCategory;
    }

    return true;
  });

  // 선택된 기간 내의 총 입금액 / 출금액 합계 계산
  const totalInflow = processedHistory
    .filter((i) => i.delta > 0)
    .reduce((sum, i) => sum + i.delta, 0);

  const totalOutflow = processedHistory
    .filter((i) => i.delta < 0)
    .reduce((sum, i) => sum + Math.abs(i.delta), 0);

  return (
    <div className="space-y-6">
      {/* 1. 상단 총 순자산 현황 배너 (은행 계좌 + 현금만 계산) */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-slate-800 rounded-2xl p-6 sm:p-8 text-white shadow-lg shadow-blue-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-200 text-sm font-semibold mb-1">
              <Coins className="w-5 h-5 text-amber-300" />
              <span>내 보유 순자산 총액 (은행 계좌 + 현금)</span>
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              {totalAssetBalance.toLocaleString()}원
            </div>
            <p className="text-xs text-blue-200 mt-2">
              실제 보유 중인 통장 잔액과 현금의 합계입니다. (결제 카드는 부채/결제수단이므로 자산 합산에서 제외됩니다.)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenAddForm(viewTab === 'ASSETS' ? 'BANK' : 'CARD')}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-white hover:bg-blue-50 text-blue-700 font-bold rounded-xl shadow-md transition self-start sm:self-auto cursor-pointer text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>{viewTab === 'ASSETS' ? '새 자산(계좌/현금) 등록' : '새 결제 카드 등록'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. 자산 vs 카드 분리 탭 선택기 */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => {
              setViewTab('ASSETS');
              setIsEditing(false);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${
              viewTab === 'ASSETS'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Landmark className="w-4 h-4" />
            <span>내 보유 자산 ({assetAccounts.length}개)</span>
          </button>

          <button
            onClick={() => {
              setViewTab('CARDS');
              setIsEditing(false);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${
              viewTab === 'CARDS'
                ? 'bg-white text-purple-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>결제 카드 ({cardAccounts.length}개)</span>
          </button>
        </div>

        <span className="text-xs text-slate-500 hidden sm:block">
          {viewTab === 'ASSETS'
            ? '입금/출금/이체가 가능한 실제 금융 자산'
            : '소비 지출 시 사용하는 결제 카드'}
        </span>
      </div>

      {/* 3. 등록/수정 입력 모달/카드 */}
      {isEditing && (
        <div className="bg-white rounded-2xl p-6 border-2 border-blue-500 shadow-md animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-800">
              {editingId
                ? `${name} 정보 수정`
                : viewTab === 'ASSETS'
                ? '새 은행 계좌 / 현금 자산 등록'
                : '새 신용 / 체크카드 등록'}
            </h3>
            <button
              onClick={() => setIsEditing(false)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {viewTab === 'ASSETS' ? '계좌 / 자산 명칭' : '카드 명칭'}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  viewTab === 'ASSETS'
                    ? '예: 신한 주거래통장, 하나저축은행, 주머니현금'
                    : '예: 신한 딥드림 신용카드, 국민 노리체크카드'
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                구분
              </label>
              {viewTab === 'ASSETS' ? (
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as PaymentMethodType)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="BANK">은행 계좌 (입출금/예적금)</option>
                  <option value="CASH">현금 자산 (지갑/비상금)</option>
                </select>
              ) : (
                <select
                  value={type}
                  disabled
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-600"
                >
                  <option value="CARD">신용 / 체크카드 (지출 결제 전용)</option>
                </select>
              )}
            </div>

            {/* 잔액 입력란: 자산(BANK, CASH)일 때만 표시 */}
            {viewTab === 'ASSETS' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  현재 잔액 (원)
                </label>
                <input
                  type="number"
                  step="any"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div className={viewTab === 'ASSETS' ? '' : 'sm:col-span-2'}>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                메모 (선택)
              </label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder={
                  viewTab === 'ASSETS'
                    ? '계좌번호 뒷자리 또는 용도 메모'
                    : '결제일(예: 매월 14일), 연결 결제계좌 등'
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{loading ? '저장 중...' : '저장 완료'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. 자산 목록 탭 화면 */}
      {viewTab === 'ASSETS' && (
        <div>
          {assetAccounts.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
              <Landmark className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700">등록된 보유 자산이 없습니다</h3>
              <p className="text-xs text-slate-500 mt-1">
                주거래 은행 통장이나 현금 자산을 등록하여 실시간 잔액을 관리해 보세요.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assetAccounts.map((pm) => {
                const isBank = pm.type === 'BANK';

                return (
                  <div
                    key={pm.id}
                    className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-blue-400 hover:shadow-md transition group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                              isBank
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-emerald-50 text-emerald-600'
                            }`}
                          >
                            {isBank ? (
                              <Landmark className="w-6 h-6" />
                            ) : (
                              <Banknote className="w-6 h-6" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-800 text-sm">{pm.name}</h4>
                            <span className="text-[11px] font-semibold text-slate-400">
                              {isBank ? '은행 입출금/예적금' : '현금 자산'}
                            </span>
                          </div>
                        </div>

                        {/* 작업 버튼: 내역 조회, 수정, 삭제 */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenHistory(pm)}
                            title="증감 내역 조회"
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>내역</span>
                          </button>
                          <button
                            onClick={() => handleOpenEditForm(pm)}
                            title="수정"
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(pm.id, pm.name)}
                            title="삭제"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-baseline justify-between">
                        <span className="text-xs text-slate-500">현재 잔액</span>
                        <span className="text-xl font-extrabold text-blue-700">
                          {Number(pm.balance || 0).toLocaleString()}원
                        </span>
                      </div>

                      {pm.memo && (
                        <div className="mt-2 text-[11px] text-slate-400 truncate">
                          {pm.memo}
                        </div>
                      )}
                    </div>

                    {/* 카드 하단 빠른 내역 바로가기 링크 */}
                    <div className="mt-3 pt-2.5 border-t border-dashed border-slate-100 flex justify-end">
                      <button
                        onClick={() => handleOpenHistory(pm)}
                        className="text-[11px] text-slate-500 hover:text-blue-600 font-semibold flex items-center gap-1 transition cursor-pointer"
                      >
                        <span>입출금 증감 상세 확인</span>
                        <span>&rarr;</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. 카드 목록 탭 화면 */}
      {viewTab === 'CARDS' && (
        <div>
          {cardAccounts.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
              <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700">등록된 카드가 없습니다</h3>
              <p className="text-xs text-slate-500 mt-1">
                자주 사용하는 신용카드나 체크카드를 등록해 두시면 지출 작성 시 쉽게 선택할 수 있습니다.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cardAccounts.map((pm) => (
                <div
                  key={pm.id}
                  className="bg-white rounded-2xl p-5 border border-purple-200 hover:border-purple-400 hover:shadow-md transition group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
                        <CreditCard className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{pm.name}</h4>
                        <span className="text-[11px] font-semibold text-purple-600">
                          결제 수단 (카드)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition">
                      <button
                        onClick={() => handleOpenEditForm(pm)}
                        title="수정"
                        className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(pm.id, pm.name)}
                        title="삭제"
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                    <span>지출 전용 결제수단</span>
                    <span className="text-purple-600 font-medium">소비 시 사용</span>
                  </div>

                  {pm.memo && (
                    <div className="mt-2 text-[11px] text-slate-400 truncate">
                      {pm.memo}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. 자산 잔액 증감 상세 내역 모달 */}
      {selectedAccountForHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            {/* 모달 상단 헤더 */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/60 sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  {selectedAccountForHistory.type === 'BANK' ? (
                    <Landmark className="w-5 h-5" />
                  ) : (
                    <Banknote className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold text-slate-800">
                      {selectedAccountForHistory.name}
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-md font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                      {selectedAccountForHistory.type === 'BANK' ? '은행 통장' : '현금 자산'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    현재 저장된 잔액:{' '}
                    <strong className="text-blue-700 font-extrabold text-sm">
                      {Number(selectedAccountForHistory.balance || 0).toLocaleString()}원
                    </strong>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedAccountForHistory(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 증감 요약 통계 배너 */}
            <div className="px-5 sm:px-6 py-3.5 bg-slate-50/40 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 bg-emerald-50/70 border border-emerald-100 rounded-xl">
                <span className="text-emerald-700 font-semibold block mb-0.5">선택 기간 총 입금 (+)</span>
                <span className="text-sm sm:text-base font-extrabold text-emerald-700">
                  +{totalInflow.toLocaleString()}원
                </span>
              </div>
              <div className="p-2.5 bg-red-50/70 border border-red-100 rounded-xl">
                <span className="text-red-700 font-semibold block mb-0.5">선택 기간 총 출금 (-)</span>
                <span className="text-sm sm:text-base font-extrabold text-red-700">
                  -{totalOutflow.toLocaleString()}원
                </span>
              </div>
              <div className="col-span-2 sm:col-span-1 p-2.5 bg-blue-50/70 border border-blue-100 rounded-xl flex sm:flex-col justify-between sm:justify-start items-center sm:items-start">
                <span className="text-blue-700 font-semibold block mb-0.5">기간 순 증감액</span>
                <span
                  className={`text-sm sm:text-base font-extrabold ${
                    totalInflow - totalOutflow >= 0 ? 'text-blue-700' : 'text-red-600'
                  }`}
                >
                  {totalInflow - totalOutflow >= 0 ? '+' : ''}
                  {(totalInflow - totalOutflow).toLocaleString()}원
                </span>
              </div>
            </div>

            {/* 1) 기간 선택 탭 바 (최근 1개월 기본값) */}
            <div className="px-5 sm:px-6 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto">
              <div className="flex items-center gap-1.5 text-xs shrink-0">
                <Clock className="w-3.5 h-3.5 text-slate-500 mr-1" />
                <span className="font-bold text-slate-700 mr-1">조회 기간:</span>

                <button
                  onClick={() => handlePeriodChange('1M')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer text-xs ${
                    historyPeriod === '1M'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  최근 1개월 (기본)
                </button>
                <button
                  onClick={() => handlePeriodChange('3M')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer text-xs ${
                    historyPeriod === '3M'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  최근 3개월
                </button>
                <button
                  onClick={() => handlePeriodChange('6M')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer text-xs ${
                    historyPeriod === '6M'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  최근 6개월
                </button>
                <button
                  onClick={() => handlePeriodChange('1Y')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer text-xs ${
                    historyPeriod === '1Y'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  최근 1년
                </button>
                <button
                  onClick={() => handlePeriodChange('ALL')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer text-xs ${
                    historyPeriod === 'ALL'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  전체
                </button>
              </div>

              {historyPeriod !== 'ALL' && (
                <span className="text-[11px] text-slate-500 font-mono hidden md:inline shrink-0">
                  {getStartDateByPeriod(historyPeriod)} ~ 오늘
                </span>
              )}
            </div>

            {/* 2) 입/출금 구분 필터 및 검색창 */}
            <div className="px-5 sm:px-6 py-2.5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <button
                  onClick={() => setHistoryFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    historyFilter === 'ALL'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  전체 ({processedHistory.length})
                </button>
                <button
                  onClick={() => setHistoryFilter('INCOME')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    historyFilter === 'INCOME'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  입금만 (+)
                </button>
                <button
                  onClick={() => setHistoryFilter('EXPENSE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    historyFilter === 'EXPENSE'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  출금만 (-)
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="사용처, 메모, 카테고리 검색..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 내역 리스트 영역 */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5">
              {loadingHistory ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  해당 기간의 증감 내역을 불러오는 중입니다...
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="py-16 text-center">
                  <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-600">선택한 기간에 등록된 내역이 없습니다</p>
                  <p className="text-xs text-slate-400 mt-1">
                    상단의 기간 버튼(최근 3개월, 6개월, 1년, 전체)을 눌러 더 넓은 기간의 내역을 확인해 보세요.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredHistory.map((item) => {
                    const isPositive = item.delta > 0;

                    return (
                      <div
                        key={item.id}
                        className="p-3 sm:p-3.5 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-xs transition flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* 입금/출금 아이콘 */}
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                              isPositive
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-red-50 text-red-600'
                            }`}
                          >
                            {isPositive ? (
                              <ArrowDownLeft className="w-5 h-5" />
                            ) : (
                              <ArrowUpRight className="w-5 h-5" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-[11px] text-slate-400">
                                {item.transaction_date}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${item.badgeColor}`}
                              >
                                {item.label}
                              </span>
                              {item.category && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                  {item.category.major_name} &gt; {item.category.sub_name}
                                </span>
                              )}
                            </div>
                            <div className="font-bold text-slate-800 text-sm mt-0.5 truncate">
                              {item.description}
                            </div>
                            {item.memo && (
                              <div className="text-[11px] text-slate-400 truncate mt-0.5">
                                {item.memo}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 금액 변동치 */}
                        <div className="text-right shrink-0">
                          <div
                            className={`text-sm sm:text-base font-extrabold font-mono ${
                              isPositive ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            {isPositive ? '+' : '-'}
                            {Math.abs(item.delta).toLocaleString()}원
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {isPositive ? '잔액 증가' : '잔액 차감'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 모달 하단 닫기 바 */}
            <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span>총 {filteredHistory.length}건 표시 중</span>
              <button
                onClick={() => setSelectedAccountForHistory(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
