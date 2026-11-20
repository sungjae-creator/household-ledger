-- ====================================================================
-- 마이그레이션 파일: 009_create_ai_reports_table.sql
-- 설명: AI 가계부 지출 분석 보고서(ai_reports) 테이블 및 RLS 보안 정책 생성
-- ====================================================================

-- 1. AI 분석 보고서 테이블 생성
CREATE TABLE IF NOT EXISTS public.ai_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    year_month VARCHAR(7) NOT NULL, -- 분석 대상 년월 (예: '2026-11')
    score INTEGER NOT NULL DEFAULT 80, -- 가계부 재무 건강 점수 (0~100)
    grade VARCHAR(20) NOT NULL DEFAULT 'B', -- 재무 등급 (A+, A, B+, B, C 등)
    summary TEXT NOT NULL, -- 종합 진단 한줄평
    action_plans JSONB NOT NULL DEFAULT '[]'::jsonb, -- 다음 달 실천 절약 액션 플랜 3가지
    category_insights JSONB NOT NULL DEFAULT '[]'::jsonb, -- 카테고리별 세부 진단 결과
    full_report TEXT, -- 마크다운 또는 종합 보고서 전문
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_user_year_month UNIQUE (user_id, year_month)
);

-- 2. 인덱스 추가 (조회 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_ai_reports_user_month ON public.ai_reports (user_id, year_month);

-- 3. Row Level Security(RLS) 활성화
ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책 정의 (본인 데이터만 조회/추가/수정/삭제 가능)
DROP POLICY IF EXISTS "사용자는 자신의 AI 보고서만 조회할 수 있습니다" ON public.ai_reports;
CREATE POLICY "사용자는 자신의 AI 보고서만 조회할 수 있습니다"
ON public.ai_reports FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 자신의 AI 보고서만 생성할 수 있습니다" ON public.ai_reports;
CREATE POLICY "사용자는 자신의 AI 보고서만 생성할 수 있습니다"
ON public.ai_reports FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 자신의 AI 보고서만 수정할 수 있습니다" ON public.ai_reports;
CREATE POLICY "사용자는 자신의 AI 보고서만 수정할 수 있습니다"
ON public.ai_reports FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 자신의 AI 보고서만 삭제할 수 있습니다" ON public.ai_reports;
CREATE POLICY "사용자는 자신의 AI 보고서만 삭제할 수 있습니다"
ON public.ai_reports FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 5. 권한 부여
GRANT ALL ON TABLE public.ai_reports TO authenticated;
