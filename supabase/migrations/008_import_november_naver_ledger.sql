-- ====================================================================
-- 마이그레이션 파일: 008_import_november_naver_ledger.sql
-- 설명: 네이버 가계부 2026년 11월 실제 지출 내역(21건) 일괄 등록 및 카테고리/결제수단 자동 매핑
-- ====================================================================

DO $$
DECLARE
    target_user_id UUID;

    -- 카테고리 ID 변수들
    cat_life_sundries UUID;       -- 생활용품 > 잡화소모
    cat_food_staple UUID;         -- 식비 > 부식
    cat_food_dining UUID;         -- 식비 > 외식
    cat_food_snack UUID;          -- 식비 > 간식
    cat_food_coffee UUID;         -- 식비 > 커피/음료
    cat_traffic_gas UUID;         -- 교통/차량 > 주유비
    cat_traffic_parking UUID;     -- 교통/차량 > 주차비
    cat_culture_travel UUID;      -- 건강/문화 > 여행
    cat_culture_insurance UUID;   -- 건강/문화 > 보장성보험
    cat_culture_life UUID;        -- 건강/문화 > 문화생활
    cat_congrat_meeting UUID;     -- 경조사/회비 > 모임회비
    cat_beauty_hair UUID;         -- 의복/미용 > 헤어/뷰티

    -- 결제수단 ID 변수들
    pm_chunsik_card UUID;         -- 춘식이모바일로카 (CARD)
    pm_samsung_card UUID;         -- 삼성카드 (CARD)
    pm_hana_bank UUID;            -- 하나저축은행 (BANK)
    pm_pocket_cash UUID;          -- 주머니현금 (CASH)

BEGIN
    -- 1. 현재 로그인/등록된 사용자 ID 조회
    SELECT id INTO target_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;

    IF target_user_id IS NULL THEN
        RAISE EXCEPTION '가입된 사용자가 없습니다. 먼저 웹 사이트에서 회원가입을 완료해 주세요.';
    END IF;

    -- 2. 결제수단 확인 및 생성 (없으면 자동 생성)
    SELECT id INTO pm_chunsik_card FROM public.payment_methods WHERE user_id = target_user_id AND name = '춘식이모바일로카';
    IF pm_chunsik_card IS NULL THEN
        INSERT INTO public.payment_methods (user_id, name, type, balance, sort_order)
        VALUES (target_user_id, '춘식이모바일로카', 'CARD', 0, 10)
        RETURNING id INTO pm_chunsik_card;
    END IF;

    SELECT id INTO pm_samsung_card FROM public.payment_methods WHERE user_id = target_user_id AND name = '삼성카드';
    IF pm_samsung_card IS NULL THEN
        INSERT INTO public.payment_methods (user_id, name, type, balance, sort_order)
        VALUES (target_user_id, '삼성카드', 'CARD', 0, 11)
        RETURNING id INTO pm_samsung_card;
    END IF;

    SELECT id INTO pm_hana_bank FROM public.payment_methods WHERE user_id = target_user_id AND name = '하나저축은행';
    IF pm_hana_bank IS NULL THEN
        INSERT INTO public.payment_methods (user_id, name, type, balance, sort_order)
        VALUES (target_user_id, '하나저축은행', 'BANK', 0, 12)
        RETURNING id INTO pm_hana_bank;
    END IF;

    SELECT id INTO pm_pocket_cash FROM public.payment_methods WHERE user_id = target_user_id AND name = '주머니현금';
    IF pm_pocket_cash IS NULL THEN
        INSERT INTO public.payment_methods (user_id, name, type, balance, sort_order)
        VALUES (target_user_id, '주머니현금', 'CASH', 0, 13)
        RETURNING id INTO pm_pocket_cash;
    END IF;

    -- 3. 카테고리 확인 및 생성 (categories 테이블 컬럼: major_name, sub_name 사용)
    -- 3-1) 생활용품 > 잡화소모
    SELECT id INTO cat_life_sundries FROM public.categories WHERE user_id = target_user_id AND major_name = '생활용품' AND sub_name = '잡화소모';
    IF cat_life_sundries IS NULL THEN
        INSERT INTO public.categories (user_id, major_name, sub_name, type, color, sort_order)
        VALUES (target_user_id, '생활용품', '잡화소모', 'EXPENSE', '#EF4444', 20)
        RETURNING id INTO cat_life_sundries;
    END IF;

    -- 3-2) 식비 > 부식
    SELECT id INTO cat_food_staple FROM public.categories WHERE user_id = target_user_id AND major_name = '식비' AND sub_name = '부식' LIMIT 1;
    IF cat_food_staple IS NULL THEN
        INSERT INTO public.categories (user_id, major_name, sub_name, type, color, sort_order)
        VALUES (target_user_id, '식비', '부식', 'EXPENSE', '#EF4444', 21)
        RETURNING id INTO cat_food_staple;
    END IF;

    -- 3-3) 식비 > 외식
    SELECT id INTO cat_food_dining FROM public.categories WHERE user_id = target_user_id AND major_name = '식비' AND sub_name = '외식' LIMIT 1;
    IF cat_food_dining IS NULL THEN
        INSERT INTO public.categories (user_id, major_name, sub_name, type, color, sort_order)
        VALUES (target_user_id, '식비', '외식', 'EXPENSE', '#EF4444', 22)
        RETURNING id INTO cat_food_dining;
    END IF;

    -- 3-4) 식비 > 간식
    SELECT id INTO cat_food_snack FROM public.categories WHERE user_id = target_user_id AND major_name = '식비' AND (sub_name = '간식' OR sub_name = '카페/간식') LIMIT 1;
    IF cat_food_snack IS NULL THEN
        INSERT INTO public.categories (user_id, major_name, sub_name, type, color, sort_order)
        VALUES (target_user_id, '식비', '간식', 'EXPENSE', '#EF4444', 23)
        RETURNING id INTO cat_food_snack;
    END IF;

    -- 3-5) 식비 > 커피/음료
    SELECT id INTO cat_food_coffee FROM public.categories WHERE user_id = target_user_id AND major_name = '식비' AND sub_name = '커피/음료';
    IF cat_food_coffee IS NULL THEN
        INSERT INTO public.categories (user_id, major_name, sub_name, type, color, sort_order)
        VALUES (target_user_id, '식비', '커피/음료', 'EXPENSE', '#EF4444', 24)
        RETURNING id INTO cat_food_coffee;
    END IF;

    -- 3-6) 교통/차량 > 주유비
    SELECT id INTO cat_traffic_gas FROM public.categories WHERE user_id = target_user_id AND major_name = '교통/차량' AND sub_name = '주유비' LIMIT 1;
    IF cat_traffic_gas IS NULL THEN
        INSERT INTO public.categories (user_id, major_name, sub_name, type, color, sort_order)
        VALUES (target_user_id, '교통/차량', '주유비', 'EXPENSE', '#EF4444', 25)
        RETURNING id INTO cat_traffic_gas;
    END IF;

    -- 3-7) 교통/차량 > 주차비
    SELECT id INTO cat_traffic_parking FROM public.categories WHERE user_id = target_user_id AND major_name = '교통/차량' AND sub_name = '주차비';
    IF cat_traffic_parking IS NULL THEN
        INSERT INTO public.categories (user_id, major_name, sub_name, type, color, sort_order)
        VALUES (target_user_id, '교통/차량', '주차비', 'EXPENSE', '#EF4444', 26)
        RETURNING id INTO cat_traffic_parking;
    END IF;

    -- 3-8) 건강/문화 > 여행
    SELECT id INTO cat_culture_travel FROM public.categories WHERE user_id = target_user_id AND major_name = '건강/문화' AND sub_name = '여행';
    IF cat_culture_travel IS NULL THEN
        INSERT INTO public.categories (user_id, major_name, sub_name, type, color, sort_order)
        VALUES (target_user_id, '건강/문화', '여행', 'EXPENSE', '#EF4444', 27)
        RETURNING id INTO cat_culture_travel;
    END IF;

    -- 3-9) 건강/문화 > 보장성보험
    SELECT id INTO cat_culture_insurance FROM public.categories WHERE user_id = target_user_id AND major_name = '건강/문화' AND sub_name = '보장성보험';
    IF cat_culture_insurance IS NULL THEN
        INSERT INTO public.categories (user_id, major_name, sub_name, type, color, sort_order)
        VALUES (target_user_id, '건강/문화', '보장성보험', 'EXPENSE', '#EF4444', 28)
        RETURNING id INTO cat_culture_insurance;
    END IF;

    -- 3-10) 건강/문화 > 문화생활
    SELECT id INTO cat_culture_life FROM public.categories WHERE user_id = target_user_id AND major_name = '건강/문화' AND sub_name = '문화생활';
    IF cat_culture_life IS NULL THEN
        INSERT INTO public.categories (user_id, major_name, sub_name, type, color, sort_order)
        VALUES (target_user_id, '건강/문화', '문화생활', 'EXPENSE', '#EF4444', 29)
        RETURNING id INTO cat_culture_life;
    END IF;

    -- 3-11) 경조사/회비 > 모임회비
    SELECT id INTO cat_congrat_meeting FROM public.categories WHERE user_id = target_user_id AND major_name = '경조사/회비' AND sub_name = '모임회비';
    IF cat_congrat_meeting IS NULL THEN
        INSERT INTO public.categories (user_id, major_name, sub_name, type, color, sort_order)
        VALUES (target_user_id, '경조사/회비', '모임회비', 'EXPENSE', '#EF4444', 30)
        RETURNING id INTO cat_congrat_meeting;
    END IF;

    -- 3-12) 의복/미용 > 헤어/뷰티
    SELECT id INTO cat_beauty_hair FROM public.categories WHERE user_id = target_user_id AND major_name = '의복/미용' AND sub_name = '헤어/뷰티';
    IF cat_beauty_hair IS NULL THEN
        INSERT INTO public.categories (user_id, major_name, sub_name, type, color, sort_order)
        VALUES (target_user_id, '의복/미용', '헤어/뷰티', 'EXPENSE', '#EF4444', 31)
        RETURNING id INTO cat_beauty_hair;
    END IF;

    -- 4. 2026년 11월 네이버 가계부 21건의 실제 거래 내역 일괄 등록 (중복 등록 방지)
    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-01' AND description = '다이소' AND amount = 4000) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-01', 'EXPENSE', 4000, cat_life_sundries, pm_chunsik_card, '다이소', '테이프');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-02' AND description = '딴지마켓' AND amount = 39500) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-02', 'EXPENSE', 39500, cat_food_staple, pm_chunsik_card, '딴지마켓', '김치');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-04' AND description = '네이버쇼핑' AND amount = 15000) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-04', 'EXPENSE', 15000, cat_food_staple, pm_chunsik_card, '네이버쇼핑', '토마토 소스');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-05' AND description = '처인세종주유소' AND amount = 60000) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-05', 'EXPENSE', 60000, cat_traffic_gas, pm_chunsik_card, '처인세종주유소', '주유비');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-05' AND description = 'Nol' AND amount = 50000) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-05', 'EXPENSE', 50000, cat_culture_travel, pm_chunsik_card, 'Nol', '모텔비');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-05' AND description = '키다리식품' AND amount = 5000) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-05', 'EXPENSE', 5000, cat_food_snack, pm_chunsik_card, '키다리식품', '빵');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-05' AND description = '원조할매곰창' AND amount = 10000) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-05', 'EXPENSE', 10000, cat_food_dining, pm_chunsik_card, '원조할매곰창', '곰탕');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-06' AND description = '내장산국립공원' AND amount = 5000) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-06', 'EXPENSE', 5000, cat_traffic_parking, pm_chunsik_card, '내장산국립공원', '주차비');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-06' AND description = '노령주유소' AND amount = 30000) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-06', 'EXPENSE', 30000, cat_traffic_gas, pm_pocket_cash, '노령주유소', '주유비');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-06' AND description = '남산칼국수' AND amount = 10000) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-06', 'EXPENSE', 10000, cat_food_dining, pm_chunsik_card, '남산칼국수', '칼국수');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-06' AND description = '내장산개발' AND amount = 7000) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-06', 'EXPENSE', 7000, cat_food_coffee, pm_chunsik_card, '내장산개발', '커피');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-06' AND description = '내장산국립공원' AND amount = 7000) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-06', 'EXPENSE', 7000, cat_culture_travel, pm_chunsik_card, '내장산국립공원', '케이블카');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-07' AND description = '가족통장' AND amount = 50000) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-07', 'EXPENSE', 50000, cat_congrat_meeting, pm_hana_bank, '가족통장', '가족회비');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-08' AND description = '건강보험공단' AND amount = 63850) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-08', 'EXPENSE', 63850, cat_culture_insurance, pm_hana_bank, '건강보험공단', '건강보험료');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-11' AND description = 'GOOGLE*TIDALMusicHi') THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-11', 'EXPENSE', 6708.56, cat_culture_life, pm_samsung_card, 'GOOGLE*TIDALMusicHi', 'GOOGLE*TIDALMusicHi');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-13' AND description = 'Café Monet' AND amount = 8400) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-13', 'EXPENSE', 8400, cat_food_coffee, pm_chunsik_card, 'Café Monet', '커피');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-13' AND description = '맘스터치' AND amount = 5200) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-13', 'EXPENSE', 5200, cat_food_dining, pm_chunsik_card, '맘스터치', '버거');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-13' AND description = '광동석유㈜' AND amount = 30000) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-13', 'EXPENSE', 30000, cat_traffic_gas, pm_chunsik_card, '광동석유㈜', '주유비');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-14' AND description = '롯데마트' AND amount = 48500) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-14', 'EXPENSE', 48500, cat_food_staple, pm_chunsik_card, '롯데마트', '장보기');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-14' AND description = '김정희헤어클럽' AND amount = 20000) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-14', 'EXPENSE', 20000, cat_beauty_hair, pm_pocket_cash, '김정희헤어클럽', '이발비');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = target_user_id AND transaction_date = '2026-11-19' AND description = '성북동빵집' AND amount = 9500) THEN
        INSERT INTO public.transactions (user_id, transaction_date, type, amount, category_id, payment_method_id, description, memo)
        VALUES (target_user_id, '2026-11-19', 'EXPENSE', 9500, cat_food_snack, pm_chunsik_card, '성북동빵집', '빵');
    END IF;

    RAISE NOTICE '2026년 11월 네이버 가계부 21건의 데이터가 성공적으로 등록되었습니다!';
END $$;
