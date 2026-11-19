'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import { Category, PaymentMethod } from '@/types/database';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, Download } from 'lucide-react';

interface ExcelImportProps {
  categories: Category[];
  paymentMethods: PaymentMethod[];
  onSuccess: () => void;
}

/**
 * 네이버 가계부 완벽 호환 엑셀(XLSX/CSV) 가져오기 & 내보내기 컴포넌트
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
   * 네이버 가계부 및 표준 엑셀 시트 2차원 배열을 정제된 거래 데이터 객체 배열로 변환하는 정밀 파서
   */
  const parseRowsFromSheet = (rawRows: any[][]): any[] => {
    if (!rawRows || rawRows.length === 0) return [];

    // 1. 실제 헤더 행 탐색 ('날짜' 또는 '일자'가 포함된 행 찾기)
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
      // 헤더를 못 찾은 경우 첫 번째 행을 헤더로 간주
      headerIndex = 0;
    }

    const headers = rawRows[headerIndex].map((h) => String(h || '').trim());
    const dataRows = rawRows.slice(headerIndex + 1);

    const parsedResults: any[] = [];

    dataRows.forEach((row) => {
      if (!Array.isArray(row) || row.length === 0) return;

      // 행 데이터를 객체로 매핑
      const rowObj: { [key: string]: any } = {};
      headers.forEach((h, idx) => {
        if (h) rowObj[h] = row[idx] !== undefined ? row[idx] : '';
      });

      // 1) 날짜 확인 및 요약 행 필터링
      const rawDateStr = String(rowObj['날짜'] || rowObj['일자'] || '').trim();
      if (!rawDateStr) return; // 날짜 없는 행 무시

      // '합계', '수입 합계', '카드대금' 등의 요약/안내 행 건너뛰기
      const usagePlace = String(rowObj['사용처'] || rowObj['사용내역'] || rowObj['가맹점'] || '').trim();
      if (
        rawDateStr.includes('합계') ||
        rawDateStr.includes('수입') ||
        rawDateStr.includes('*') ||
        usagePlace.includes('합계')
      ) {
        return;
      }

      // 2) 날짜 표준 포맷 (YYYY-MM-DD) 변환
      let formattedDate = rawDateStr;
      // '2026년11월01일' 형태 매칭
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

      // 3) 금액 및 결제수단 파싱 (네이버 가계부의 현금/카드/출금통장/카드분류 컬럼 분리 지원)
      let amount = 0;
      let paymentName = '현금';
      let paymentType: 'CARD' | 'BANK' | 'CASH' = 'CASH';

      const cardVal = parseFloat(String(rowObj['카드'] || 0).replace(/,/g, ''));
      const cashVal = parseFloat(String(rowObj['현금'] || 0).replace(/,/g, ''));
      const incomeVal = parseFloat(String(rowObj['수입'] || rowObj['수입금액'] || 0).replace(/,/g, ''));
      const expenseVal = parseFloat(String(rowObj['지출'] || rowObj['지출금액'] || rowObj['금액'] || 0).replace(/,/g, ''));

      let isIncome = false;

      if (cardVal > 0) {
        amount = cardVal;
        paymentName = String(rowObj['카드분류'] || '신용카드').trim() || '신용카드';
        paymentType = 'CARD';
      } else if (cashVal > 0) {
        amount = cashVal;
        const bankOrCash = String(rowObj['출금통장'] || '현금').trim() || '현금';
        paymentName = bankOrCash;
        paymentType = bankOrCash.includes('통장') || bankOrCash.includes('은행') ? 'BANK' : 'CASH';
      } else if (incomeVal > 0) {
        amount = incomeVal;
        isIncome = true;
        paymentName = String(rowObj['결제수단'] || rowObj['자산'] || '은행통장').trim() || '은행통장';
        paymentType = 'BANK';
      } else if (expenseVal > 0) {
        amount = expenseVal;
        paymentName = String(rowObj['결제수단'] || rowObj['자산'] || '현금').trim() || '현금';
        paymentType = paymentName.includes('카드') ? 'CARD' : paymentName.includes('통장') || paymentName.includes('은행') ? 'BANK' : 'CASH';
      }

      if (amount <= 0) return; // 금액이 0인 내역 제외

      // 4) 카테고리 대분류/소분류 분리 (네이버 가계부 '식비>부식' 형태 지원)
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

      // 5) 사용처 및 메모
      const description = String(
        rowObj['사용처'] || rowObj['가맹점'] || rowObj['내용'] || rowObj['내역'] || '미지정'
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
          const parsed = parseRowsFromSheet(rawRows);
          setPreviewData(parsed.slice(0, 5)); // 상위 5건 미리보기
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
   * 엑셀 파싱 및 Supabase 일괄 등록 핸들러
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

          const parsedItems = parseRowsFromSheet(rawRows);

          if (parsedItems.length === 0) {
            throw new Error('파일에서 유효한 거래 내역을 찾을 수 없습니다.');
          }

          // 최신 카테고리 및 결제수단 맵 구성
          let currentCategories = [...categories];
          let currentPaymentMethods = [...paymentMethods];

          const categoryMap = new Map<string, string>(); // "대분류_소분류" -> category_id
          currentCategories.forEach((c) => {
            categoryMap.set(`${c.major_name}_${c.sub_name}`, c.id);
          });

          const paymentMap = new Map<string, string>(); // "결제수단명" -> payment_id
          currentPaymentMethods.forEach((p) => {
            paymentMap.set(p.name, p.id);
          });

          setStatusMessage('신규 카테고리 및 결제수단을 확인하고 동기화하는 중...');

          // 1. 신규 카테고리 및 결제수단 수집
          const newCategoriesToInsert: {
            user_id: string;
            type: 'INCOME' | 'EXPENSE';
            major_name: string;
            sub_name: string;
            color: string;
          }[] = [];

          const newPaymentsToInsert: {
            user_id: string;
            name: string;
            type: 'CARD' | 'BANK' | 'CASH' | 'ETC';
            balance: number;
          }[] = [];

          const seenNewCats = new Set<string>();
          const seenNewPayments = new Set<string>();

          parsedItems.forEach((item) => {
            const catKey = `${item.major}_${item.sub}`;
            if (!categoryMap.has(catKey) && !seenNewCats.has(catKey)) {
              seenNewCats.add(catKey);
              newCategoriesToInsert.push({
                user_id: user.id,
                type: item.isIncome ? 'INCOME' : 'EXPENSE',
                major_name: item.major,
                sub_name: item.sub,
                color: item.isIncome ? '#10B981' : '#EF4444',
              });
            }

            if (!paymentMap.has(item.paymentName) && !seenNewPayments.has(item.paymentName)) {
              seenNewPayments.add(item.paymentName);
              newPaymentsToInsert.push({
                user_id: user.id,
                name: item.paymentName,
                type: item.paymentType,
                balance: 0,
              });
            }
          });

          // 신규 카테고리 DB 삽입
          if (newCategoriesToInsert.length > 0) {
            const { data: insertedCats, error: catErr } = await supabase
              .from('categories')
              .insert(newCategoriesToInsert)
              .select();
            if (!catErr && insertedCats) {
              insertedCats.forEach((c: Category) => {
                categoryMap.set(`${c.major_name}_${c.sub_name}`, c.id);
              });
            }
          }

          // 신규 결제수단 DB 삽입
          if (newPaymentsToInsert.length > 0) {
            const { data: insertedPays, error: payErr } = await supabase
              .from('payment_methods')
              .insert(newPaymentsToInsert)
              .select();
            if (!payErr && insertedPays) {
              insertedPays.forEach((p: PaymentMethod) => {
                paymentMap.set(p.name, p.id);
              });
            }
          }

          setStatusMessage('거래 내역 데이터를 가계부에 등록하는 중...');

          // 2. 거래내역 일괄 삽입
          const transactionsToInsert = parsedItems.map((item) => ({
            user_id: user.id,
            transaction_date: item.date,
            type: item.isIncome ? 'INCOME' : 'EXPENSE',
            amount: item.amount,
            category_id: categoryMap.get(`${item.major}_${item.sub}`) || null,
            payment_method_id: paymentMap.get(item.paymentName) || null,
            description: item.description,
            memo: item.memo || null,
            exclude_from_stats: false,
          }));

          // 100개씩 청크로 나누어 배치 저장
          const chunkSize = 100;
          for (let i = 0; i < transactionsToInsert.length; i += chunkSize) {
            const chunk = transactionsToInsert.slice(i, i + chunkSize);
            const { error: insertErr } = await supabase.from('transactions').insert(chunk);
            if (insertErr) throw insertErr;
          }

          setStatusMessage(
            `성공적으로 네이버 가계부 내역 총 ${transactionsToInsert.length}건을 가져왔습니다!`
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
        수입지출구분: '지출',
        대분류: '식비',
        소분류: '외식',
        결제수단: '신용카드',
        사용처: '맛있는 식당',
        금액: 35000,
        메모: '가족 외식',
      },
      {
        날짜: '2026-11-18',
        수입지출구분: '수입',
        대분류: '주수입',
        소분류: '급여',
        결제수단: '주거래 은행',
        사용처: '회사',
        금액: 3500000,
        메모: '11월 급여 입금',
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
              네이버 가계부에서 다운받은 원본 엑셀(.xlsx)이나 CSV 파일을 그대로 올리시면 자동으로 분석하여 등록합니다.
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
            <div>{statusMessage}</div>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div>{errorMessage}</div>
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
              {file ? file.name : '클릭하여 네이버 가계부 파일(.xlsx, .csv) 선택'}
            </span>
            <span className="text-xs text-slate-400 mt-1">
              네이버 가계부 원본 백업 파일(지출현황) 또는 표준 엑셀 양식을 100% 자동 지원합니다
            </span>
          </label>
        </div>

        {/* 미리보기 테이블 */}
        {previewData.length > 0 && (
          <div className="mt-6">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              변환 미리보기 (상위 5건)
            </h4>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2">날짜</th>
                    <th className="px-4 py-2">사용처</th>
                    <th className="px-4 py-2">분류</th>
                    <th className="px-4 py-2">결제수단</th>
                    <th className="px-4 py-2 text-right">금액</th>
                    <th className="px-4 py-2">상세내용</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono">{row.date}</td>
                      <td className="px-4 py-2 font-semibold text-slate-800">{row.description}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700">
                          {row.major} &gt; {row.sub}
                        </span>
                      </td>
                      <td className="px-4 py-2">{row.paymentName}</td>
                      <td className="px-4 py-2 text-right font-bold text-red-600">
                        {row.amount.toLocaleString()}원
                      </td>
                      <td className="px-4 py-2 text-slate-400">{row.memo || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleImport}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-md shadow-emerald-200 transition disabled:opacity-50 cursor-pointer"
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
