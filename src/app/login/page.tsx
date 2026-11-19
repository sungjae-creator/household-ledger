'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Wallet, LogIn, Lock, Mail, AlertCircle, ShieldCheck } from 'lucide-react';

/**
 * 로그인 페이지 컴포넌트
 * (개인 전용 프라이빗 가계부: 타인의 신규 회원가입이 원천 차단된 안전한 개인 시스템)
 */
export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  // 사용자가 입력한 이메일과 비밀번호 상태
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // 로딩 상태 및 오류 메시지 상태
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * 로그인 폼 제출 핸들러
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setErrorMessage('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else if (error.message.includes('Email not confirmed')) {
          setErrorMessage('이메일 인증이 완료되지 않았습니다. 메일함을 확인해 주세요.');
        } else {
          setErrorMessage(`로그인 실패: ${error.message}`);
        }
        return;
      }

      if (data.user) {
        router.push('/');
        router.refresh();
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(`오류가 발생했습니다: ${err.message}`);
      } else {
        setErrorMessage('알 수 없는 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
        {/* 서비스 로고 및 헤더 */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200 mb-3">
            <Wallet className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">스마트 웹 가계부</h1>
          <div className="flex items-center gap-1.5 mt-1.5 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>개인 전용 프라이빗 시스템</span>
          </div>
        </div>

        {/* 에러 메시지 알림창 */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>{errorMessage}</div>
          </div>
        )}

        {/* 로그인 입력 폼 */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              이메일 주소
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-5 h-5" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="등록된 이메일을 입력하세요"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              비밀번호
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-md shadow-blue-200 flex items-center justify-center gap-2 transition disabled:opacity-60 cursor-pointer"
          >
            <LogIn className="w-5 h-5" />
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        {/* 외부인 신규 가입 차단 안내 (회원가입 링크 제거) */}
        <div className="mt-6 pt-6 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">
            🔒 본 서비스는 개인 전용으로 타인의 신규 회원가입이 차단되어 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
