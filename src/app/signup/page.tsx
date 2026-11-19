'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Wallet, ShieldAlert, ArrowLeft } from 'lucide-react';

/**
 * 회원가입 차단 페이지
 * (개인 전용 시스템이므로 외부인의 신규 가입을 차단하고 로그인 화면으로 유도합니다.)
 */
export default function SignUpPage() {
  const router = useRouter();

  // 3초 후 자동으로 로그인 페이지로 리다이렉트
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/login');
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center">
        <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <h1 className="text-xl font-bold text-slate-800">신규 회원가입 제한</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          본 가계부는 개인 전용 비공개 시스템으로 운영되고 있어 신규 회원가입을 받지 않습니다.
        </p>

        <p className="text-xs text-slate-400 mt-4">
          3초 후 로그인 화면으로 자동 이동합니다...
        </p>

        <div className="mt-6 pt-6 border-t border-slate-100">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>로그인 화면으로 이동</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
