'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import { Category, PaymentMethod } from '@/types/database';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Download,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';

interface ExcelImportProps {
  categories: Category[];
  paymentMethods: PaymentMethod[];
  onSuccess: () => void;
}

/**
 * 네이버 가계부(지출 & 수입) 완벽 호환 엑셀(XLSX/CSV) 가져오기 & 내보내기 컴포넌트
 *
 * [주요 해결 사항]
 * 1. 네이버 수입 엑셀 판별 강화: 상단 시트 제목("수입 현황"), 파일명, '입금통장' 컬럼 유무를 지능적으로 분석하여 수입(INCOME)으로 정확히 판별
 * 2. 입금 자산 잔액 자동 동기화: 엑셀로 수입/지출을 가져올 때 해당 계좌(하나저축은행 등)의 잔액(balance)을 실시간으로 자동 증가/차감 반영
 */
export default function ExcelImportModal({
  categories,
  paymentMethods,
  onSuccess,
}: ExcelImportProps) {
  const supabase = createClient();

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);

  /**
   * 네이버 가계부(수입/지출) 및 표준 엑셀 시트 2차원 배열을 정제된 거래 데이터 객체 배열로 변환하는 정밀 파서
   */
  const parseRowsFromSheet = (rawRows: any[][], fileName: string = ''): any[] => {
    if (!rawRows || rawRows.length === 0) return [];

    // 0. 시트 상단 타이틀 또는 파일명을 통한 전체 문서 성격(수입 vs 지출) 사전 파악
    let isSheetIncomeTitle = false;
    for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
      const rowStr = (rawRows[i] || []).map((cell) => String(cell || '').trim()).join(' ');
      if (rowStr.includes('수입 현황') || rowStr.includes('수입현황') || rowStr.includes('수입 내역') || rowStr.includes('수입내역')) {
        isSheetIncomeTitle = true;
        break;
      }
    }
    const isFileNameIncome = fileName.includes('수입');

    // 1. 실제 헤더 행 탐색 ('날짜', '일자', '거래일시'가 포함된 행 찾기)
    let headerIndex = -1;
    for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
      const row = rawRows[i];
      if (Array.isArray(row)) {
        const hasDateHeader = row.some((cell) => {
          const str = String(cell).trim();
          return str === '날짜' || str === '일자' || str === '거래일시';
        });
        if (hasDateHeader) {
          headerIndex = i;
          break;
        }
      }
    }

    if (headerIndex === -1) {
      headerIndex = 0;
    }

    // 헤더 정규화 (공백 제거)
    const rawHeaders = rawRows[headerIndex] || [];
    const headers = rawHeaders.map((h) => String(h || '').trim());
    const dataRows = rawRows.slice(headerIndex + 1);

    // 헤더 컬럼 내에 수입 관련 항목('입금통장', '입금계좌', '수입', '수입금액', '입금액', '수입처')이 있는지 확인
    const hasIncomeColumnInHeader = headers.some((h) => {
      const cleanH = h.replace(/\s+/g, '');
      return (
        cleanH.includes('입금통장') ||
        cleanH.includes('입금계좌') ||
        cleanH.includes('수입금액') ||
        cleanH.includes('수입액') ||
        cleanH === '수입' ||
        cleanH.includes('입금처') ||
        cleanH.includes('수입처')
      );
    });

    const parsedResults: any[] = [];

    dataRows.forEach((row) => {
      if (!Array.isArray(row) || row.length === 0) return;

      // 행 데이터를 헤더 기준 객체로 매핑 (공백 제거 키도 함께 매핑하여 안전성 강화)
      const rowObj: { [key: string]: any } = {};
      headers.forEach((h, idx) => {
        if (h) {
          const val = row[idx] !== undefined ? row[idx] : '';
          rowObj[h] = val;
          rowObj[h.replace(/\s+/g, '')] = val; // 공백 제거 버전도 동시 등록
        }
      });

      // 1) 날짜 확인 및 요약 행 필터링
      const rawDateStr = String(
        rowObj['날짜'] || rowObj['일자'] || rowObj['거래일자'] || rowObj['거래일시'] || ''
      ).trim();
      if (!rawDateStr) return; // 날짜 없는 빈 행 무시

      // '합계', '카드대금', '*' 등의 통계/소계 요약 행 건너뛰기
      const usagePlace = String(
        rowObj['사용처'] || rowObj['입금처'] || rowObj['수입처'] || rowObj['가맹점'] || rowObj['내역'] || ''
      ).trim();

      if (
        rawDateStr.includes('합계') ||
        rawDateStr.includes('*') ||
        rawDateStr.includes('소계') ||
        usagePlace.includes('합계') ||
        usagePlace.includes('소계')
      ) {
        return;
      }

      // 2) 날짜 표준 포맷 (YYYY-MM-DD) 변환
      let formattedDate = rawDateStr;
      const koreanDateMatch = rawDateStr.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
      if (koreanDateMatch) {
        const year = koreanDateMatch[1];
        const month = koreanDateMatch[2].padStart(2, '0');
        const day = koreanDateMatch[3].padStart(2, '0');
        formattedDate = `${year}-${month}-${day}`;
      } else {
        formattedDate = rawDateStr.replace(/\./g, '-').replace(/\//g, '-');
        if (formattedDate.length === 8 && !formattedDate.includes('-')) {
          formattedDate = `${formattedDate.slice(0, 4)}-${formattedDate.slice(4, 6)}-${formattedDate.slice(6, 8)}`;
        }
      }

      // 3) 카테고리 대분류/소분류 분리 (네이버 가계부 '식비>부식', '주수입>급여' 등)
      let major = '기타';
      let sub = '기타';

      const combinedCategory = String(rowObj['분류'] || '').trim();
      if (combinedCategory.includes('>')) {
        const parts = combinedCategory.split('>');
        major = parts[0].trim();
        sub = parts[1].trim();
      } else {
        major = String(rowObj['대분류'] || rowObj['대분류명'] || combinedCategory || '기타').trim();
        sub = String(rowObj['소분류'] || rowObj['소분류명'] || '기타').trim();
      }

      // 4) 수입 vs 지출 지능형 정밀 판별
      const explicitType = String(rowObj['수입지출구분'] || rowObj['구분'] || '').trim();

      const cardVal = parseFloat(String(rowObj['카드'] || 0).replace(/,/g, ''));
      const cashVal = parseFloat(String(rowObj['현금'] || 0).replace(/,/g, ''));
      const incomeVal = parseFloat(
        String(rowObj['수입'] || rowObj['수입금액'] || rowObj['입금액'] || rowObj['입금'] || 0).replace(/,/g, '')
      );
      const genericAmountVal = parseFloat(String(rowObj['금액'] || 0).replace(/,/g, ''));
      const expenseVal = parseFloat(String(rowObj['지출'] || rowObj['지출금액'] || 0).replace(/,/g, ''));

      // 카테고리 이름으로 수입 추론
      const isIncomeCategory =
        major.includes('수입') ||
        major.includes('급여') ||
        major.includes('월급') ||
        major.includes('이자') ||
        major.includes('배당') ||
        major.includes('연금') ||
        major.includes('상여') ||
        major.includes('보너스') ||
        major.includes('환급');

      // 종합 수입 여부 판정
      let isIncome = false;
      if (explicitType === '수입') {
        isIncome = true;
      } else if (explicitType === '지출') {
        isIncome = false;
      } else if (
        isSheetIncomeTitle ||
        isFileNameIncome ||
        hasIncomeColumnInHeader ||
        incomeVal > 0 ||
        isIncomeCategory
      ) {
        // 지출 파일의 결정적 증거(카드 금액 존재 또는 출금통장/카드분류 컬럼 존재)가 없으면 수입으로 확정
        const hasExpenseProof = cardVal > 0 || expenseVal > 0 || '카드분류' in rowObj || '출금통장' in rowObj;
        if (!hasExpenseProof || isSheetIncomeTitle || isFileNameIncome) {
          isIncome = true;
        } else {
          isIncome = false;
        }
      }

      let amount = 0;
      let paymentName = '현금';
      let paymentType: 'CARD' | 'BANK' | 'CASH' = 'CASH';

      // (A) 수입(INCOME) 데이터인 경우
      if (isIncome) {
        amount = incomeVal > 0 ? incomeVal : (genericAmountVal > 0 ? genericAmountVal : cashVal);

        // 네이버 가계부 수입 엑셀의 입금 자산 매핑
        const bankName = String(
          rowObj['입금통장'] ||
          rowObj['입금계좌'] ||
          rowObj['결제수단'] ||
          rowObj['자산'] ||
          rowObj['출금통장'] ||
          '주거래 은행'
        ).trim() || '주거래 은행';

        paymentName = bankName;
        // 은행, 통장, 저축, 금고 등이 포함되면 계좌(BANK)로 지정
        paymentType =
          bankName.includes('통장') ||
          bankName.includes('은행') ||
          bankName.includes('저축') ||
          bankName.includes('페이') ||
          bankName.includes('증권')
            ? 'BANK'
            : 'CASH';
      }
      // (B) 지출(EXPENSE) 데이터인 경우
      else {
        if (cardVal > 0) {
          amount = cardVal;
          paymentName = String(rowObj['카드분류'] || '신용카드').trim() || '신용카드';
          paymentType = 'CARD';
        } else if (cashVal > 0) {
          amount = cashVal;
          const bankOrCash = String(rowObj['출금통장'] || '현금').trim() || '현금';
          paymentName = bankOrCash;
          paymentType =
            bankOrCash.includes('통장') ||
            bankOrCash.includes('은행') ||
            bankOrCash.includes('저축') ||
            bankOrCash.includes('페이') ||
            bankOrCash.includes('증권')
              ? 'BANK'
              : 'CASH';
        } else if (expenseVal > 0) {
          amount = expenseVal;
          paymentName = String(rowObj['결제수단'] || rowObj['자산'] || '현금').trim() || '현금';
          paymentType = paymentName.includes('카드')
            ? 'CARD'
            : paymentName.includes('통장') ||
              paymentName.includes('은행') ||
              paymentName.includes('저축')
            ? 'BANK'
            : 'CASH';
        } else if (genericAmountVal > 0) {
          amount = genericAmountVal;
          paymentName = String(rowObj['결제수단'] || rowObj['자산'] || '현금').trim() || '현금';
          paymentType = paymentName.includes('카드')
            ? 'CARD'
            : paymentName.includes('통장') ||
              paymentName.includes('은행') ||
              paymentName.includes('저축')
            ? 'BANK'
            : 'CASH';
        }
      }

      if (amount <= 0) return; // 유효 금액이 없는 행 제외

      // 5) 사용처 / 입금처 및 메모
      const description = String(
        rowObj['입금처'] ||
        rowObj['수입처'] ||
        rowObj['사용처'] ||
        rowObj['가맹점'] ||
        rowObj['내용'] ||
        rowObj['내역'] ||
        (isIncome ? '수입' : '지출')
      ).trim();
      const memo = String(rowObj['사용내역'] || rowObj['메모'] || rowObj['비고'] || '').trim();

      parsedResults.push({
        date: formattedDate,
        isIncome,
        amount,
        major,
        sub,
        paymentName,
        paymentType,
        description,
        memo,
      });
    });

    return parsedResults;
  };

  /**
   * 파일 선택 핸들러
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setStatusMessage(null);
      setErrorMessage(null);

      // 파일 미리보기 파싱
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          const parsed = parseRowsFromSheet(rawRows, selectedFile.name);
          setPreviewData(parsed.slice(0, 10)); // 상위 10건 미리보기
        } catch (err: unknown) {
          if (err instanceof Error) {
            setErrorMessage(`파일을 읽는 중 오류가 발생했습니다: ${err.message}`);
          } else {
            setErrorMessage('파일을 읽는 중 오류가 발생했습니다.');
          }
        }
      };
      reader.readAsBinaryString(selectedFile);
    }
  };

  /**
   * 엑셀 파싱 및 Supabase 일괄 등록 핸들러 (계좌 잔액 자동 증감 반영)
   */
  const handleImport = async () => {
    if (!file) {
      setErrorMessage('업로드할 엑셀 파일을 먼저 선택해 주세요.');
      return;
    }

    setLoading(true);
    setStatusMessage('파일을 분석하고 있습니다...');
    setErrorMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('로그인이 필요합니다.');
      }

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

          const parsedItems = parseRowsFromSheet(rawRows, file.name);

          if (parsedItems.length === 0) {
            throw new Error('가져올 유효한 거래 내역 데이터가 없습니다.');
          }

          setStatusMessage(`총 ${parsedItems.length}건의 데이터를 확인했습니다. 카테고리와 자산 계좌를 준비 중...`);

          // 1. 카테고리 및 결제수단 맵 구성 (기존 + 엑셀에서 새로 발견된 것 자동 생성)
          const categoryMap = new Map<string, string>();
          categories.forEach((c) => {
            categoryMap.set(`${c.type}_${c.major_name}_${c.sub_name}`, c.id);
          });

          // 결제수단 정보 맵 (ID와 타입, 잔액 추적용)
          const paymentMap = new Map<string, string>();
          const paymentInfoMap = new Map<string, { id: string; type: string; balance: number }>();
          paymentMethods.forEach((p) => {
            paymentMap.set(p.name, p.id);
            paymentInfoMap.set(p.name, { id: p.id, type: p.type, balance: Number(p.balance || 0) });
          });

          const newCategoriesToInsert: {
            user_id: string;
            type: 'INCOME' | 'EXPENSE';
            major_name: string;
            sub_name: string;
            color: string;
            sort_order: number;
          }[] = [];

          const newPaymentsToInsert: {
            user_id: string;
            name: string;
            type: 'CARD' | 'BANK' | 'CASH' | 'ETC';
            balance: number;
            sort_order: number;
          }[] = [];

          const seenNewCats = new Set<string>();
          const seenNewPayments = new Set<string>();

          parsedItems.forEach((item) => {
            const itemType = item.isIncome ? 'INCOME' : 'EXPENSE';
            const catKey = `${itemType}_${item.major}_${item.sub}`;

            if (!categoryMap.has(catKey) && !seenNewCats.has(catKey)) {
              seenNewCats.add(catKey);
              newCategoriesToInsert.push({
                user_id: user.id,
                type: itemType,
                major_name: item.major,
                sub_name: item.sub,
                color: item.isIncome ? '#10B981' : '#EF4444',
                sort_order: item.isIncome ? 50 : 20,
              });
            }

            if (!paymentMap.has(item.paymentName) && !seenNewPayments.has(item.paymentName)) {
              seenNewPayments.add(item.paymentName);
              newPaymentsToInsert.push({
                user_id: user.id,
                name: item.paymentName,
                type: item.paymentType,
                balance: 0,
                sort_order: 10,
              });
            }
          });

          // 신규 카테고리 DB 삽입
          if (newCategoriesToInsert.length > 0) {
            const { data: insertedCats, error: catErr } = await supabase
              .from('categories')
              .insert(newCategoriesToInsert)
              .select();
            if (catErr) {
              console.warn('카테고리 생성 안내:', catErr.message);
            }
            if (insertedCats) {
              insertedCats.forEach((c: Category) => {
                categoryMap.set(`${c.type}_${c.major_name}_${c.sub_name}`, c.id);
              });
            }
          }

          // 신규 결제수단 DB 삽입
          if (newPaymentsToInsert.length > 0) {
            const { data: insertedPays, error: payErr } = await supabase
              .from('payment_methods')
              .insert(newPaymentsToInsert)
              .select();
            if (payErr) {
              console.warn('결제수단 생성 안내:', payErr.message);
            }
            if (insertedPays) {
              insertedPays.forEach((p: PaymentMethod) => {
                paymentMap.set(p.name, p.id);
                paymentInfoMap.set(p.name, { id: p.id, type: p.type, balance: Number(p.balance || 0) });
              });
            }
          }

          setStatusMessage('거래 내역 데이터를 가계부에 등록하는 중...');

          // 2. 거래내역 일괄 삽입 구성 및 계좌별 잔액 변동 계산
          // balanceDeltas: 결제수단 ID별 최종 증감액 (수입은 +, 계좌/현금 지출은 -)
          const balanceDeltas = new Map<string, number>();

          const transactionsToInsert = parsedItems.map((item) => {
            const itemType = item.isIncome ? 'INCOME' : 'EXPENSE';
            const pmId = paymentMap.get(item.paymentName) || null;

            // 계좌 잔액 증감 계산
            if (pmId) {
              const pmInfo = paymentInfoMap.get(item.paymentName);
              // 순수 자산(은행 계좌, 현금)에 대해서만 잔액 반영 (신용카드는 잔액 차감 없음)
              if (pmInfo && (pmInfo.type === 'BANK' || pmInfo.type === 'CASH')) {
                const currentDelta = balanceDeltas.get(pmId) || 0;
                if (item.isIncome) {
                  balanceDeltas.set(pmId, currentDelta + item.amount); // 수입: 잔액 증가(+)
                } else {
                  balanceDeltas.set(pmId, currentDelta - item.amount); // 지출: 잔액 차감(-)
                }
              }
            }

            return {
              user_id: user.id,
              transaction_date: item.date,
              type: itemType,
              amount: item.amount,
              category_id: categoryMap.get(`${itemType}_${item.major}_${item.sub}`) || null,
              payment_method_id: pmId,
              description: item.description,
              memo: item.memo || null,
              exclude_from_stats: false,
            };
          });

          // 100개씩 청크로 나누어 배치 저장
          const chunkSize = 100;
          for (let i = 0; i < transactionsToInsert.length; i += chunkSize) {
            const chunk = transactionsToInsert.slice(i, i + chunkSize);
            const { error: insertErr } = await supabase.from('transactions').insert(chunk);
            if (insertErr) throw insertErr;
          }

          // 3. 입금/출금 자산 계좌 잔액(balance) 일괄 업데이트 반영
          setStatusMessage('자산 계좌 잔액을 동기화하는 중...');
          for (const [pmId, delta] of balanceDeltas.entries()) {
            if (delta === 0) continue;
            // 현재 DB의 최신 잔액 조회 후 안전하게 업데이트
            const { data: currentPmData } = await supabase
              .from('payment_methods')
              .select('balance')
              .eq('id', pmId)
              .single();

            const existingBal = currentPmData ? Number(currentPmData.balance || 0) : 0;
            const updatedBalance = existingBal + delta;

            await supabase
              .from('payment_methods')
              .update({ balance: updatedBalance })
              .eq('id', pmId);
          }

          const incomeCount = parsedItems.filter((p) => p.isIncome).length;
          const expenseCount = parsedItems.length - incomeCount;

          setStatusMessage(
            `성공적으로 가계부 내역 총 ${transactionsToInsert.length}건(수입 ${incomeCount}건, 지출 ${expenseCount}건)을 가져오고 자산 잔액도 정상 반영되었습니다!`
          );
          setFile(null);
          setPreviewData([]);
          onSuccess();
        } catch (err: unknown) {
          if (err instanceof Error) {
            setErrorMessage(`데이터 저장 실패: ${err.message}`);
          } else {
            setErrorMessage('데이터 저장 중 오류가 발생했습니다.');
          }
        } finally {
          setLoading(false);
        }
      };
      reader.readAsBinaryString(file);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('오류가 발생했습니다.');
      }
      setLoading(false);
    }
  };

  /**
   * 가계부 샘플 엑셀 양식 다운로드
   */
  const handleDownloadSample = () => {
    const sampleRows = [
      {
        날짜: '2026-11-18',
        수입지출구분: '수입',
        대분류: '주수입',
        소분류: '급여',
        결제수단: '하나저축은행',
        사용처: '회사',
        금액: 3500000,
        메모: '11월 급여 입금',
      },
      {
        날짜: '2026-11-18',
        수입지출구분: '지출',
        대분류: '식비',
        소분류: '외식',
        결제수단: '춘식이모바일로카',
        사용처: '맛있는 식당',
        금액: 35000,
        메모: '가족 외식',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '가계부양식');
    XLSX.writeFile(wb, '가계부_업로드_양식.xlsx');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              네이버 가계부 / 엑셀 데이터 가져오기 (Import)
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              네이버 가계부에서 다운받은 <strong>지출현황</strong> 및 <strong>수입현황</strong> 엑셀/CSV 파일을 그대로 올리시면 자동으로 판별하여 등록합니다.
            </p>
          </div>

          <button
            onClick={handleDownloadSample}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer self-start sm:self-auto"
          >
            <Download className="w-4 h-4" />
            <span>표준 양식 다운로드</span>
          </button>
        </div>

        {/* 알림 메시지 */}
        {statusMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl flex items-center gap-3 text-sm">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <div className="font-semibold">{statusMessage}</div>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div className="font-semibold">{errorMessage}</div>
          </div>
        )}

        {/* 파일 업로드 드롭존 */}
        <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-8 text-center transition bg-slate-50/50">
          <input
            type="file"
            id="excelFile"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <label htmlFor="excelFile" className="cursor-pointer flex flex-col items-center">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-3">
              <Upload className="w-8 h-8" />
            </div>
            <span className="text-sm font-semibold text-slate-700">
              {file ? file.name : '클릭하여 네이버 가계부 파일(.xlsx, .xls, .csv) 선택'}
            </span>
            <span className="text-xs text-slate-400 mt-1">
              네이버 가계부 원본 백업 파일(지출 및 수입) 또는 표준 엑셀 양식을 100% 자동 지원합니다
            </span>
          </label>
        </div>

        {/* 미리보기 테이블 */}
        {previewData.length > 0 && (
          <div className="mt-8 border-t border-slate-100 pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <span>변환 미리보기 (상위 {previewData.length}건)</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  내용을 확인하신 후 아래의 <strong>[가계부로 일괄 가져오기]</strong> 버튼을 꼭 눌러주세요.
                </p>
              </div>
              <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                총 {previewData.length}건 분석 완료
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">구분</th>
                    <th className="px-4 py-2.5">날짜</th>
                    <th className="px-4 py-2.5">사용처 / 입금처</th>
                    <th className="px-4 py-2.5">분류</th>
                    <th className="px-4 py-2.5">결제/입금 수단</th>
                    <th className="px-4 py-2.5 text-right">금액</th>
                    <th className="px-4 py-2.5">상세내용</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      {/* 수입 / 지출 구분 뱃지 */}
                      <td className="px-4 py-2">
                        {row.isIncome ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-bold text-[11px]">
                            <ArrowDownLeft className="w-3 h-3" />
                            수입
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-md font-bold text-[11px]">
                            <ArrowUpRight className="w-3 h-3" />
                            지출
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono">{row.date}</td>
                      <td className="px-4 py-2 font-semibold text-slate-800">{row.description}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700">
                          {row.major} &gt; {row.sub}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-medium">{row.paymentName}</td>
                      <td
                        className={`px-4 py-2 text-right font-bold font-mono ${
                          row.isIncome ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {row.isIncome ? '+' : '-'}
                        {row.amount.toLocaleString()}원
                      </td>
                      <td className="px-4 py-2 text-slate-400">{row.memo || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 실제 DB 저장 실행 버튼 영역 */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100">
              <div className="text-xs text-emerald-800">
                <span className="font-bold">💡 알림:</span> 파일 선택 후 반드시 우측의 <strong>[가계부로 일괄 가져오기]</strong> 버튼을 눌러야 데이터베이스에 영구 저장됩니다.
              </div>

              <button
                onClick={handleImport}
                disabled={loading}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-200 transition disabled:opacity-50 cursor-pointer shrink-0"
              >
                {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>{loading ? '데이터 저장 중...' : '가계부로 일괄 가져오기'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
