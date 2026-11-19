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
 * 전역 네비게이션 헤더 및 모바일 하단 탭 바 컴포넌트
 * 
 * - PC 화면: 상단 헤더에 로고 + 메뉴 탭 + 사용자 정보 + 로그아웃 표시
 * - 모바일 화면: 상단 헤더는 깔끔하게 로고와 로그아웃만 남기고,
 *   화면 맨 아래에 '모바일 하단 탭 바(Bottom Bar)'를 고정하여 글자 찌그러짐을 원천 방지하고
 *   스마트폰 금융 앱(토스/뱅크샐러드)처럼 엄지손가락으로 쉽게 누를 수 있게 제공합니다.
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

  const navItems = [
    { id: 'transactions' as const, label: '가계부 내역', icon: Receipt },
    { id: 'accounts' as const, label: '자산·계좌', icon: Landmark },
    { id: 'dashboard' as const, label: '통계 분석', icon: BarChart3 },
    { id: 'import' as const, label: '엑셀·가져오기', icon: FileSpreadsheet },
  ];

  return (
    <>
      {/* 1. 상단 고정 헤더 */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* 로고 영역 */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-200 shrink-0">
                <Wallet className="w-4 h-4 sm:w-6 sm:h-6" />
              </div>
              <div>
                <span className="font-bold text-base sm:text-lg text-slate-800 tracking-tight block">
                  스마트 가계부
                </span>
                <span className="text-[11px] text-slate-500 hidden sm:block">
                  입력과 분석을 한 번에
                </span>
              </div>
            </div>

            {/* PC 전용 중앙 탭 네비게이션 (모바일에서는 숨김) */}
            <nav className="hidden md:flex items-center gap-1 sm:gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 text-blue-600 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* 우측 프로필 & 로그아웃 */}
            <div className="flex items-center gap-2 sm:gap-3">
              {userEmail && (
                <div className="hidden lg:flex items-center gap-2 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-medium truncate max-w-[140px]">{userEmail}</span>
                </div>
              )}
              <button
                onClick={handleLogout}
                title="로그아웃"
                className="flex items-center gap-1 p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer text-xs font-semibold"
              >
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">로그아웃</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 2. 모바일 전용 하단 고정 탭 바 (화면 폭이 좁은 스마트폰에서만 노출) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg px-2 py-1 flex items-center justify-around safe-area-bottom">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition cursor-pointer min-w-[64px] ${
                isActive
                  ? 'text-blue-600 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div
                className={`p-1 rounded-lg transition ${
                  isActive ? 'bg-blue-50' : 'bg-transparent'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
              </div>
              <span className="text-[11px] mt-0.5 whitespace-nowrap tracking-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
