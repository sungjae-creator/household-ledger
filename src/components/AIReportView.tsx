'use client';

import { useState, useEffect, useCallback } from 'react';
import { AIReport, ActionPlan, CategoryInsight } from '@/types/database';
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Award,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  FileText,
  Key,
  ShieldCheck,
  Coins,
  ArrowRight,
  Info,
} from 'lucide-react';

interface AIReportViewProps {
  currentMonth: string;
  onMonthChange: (month: string) => void;
}

/**
 * AI 스마트 지출 분석 및 맞춤형 재무 보고서 컴포넌트
 *
 * [주요 기능]
 * 1. Google Gemini AI 기반 월별 지출 분석 및 재무 건강 점수 산출
 * 2. Supabase DB 영구 저장 및 캐싱으로 즉각적인 조회 (0.1초 로딩)
 * 3. 소비 패턴 진단 및 다음 달 실천 절약 액션 플랜 TOP 3 제공
 * 4. [최신 내역으로 다시 분석] 기능 지원
 */
export default function AIReportView({
  currentMonth,
  onMonthChange,
}: AIReportViewProps) {
  const [report, setReport] = useState<AIReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Gemini API Key 직접 입력 모달 및 저장 상태 (사용자 편의)
  const [customApiKey, setCustomApiKey] = useState<string>('');
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [inputKey, setInputKey] = useState<string>('');

  // 로컬 스토리지에 저장된 임시 API Key 복원
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key_custom');
    if (savedKey) {
      setCustomApiKey(savedKey);
      setInputKey(savedKey);
    }
  }, []);

  /**
   * 해당 월의 기저장된 AI 보고서 조회 (Supabase DB에서 0.1초 즉시 로딩)
   */
  const loadSavedReport = useCallback(async (month: string) => {
    if (!month) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/ai-report?yearMonth=${month}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '보고서를 불러오지 못했습니다.');
      }

      setReport(data.report || null);
    } catch (err: any) {
      console.warn('보고서 조회 안내:', err.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 월이 변경될 때마다 해당 월의 보고서 불러오기
  useEffect(() => {
    loadSavedReport(currentMonth);
  }, [currentMonth, loadSavedReport]);

  /**
   * 이전 달로 이동
   */
  const handlePrevMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const newMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    onMonthChange(newMonthStr);
  };

  /**
   * 다음 달로 이동
   */
  const handleNextMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const newMonthStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    onMonthChange(newMonthStr);
  };

  /**
   * AI 분석 실행 핸들러 (신규 생성 또는 강제 재분석)
   */
  const handleGenerateReport = async (forceRegenerate: boolean = false) => {
    setAnalyzing(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/ai-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yearMonth: currentMonth,
          forceRegenerate,
          customApiKey: customApiKey || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.needApiKey) {
          setShowApiKeyModal(true);
        }
        throw new Error(data.error || 'AI 분석 생성 중 오류가 발생했습니다.');
      }

      setReport(data.report);
    } catch (err: any) {
      setErrorMessage(err.message || 'AI 분석에 실패했습니다.');
    } finally {
      setAnalyzing(false);
    }
  };

  /**
   * API Key 저장 핸들러
   */
  const handleSaveApiKey = () => {
    if (!inputKey.trim()) {
      alert('API Key를 입력해 주세요.');
      return;
    }
    localStorage.setItem('gemini_api_key_custom', inputKey.trim());
    setCustomApiKey(inputKey.trim());
    setShowApiKeyModal(false);
    alert('Google Gemini API Key가 성공적으로 저장되었습니다. 이제 보고서를 생성해 보세요!');
  };

  const [yearStr, monthStr] = currentMonth ? currentMonth.split('-') : ['', ''];

  // 점수에 따른 테마 색상 계산
  const getScoreTheme = (score: number) => {
    if (score >= 85) return { text: 'text-emerald-600', bg: 'bg-emerald-500', lightBg: 'bg-emerald-50', border: 'border-emerald-200' };
    if (score >= 70) return { text: 'text-blue-600', bg: 'bg-blue-500', lightBg: 'bg-blue-50', border: 'border-blue-200' };
    if (score >= 55) return { text: 'text-amber-600', bg: 'bg-amber-500', lightBg: 'bg-amber-50', border: 'border-amber-200' };
    return { text: 'text-red-600', bg: 'bg-red-500', lightBg: 'bg-red-50', border: 'border-red-200' };
  };

  return (
    <div className="space-y-6">
      {/* 1. 상단 월 선택기 & API 키 설정 바 */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 sm:p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition cursor-pointer"
            title="이전 달"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight">
              {yearStr}년 {monthStr}월
            </h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100">
              <Sparkles className="w-3.5 h-3.5" />
              AI 재무 진단
            </span>
          </div>
          <button
            onClick={handleNextMonth}
            className="p-1.5 sm:p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition cursor-pointer"
            title="다음 달"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {report && (
            <button
              onClick={() => handleGenerateReport(true)}
              disabled={analyzing}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer disabled:opacity-50"
              title="최신 가계부 내역으로 다시 분석"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
              <span>{analyzing ? '재분석 중...' : '최신 내역으로 재분석'}</span>
            </button>
          )}

          <button
            onClick={() => setShowApiKeyModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition text-xs font-medium cursor-pointer"
            title="Gemini API Key 설정"
          >
            <Key className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {customApiKey ? 'API 키 등록됨' : 'API 키 설정'}
            </span>
          </button>
        </div>
      </div>

      {/* 에러 메시지 알림 */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start justify-between gap-3 text-xs text-red-700">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">안내</p>
              <p className="mt-0.5">{errorMessage}</p>
            </div>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-red-600 font-bold"
          >
            닫기
          </button>
        </div>
      )}

      {/* 2. 상태별 화면 렌더링 */}
      {analyzing ? (
        /* (A) AI 분석 진행 중 로딩 화면 */
        <div className="bg-white rounded-2xl p-12 sm:p-16 border border-slate-200 shadow-xs text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 relative">
            <Sparkles className="w-8 h-8 animate-pulse text-indigo-600" />
            <div className="absolute inset-0 rounded-2xl border-2 border-indigo-300 animate-ping opacity-25"></div>
          </div>
          <h3 className="text-lg font-bold text-slate-800">
            Google Gemini AI가 {yearStr}년 {monthStr}월 지출을 분석하고 있습니다
          </h3>
          <p className="text-xs text-slate-500 mt-2 max-w-md">
            소비 패턴 진단, 과소비 영역 탐색, 그리고 다음 달 바로 실천할 수 있는 맞춤형 절약 액션 플랜을 구성하는 중입니다. (약 3~5초 소요)
          </p>
        </div>
      ) : loading ? (
        /* (B) DB 로딩 상태 */
        <div className="bg-white rounded-2xl p-16 text-center text-slate-400 text-xs">
          저장된 AI 보고서를 확인하는 중입니다...
        </div>
      ) : report ? (
        /* (C) 보고서가 존재할 때 (상세 결과 화면) */
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* 1) 상단 재무 건강 종합 평가 배너 */}
          {(() => {
            const theme = getScoreTheme(report.score);
            return (
              <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs overflow-hidden relative">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  {/* 왼쪽: 건강 점수 및 등급 */}
                  <div className="flex items-center gap-5">
                    <div
                      className={`w-20 h-20 sm:w-24 sm:h-24 rounded-2xl ${theme.lightBg} border ${theme.border} flex flex-col items-center justify-center shrink-0 shadow-xs`}
                    >
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        건강 점수
                      </span>
                      <span className={`text-3xl sm:text-4xl font-black ${theme.text} font-mono tracking-tight`}>
                        {report.score}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">100점 만점</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-slate-500 font-semibold">재무 평가 등급</span>
                        <span
                          className={`px-2.5 py-0.5 rounded-lg text-xs font-extrabold border ${theme.border} ${theme.lightBg} ${theme.text}`}
                        >
                          {report.grade}
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight leading-snug">
                        {report.summary}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Supabase에 안전하게 보관 중 (분석 일시: {new Date(report.updated_at).toLocaleDateString()})</span>
                      </div>
                    </div>
                  </div>

                  {/* 오른쪽: 점수 프로그레스 바 */}
                  <div className="w-full md:w-64 bg-slate-50 p-4 rounded-xl border border-slate-100 shrink-0">
                    <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1.5">
                      <span>가계부 종합 점수</span>
                      <span className={theme.text}>{report.score}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${theme.bg} transition-all duration-700 ease-out`}
                        style={{ width: `${Math.min(report.score, 100)}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>개선 필요 (0)</span>
                      <span>보통 (70)</span>
                      <span>우수 (100)</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 2) 다음 달 실천 절약 액션 플랜 TOP 3 */}
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-lg shadow-indigo-100">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/30 text-amber-300 flex items-center justify-center font-bold">
                <Lightbulb className="w-5 h-5 text-amber-300" />
              </div>
              <h3 className="text-lg sm:text-xl font-extrabold tracking-tight">
                다음 달 추천 절약 액션 플랜 TOP 3
              </h3>
            </div>
            <p className="text-xs text-indigo-200 mb-6">
              AI가 분석한 이번 달 소비 내역을 바탕으로, 무리 없이 실천할 수 있는 가장 효과적인 절약 과제입니다.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {report.action_plans && report.action_plans.length > 0 ? (
                report.action_plans.map((plan: ActionPlan, idx: number) => (
                  <div
                    key={idx}
                    className="bg-white/10 hover:bg-white/15 backdrop-blur-md rounded-2xl p-5 border border-white/10 transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="w-6 h-6 rounded-lg bg-amber-400 text-slate-900 font-extrabold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        {plan.target_amount > 0 && (
                          <span className="text-xs font-bold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-400/30">
                            +{plan.target_amount.toLocaleString()}원 절약
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-sm text-white mb-2 leading-snug">
                        {plan.title}
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {plan.tip}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-1.5 text-[11px] text-amber-300 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>실천 목표 설정 권장</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-3 text-center text-xs text-slate-400 py-4">
                  실천 액션 플랜 정보가 없습니다.
                </div>
              )}
            </div>
          </div>

          {/* 3) 카테고리별 세부 진단 결과 */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs">
            <h3 className="text-base sm:text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <span>주요 카테고리별 소비 진단</span>
            </h3>
            <p className="text-xs text-slate-500 mb-5">
              각 지출 분류의 적정성을 평가하고 주의해야 할 항목과 잘 관리된 항목을 구분하였습니다.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {report.category_insights && report.category_insights.length > 0 ? (
                report.category_insights.map((item: CategoryInsight, idx: number) => {
                  const isWarning = item.status === 'WARNING';
                  const isGood = item.status === 'GOOD';

                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border flex items-start gap-3 transition ${
                        isWarning
                          ? 'bg-red-50/50 border-red-200'
                          : isGood
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isWarning
                            ? 'bg-red-100 text-red-600'
                            : isGood
                            ? 'bg-emerald-100 text-emerald-600'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isWarning ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : isGood ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <Info className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h4 className="font-bold text-slate-800 text-sm">
                            {item.category}
                          </h4>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                              isWarning
                                ? 'bg-red-100 text-red-700 border-red-200'
                                : isGood
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                : 'bg-slate-200 text-slate-700 border-slate-300'
                            }`}
                          >
                            {isWarning ? '과소비 주의' : isGood ? '절약 우수' : '적정 유지'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {item.comment}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-2 text-center text-xs text-slate-400 py-4">
                  세부 카테고리 진단 정보가 없습니다.
                </div>
              )}
            </div>
          </div>

          {/* 4) AI 상세 분석 전문 (마크다운 뷰어) */}
          {report.full_report && (
            <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs">
              <h3 className="text-base sm:text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <span>AI 재무 코칭 종합 리포트 전문</span>
              </h3>
              <div className="p-5 bg-slate-50/70 rounded-xl border border-slate-100 text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                {report.full_report}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* (D) 아직 보고서가 생성되지 않은 상태 (생성 안내 카드) */
        <div className="bg-white rounded-2xl p-8 sm:p-14 border border-slate-200 shadow-xs text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center mb-4 shadow-lg shadow-indigo-100">
            <Sparkles className="w-8 h-8" />
          </div>

          <h3 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight">
            {yearStr}년 {monthStr}월 AI 지출 분석 보고서
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-md leading-relaxed">
            한 달 동안의 지출과 수입을 Google Gemini AI가 면밀히 분석하여, <strong>가계부 건강 점수</strong>와 <strong>다음 달 절약 액션 플랜 3가지</strong>를 도출해 드립니다.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={() => handleGenerateReport(false)}
              disabled={analyzing}
              className="flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-200 transition cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>지금 AI 분석 보고서 생성하기</span>
            </button>

            {!customApiKey && (
              <button
                onClick={() => setShowApiKeyModal(true)}
                className="flex items-center justify-center gap-1.5 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs rounded-xl transition cursor-pointer"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Gemini API Key 등록</span>
              </button>
            )}
          </div>

          <div className="mt-6 flex items-center gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              개인정보 완벽 보호 (익명화 통계만 전달)
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              Supabase 영구 저장
            </span>
          </div>
        </div>
      )}

      {/* 3. Gemini API Key 등록 팝업 모달 */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Key className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-800">Google Gemini API Key 설정</h3>
              </div>
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Google Gemini API를 무료로 사용하기 위한 API Key를 입력해 주세요. 입력하신 키는 본인 브라우저에 안전하게 보관됩니다.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-500 leading-normal">
                💡 <strong>API Key가 없으신가요?</strong>
                <br />
                Google AI Studio(aistudio.google.com)에서 구글 계정으로 로그인 후 <strong>[Get API key]</strong> 버튼을 누르면 무료로 즉시 발급받으실 수 있습니다.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowApiKeyModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer"
                >
                  저장하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
