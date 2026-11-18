'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Wallet, UserPlus, Lock, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * 회원가입 페이지 컴포넌트
 * 이메일과 비밀번호로 신규 계정을 생성합니다.
 * 가입 완료 시 Supabase 트리거(003_default_seed_trigger.sql)가 동작하여
 * 네이버 가계부 표준 카테고리 30여 개와 결제수단이 자동 생성됩니다.
 */
export default function SignUpPage() {
  const router = useRouter();
  const supabase = createClient();

  // 입력 폼 상태 관리
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  // 진행 상태 및 메시지
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  /**
   * 회원가입 폼 제출 핸들러
   */
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    // 1. 비밀번호 일치 확인
    if (password !== passwordConfirm) {
      setErrorMessage('비밀번호가 일치하지 않습니다. 다시 확인해 주세요.');
      setLoading(false);
      return;
    }

    // 2. 비밀번호 최소 길이 확인
    if (password.length < 6) {
      setErrorMessage('비밀번호는 최소 6자 이상이어야 합니다.');
      setLoading(false);
      return;
    }

    try {
      // Supabase 회원가입 API 호출
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('already registered')) {
          setErrorMessage('이미 가입된 이메일 주소입니다. 로그인해 주세요.');
        } else {
          setErrorMessage(`회원가입 실패: ${error.message}`);
        }
        return;
      }

      // Supabase 설정에 따라 세션이 즉시 생성되거나 인증 메일이 발송됩니다.
      if (data.session) {
        setSuccessMessage('회원가입이 완료되었습니다! 잠시 후 가계부로 이동합니다.');
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 1500);
      } else {
        setSuccessMessage(
          '회원가입 요청이 완료되었습니다! 가입하신 이메일의 받은편지함을 확인하여 인증 링크를 클릭해 주세요.'
        );
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
          <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 mb-3">
            <Wallet className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">새 계정 만들기</h1>
          <p className="text-sm text-slate-500 mt-1">
            가입 즉시 네이버 가계부 기본 카테고리가 자동 세팅됩니다
          </p>
        </div>

        {/* 오류 알림창 */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>{errorMessage}</div>
          </div>
        )}

        {/* 성공 알림창 */}
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-emerald-700 text-sm">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>{successMessage}</div>
          </div>
        )}

        {/* 회원가입 입력 폼 */}
        <form onSubmit={handleSignUp} className="space-y-4">
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
                placeholder="example@email.com"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              비밀번호 (6자리 이상)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              비밀번호 확인
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="비밀번호를 다시 한 번 입력하세요"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl shadow-md shadow-emerald-200 flex items-center justify-center gap-2 transition disabled:opacity-60 cursor-pointer"
          >
            <UserPlus className="w-5 h-5" />
            {loading ? '계정 생성 중...' : '회원가입 완료'}
          </button>
        </form>

        {/* 기존 회원 로그인 링크 */}
        <div className="mt-6 pt-6 border-t border-slate-100 text-center">
          <p className="text-sm text-slate-600">
            이미 계정이 있으신가요?{' '}
            <Link
              href="/login"
              className="text-emerald-600 hover:text-emerald-700 font-semibold ml-1 underline underline-offset-4"
            >
              로그인하기
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
