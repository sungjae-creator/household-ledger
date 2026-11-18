'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Wallet,
  LogOut,
  BarChart3,
  Receipt,
  FileSpreadsheet,
  User,
  Landmark,
} from 'lucide-react';

interface HeaderProps {
  userEmail?: string | null;
  activeTab: 'transactions' | 'dashboard' | 'accounts' | 'import';
  setActiveTab: (tab: 'transactions' | 'dashboard' | 'accounts' | 'import') => void;
}

/**
 * 전역 네비게이션 헤더 컴포넌트
 * 가계부 내역, 통계 대시보드, 자산/계좌 관리, 엑셀 가져오기 탭을 제공합니다.
 */
export default function Header({ userEmail, activeTab, setActiveTab }: HeaderProps) {
  const router = useRouter();
  const supabase = createClient();

  /**
   * 로그아웃 처리 함수
   */
  const handleLogout = async () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* 로고 영역 */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-200">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <span className="font-bold text-lg text-slate-800 tracking-tight block">
                스마트 웹 가계부
              </span>
              <span className="text-xs text-slate-600 hidden sm:block">
                입력과 분석을 한 번에
              </span>
            </div>
          </div>

          {/* 중앙 탭 네비게이션 */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab('transactions')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer ${
                activeTab === 'transactions'
                  ? 'bg-blue-50 text-blue-600 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>가계부 내역</span>
            </button>

            <button
              onClick={() => setActiveTab('accounts')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer ${
                activeTab === 'accounts'
                  ? 'bg-blue-50 text-blue-600 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Landmark className="w-4 h-4" />
              <span>자산 & 계좌</span>
            </button>

            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-blue-50 text-blue-600 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>통계 & 대시보드</span>
            </button>

            <button
              onClick={() => setActiveTab('import')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer ${
                activeTab === 'import'
                  ? 'bg-blue-50 text-blue-600 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>엑셀 / 네이버</span>
            </button>
          </nav>

          {/* 우측 유저 프로필 & 로그아웃 */}
          <div className="flex items-center gap-3">
            {userEmail && (
              <div className="hidden md:flex items-center gap-2 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-medium truncate max-w-[150px]">{userEmail}</span>
              </div>
            )}
            <button
              onClick={handleLogout}
              title="로그아웃"
              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
