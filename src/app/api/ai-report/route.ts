import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ActionPlan, CategoryInsight } from '@/types/database';

/**
 * AI 가계부 지출 분석 보고서 API Route
 *
 * GET: 특정 월의 기저장된 AI 보고서 조회
 * POST: 해당 월 거래 데이터를 기반으로 Gemini AI 분석 실행 및 Supabase 저장
 */

// 1. 저장된 AI 보고서 조회 (GET)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const yearMonth = searchParams.get('yearMonth');

    if (!yearMonth) {
      return NextResponse.json({ error: '조회할 년월(yearMonth)이 필요합니다.' }, { status: 400 });
    }

    const { data: report, error: fetchErr } = await supabase
      .from('ai_reports')
      .select('*')
      .eq('user_id', user.id)
      .eq('year_month', yearMonth)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    return NextResponse.json({ report });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// 2. AI 분석 실행 및 DB 저장 (POST)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { yearMonth, forceRegenerate, customApiKey } = body;

    if (!yearMonth) {
      return NextResponse.json({ error: '분석할 년월(yearMonth) 정보가 누락되었습니다.' }, { status: 400 });
    }

    // 이미 저장된 보고서가 있고 강제 재생성이 아닌 경우 DB 데이터 즉시 반환 (비용/시간 절약)
    if (!forceRegenerate) {
      const { data: existingReport } = await supabase
        .from('ai_reports')
        .select('*')
        .eq('user_id', user.id)
        .eq('year_month', yearMonth)
        .maybeSingle();

      if (existingReport) {
        return NextResponse.json({ report: existingReport, fromCache: true });
      }
    }

    // 1) 해당 월의 거래내역 가져오기
    const startDate = `${yearMonth}-01`;
    const endDate = `${yearMonth}-31`;

    const { data: transactions, error: txErr } = await supabase
      .from('transactions')
      .select(`
        *,
        category:categories(*)
      `)
      .eq('user_id', user.id)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .eq('exclude_from_stats', false)
      .order('transaction_date', { ascending: true });

    if (txErr) {
      return NextResponse.json({ error: `거래내역 조회 실패: ${txErr.message}` }, { status: 500 });
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json(
        { error: `${yearMonth}월에 등록된 지출/수입 거래 내역이 없어 분석할 수 없습니다. 먼저 거래를 등록해 주세요.` },
        { status: 400 }
      );
    }

    // 2) AI에게 전달할 익명화된 통계 요약 데이터 집계
    let totalIncome = 0;
    let totalExpense = 0;
    const categoryExpenseMap: { [cat: string]: number } = {};
    const merchantExpenseMap: { [merchant: string]: number } = {};

    transactions.forEach((tx) => {
      const amt = Number(tx.amount || 0);
      if (tx.type === 'INCOME') {
        totalIncome += amt;
      } else if (tx.type === 'EXPENSE') {
        totalExpense += amt;

        // 카테고리별 합산
        const catName = tx.category
          ? `${tx.category.major_name} > ${tx.category.sub_name}`
          : '기타';
        categoryExpenseMap[catName] = (categoryExpenseMap[catName] || 0) + amt;

        // 주요 사용처별 합산
        const desc = (tx.description || '미지정').trim();
        merchantExpenseMap[desc] = (merchantExpenseMap[desc] || 0) + amt;
      }
    });

    // 상위 5대 카테고리
    const topCategories = Object.entries(categoryExpenseMap)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: totalExpense > 0 ? ((amount / totalExpense) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // 상위 5대 사용처
    const topMerchants = Object.entries(merchantExpenseMap)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: totalExpense > 0 ? ((amount / totalExpense) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const savingsRate =
      totalIncome > 0
        ? (((totalIncome - totalExpense) / totalIncome) * 100).toFixed(1)
        : '0';

    // 3) Google Gemini API Key 확인
    const apiKey = customApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'Google Gemini API Key가 설정되지 않았습니다. 서버 환경변수(GEMINI_API_KEY)에 등록하거나 모달에서 직접 입력해 주세요.',
          needApiKey: true,
        },
        { status: 400 }
      );
    }

    // 4) Gemini AI 분석 프롬프트 작성
    const systemInstruction = `당신은 대한민국 최고의 공인 재무설계사이자 친절하고 따뜻한 AI 가계부 재무 코치입니다.
사용자가 제공한 한 달간의 수입 및 지출 통계 데이터를 정밀 분석하여, 소비 습관을 개선하고 저축을 늘릴 수 있는 현실적이고 통찰력 있는 보고서를 작성해 주세요.
반드시 아래 정의된 순수 JSON 포맷으로만 응답해야 하며, 마크다운 코드블록(\`\`\`json) 기호 없이 유효한 JSON 문자열만 출력해 주세요.`;

    const userPrompt = `
[분석 대상 월: ${yearMonth}]
- 총 수입: ${totalIncome.toLocaleString()}원
- 총 지출: ${totalExpense.toLocaleString()}원
- 순 저축액: ${(totalIncome - totalExpense).toLocaleString()}원 (저축률: ${savingsRate}%)
- 거래 건수: 총 ${transactions.length}건

[지출 상위 카테고리]
${topCategories.map((c, i) => `${i + 1}. ${c.name}: ${c.amount.toLocaleString()}원 (${c.percentage}%)`).join('\n')}

[지출 상위 주요 사용처]
${topMerchants.map((m, i) => `${i + 1}. ${m.name}: ${m.amount.toLocaleString()}원 (${m.percentage}%)`).join('\n')}

위 통계를 바탕으로 다음 JSON 구조에 맞춰 한국어로 분석 결과를 작성해 주세요:
{
  "score": 85 (0~100점 사이의 가계부 재무 건강 점수, 정수),
  "grade": "A등급" (A+, A, B+, B, C, D 등),
  "summary": "총평 한줄 요약 (따뜻하고 격려하는 어조로 2~3문장)",
  "category_insights": [
    {
      "category": "카테고리명",
      "status": "WARNING" | "GOOD" | "NORMAL",
      "comment": "해당 항목에 대한 진단 및 조언 (1~2문장)"
    }
  ],
  "action_plans": [
    {
      "title": "구체적인 실천 과제 제목 (예: 커피/음료 소비 주 2회 줄이기)",
      "target_amount": 50000 (해당 실천으로 다음 달 아낄 수 있는 현실적인 예상 금액, 숫자),
      "tip": "구체적인 실천 팁과 방법 (친절한 설명)"
    }
  ],
  "full_report": "마크다운 형식의 상세 분석 전문 (가계부 총평, 긍정적인 부분 칭찬, 과소비 주의 구간, 다음 달 권장 목표를 정돈된 마크다운으로 작성)"
}
`;

    // 5) Google Gemini API 호출 (최신 gemini-2.5-flash 모델 우선 시도, 실패 시 1.5-flash 폴백)
    const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash'];
    let aiResponseText = '';
    let callError = null;

    for (const modelName of modelsToTry) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }],
                },
              ],
              generationConfig: {
                temperature: 0.7,
                responseMimeType: 'application/json',
              },
            }),
          }
        );

        if (response.ok) {
          const resData = await response.json();
          aiResponseText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (aiResponseText) break;
        } else {
          const errData = await response.json();
          callError = errData.error?.message || response.statusText;
        }
      } catch (err: any) {
        callError = err.message;
      }
    }

    if (!aiResponseText) {
      throw new Error(`Gemini AI 분석 호출 실패: ${callError || '알 수 없는 오류'}`);
    }

    // 6) AI 응답 JSON 파싱
    let parsedAI: {
      score: number;
      grade: string;
      summary: string;
      category_insights: CategoryInsight[];
      action_plans: ActionPlan[];
      full_report: string;
    };

    try {
      const cleanJsonStr = aiResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedAI = JSON.parse(cleanJsonStr);
    } catch (parseErr) {
      throw new Error('AI 응답을 JSON 형식으로 해석하는 데 실패했습니다.');
    }

    // 7) Supabase ai_reports 테이블에 upsert (저장 또는 갱신)
    const reportPayload = {
      user_id: user.id,
      year_month: yearMonth,
      score: typeof parsedAI.score === 'number' ? parsedAI.score : 80,
      grade: parsedAI.grade || 'B',
      summary: parsedAI.summary || '지출 분석이 완료되었습니다.',
      action_plans: parsedAI.action_plans || [],
      category_insights: parsedAI.category_insights || [],
      full_report: parsedAI.full_report || '',
      updated_at: new Date().toISOString(),
    };

    const { data: savedReport, error: saveErr } = await supabase
      .from('ai_reports')
      .upsert(reportPayload, { onConflict: 'user_id,year_month' })
      .select()
      .single();

    if (saveErr) {
      console.warn('DB 저장 에러:', saveErr.message);
      // DB 저장이 실패하더라도 생성된 리포트 자체는 반환
      return NextResponse.json({ report: { ...reportPayload, id: 'temp' }, fromCache: false });
    }

    return NextResponse.json({ report: savedReport, fromCache: false });
  } catch (err: any) {
    console.error('AI Report API Error:', err);
    return NextResponse.json({ error: err.message || 'AI 분석 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
