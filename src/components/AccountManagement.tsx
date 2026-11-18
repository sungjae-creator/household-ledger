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
} from 'lucide-react';

interface AccountManagementProps {
  paymentMethods: PaymentMethod[];
  onRefresh: () => void;
}

/**
 * 자산(은행 계좌 & 현금) 및 결제 카드 분리 관리 컴포넌트
 * 
 * [회계 원칙 적용]
 * 1. 보유 자산: 실제 잔액을 보유한 은행 계좌(BANK)와 현금(CASH)
 * 2. 결제 수단: 지출을 발생시키는 신용/체크카드(CARD)
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
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
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
                    ? '예: 신한 주거래통장, 카카오 비상금통장, 지갑 속 현금'
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
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50"
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
                    className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-blue-400 hover:shadow-md transition group"
                  >
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

                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition">
                        <button
                          onClick={() => handleOpenEditForm(pm)}
                          title="수정"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(pm.id, pm.name)}
                          title="삭제"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
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
                        className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(pm.id, pm.name)}
                        title="삭제"
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
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
    </div>
  );
}
