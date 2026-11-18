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
 * 네이버 가계부 및 엑셀(XLSX/CSV) 가져오기 & 내보내기 컴포넌트
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
          const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
          setPreviewData(data.slice(0, 5)); // 상위 5건 미리보기
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
          const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

          if (rows.length === 0) {
            throw new Error('파일에 데이터가 없습니다.');
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

          // 1. 파일 내 새로운 카테고리/결제수단 수집
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
          }[] = [];

          const seenNewCats = new Set<string>();
          const seenNewPayments = new Set<string>();

          rows.forEach((row) => {
            // 네이버 가계부 컬럼 별칭 지원
            const major = (row['대분류'] || row['대분류명'] || '기타').toString().trim();
            const sub = (row['소분류'] || row['소분류명'] || '기타').toString().trim();
            const payment = (
              row['결제수단'] ||
              row['자산'] ||
              row['결제방법'] ||
              '현금'
            )
              .toString()
              .trim();
            
            // 수입/지출 판단
            const rawIncome = parseFloat(String(row['수입'] || row['수입금액'] || 0).replace(/,/g, ''));
            const rawExpense = parseFloat(String(row['지출'] || row['지출금액'] || row['금액'] || 0).replace(/,/g, ''));
            const type = rawIncome > 0 && rawExpense <= 0 ? 'INCOME' : 'EXPENSE';

            const catKey = `${major}_${sub}`;
            if (!categoryMap.has(catKey) && !seenNewCats.has(catKey)) {
              seenNewCats.add(catKey);
              newCategoriesToInsert.push({
                user_id: user.id,
                type,
                major_name: major,
                sub_name: sub,
                color: type === 'INCOME' ? '#10B981' : '#EF4444',
              });
            }

            if (!paymentMap.has(payment) && !seenNewPayments.has(payment)) {
              seenNewPayments.add(payment);
              newPaymentsToInsert.push({
                user_id: user.id,
                name: payment,
                type: payment.includes('카드') ? 'CARD' : payment.includes('통장') || payment.includes('은행') ? 'BANK' : 'CASH',
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

          setStatusMessage('거래 내역 데이터를 변환하고 등록하는 중...');

          // 2. 거래내역 변환 및 일괄 삽입
          const transactionsToInsert = rows.map((row) => {
            // 날짜 변환 (YYYY-MM-DD)
            let dateStr = row['날짜'] || row['일자'] || row['거래일시'] || new Date().toISOString().split('T')[0];
            if (dateStr instanceof Date) {
              dateStr = dateStr.toISOString().split('T')[0];
            } else {
              dateStr = String(dateStr).trim().replace(/\./g, '-').replace(/\//g, '-');
              if (dateStr.length === 8 && !dateStr.includes('-')) {
                // YYYYMMDD 형태 지원
                dateStr = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
              }
            }

            const rawIncome = parseFloat(String(row['수입'] || row['수입금액'] || 0).replace(/,/g, ''));
            const rawExpense = parseFloat(String(row['지출'] || row['지출금액'] || row['금액'] || 0).replace(/,/g, ''));
            const isIncome = rawIncome > 0 && rawExpense <= 0;
            const amount = isIncome ? rawIncome : (rawExpense > 0 ? rawExpense : Math.abs(rawIncome));

            const major = (row['대분류'] || row['대분류명'] || '기타').toString().trim();
            const sub = (row['소분류'] || row['소분류명'] || '기타').toString().trim();
            const payment = (
              row['결제수단'] ||
              row['자산'] ||
              row['결제방법'] ||
              '현금'
            )
              .toString()
              .trim();

            const description = (
              row['사용처'] ||
              row['내역'] ||
              row['내용'] ||
              row['가맹점'] ||
              '미지정'
            )
              .toString()
              .trim();

            const memo = (row['메모'] || row['비고'] || '').toString().trim();

            return {
              user_id: user.id,
              transaction_date: dateStr,
              type: isIncome ? 'INCOME' : 'EXPENSE',
              amount: isNaN(amount) ? 0 : amount,
              category_id: categoryMap.get(`${major}_${sub}`) || null,
              payment_method_id: paymentMap.get(payment) || null,
              description,
              memo: memo || null,
              exclude_from_stats: false,
            };
          }).filter((t) => t.amount > 0);

          // 100개씩 청크(Chunk)로 나누어 배치 저장
          const chunkSize = 100;
          for (let i = 0; i < transactionsToInsert.length; i += chunkSize) {
            const chunk = transactionsToInsert.slice(i, i + chunkSize);
            const { error: insertErr } = await supabase.from('transactions').insert(chunk);
            if (insertErr) throw insertErr;
          }

          setStatusMessage(
            `성공적으로 총 ${transactionsToInsert.length}건의 내역을 가져왔습니다!`
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
        대분류: '급여',
        소분류: '기본급',
        결제수단: '은행계좌',
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
              네이버 가계부에서 다운받은 엑셀(.xlsx)이나 CSV 파일을 업로드하면 과거 내역을 한 번에 등록할 수 있습니다.
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
              {file ? file.name : '클릭하여 엑셀 파일(.xlsx, .csv) 선택'}
            </span>
            <span className="text-xs text-slate-400 mt-1">
              네이버 가계부 백업 파일 또는 표준 엑셀 파일을 지원합니다
            </span>
          </label>
        </div>

        {/* 미리보기 테이블 */}
        {previewData.length > 0 && (
          <div className="mt-6">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              데이터 미리보기 (상위 5건)
            </h4>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    {Object.keys(previewData[0]).slice(0, 6).map((col) => (
                      <th key={col} className="px-4 py-2">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      {Object.values(row).slice(0, 6).map((val: any, vIdx) => (
                        <td key={vIdx} className="px-4 py-2 truncate max-w-[150px]">
                          {String(val)}
                        </td>
                      ))}
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
