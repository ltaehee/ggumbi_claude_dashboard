# 꿈비 통합 비즈니스 대시보드 TODO

## DB 스키마 & 마이그레이션
- [x] sales_records 테이블 (매출 원장)
- [x] bom_costs 테이블 (BOM 원가)
- [x] sales_targets 테이블 (월별 목표)
- [x] promotions 테이블 (프로모션 행사)
- [x] inventory 테이블 (재고)
- [x] uploaded_files 테이블 (업로드 이력)

## 백엔드 API (tRPC routers)
- [x] 엑셀 업로드 파이프라인 (multer + xlsx 파싱 + DB upsert)
- [x] 매출 분석 API (기간 필터, 부서 필터, 집계)
- [x] KPI 지표 API (YTD/YoY/MoM/WoW 연산)
- [x] 거래처별/품목별 성과 테이블 API
- [x] 목표 관리 API (달성률, 예측)
- [x] 프로모션 API
- [x] DOC 분석 API
- [x] AI 분석 비서 API (LLM 연동)
- [x] 업로드 이력 조회 API

## 프론트엔드 레이아웃
- [x] 커스텀 사이드바 (주피미/월피미 그룹)
- [x] 전체 라우팅 구조 (App.tsx)
- [x] 글로벌 CSS 테마 (index.css)
- [x] 기간 필터 컴포넌트 (특정기간/주간/월단위)

## 매출/수익 분석 페이지
- [x] 상단 고정 KPI 카드 (연 누적 GMV, 선택기간 GMV/수량/ASP)
- [x] YoY/MoM 증감률 ▲▼ 아이콘 + Green/Red 컬러
- [x] 주간/월간/연간 GMV 추세 라인차트 (Recharts)
- [x] 품명 TOP10 수평 바차트
- [x] 대/중/소분류 파이차트
- [x] 거래처별 성과 테이블 (WoW/MoM/YoY/6개월평균)
- [x] 품목별 성과 테이블

## 프로모션/목표 관리 페이지
- [x] 월별 목표 대비 실적 달성률 카드
- [x] 품목별 추세 예측 테이블 (위험 상태 컬러)
- [x] 매출 성장 시뮬레이션 슬라이더
- [x] HTML 프로모션 달력

## 품목별 DOC 분석 페이지
- [x] 분석 기간 설정 (오늘~N일 / 작년 직접 지정)
- [x] DOC 계산 테이블 (부족/양호 컬러 하이라이트)

## 엑셀 업로드 UI 페이지
- [x] 드래그 앤 드롭 업로드 인터페이스
- [x] 파일 타입별 업로드 (매출/BOM/목표/프로모션/재고)
- [x] 업로드 이력 목록

## AI 분석 비서 페이지
- [x] 부서/기간 선택 UI
- [x] 자연어 분석 요청 입력
- [x] LLM 스트리밍 마크다운 렌더링

## 숫자 표기 표준화
- [x] formatAmount() 유틸 (백만원 단위)
- [x] formatQty() 유틸 (K/M 축약)
- [x] DeltaBadge 컴포넌트 (▲▼ + Green/Red)

## 테스트
- [x] 비즈니스 로직 단위 테스트 (주차 계산, YTD/YoY/MoM) - 19개 통과
- [x] auth.logout.test.ts - 1개 통과

## 추가 기능: 비밀번호 접근 게이트 & Admin 페이지
- [x] app_settings 테이블 추가 (key/value 설정 저장)
- [x] DB 초기화 시 비밀번호 '0000' 자동 삽입 (bcrypt 해시)
- [x] auth.verifyPassword tRPC API (DB 조회 검증)
- [x] auth.changePassword tRPC API (Admin 전용)
- [x] admin.getTargets / updateTarget / deleteTarget API
- [x] admin.getSalesRecords / deleteSalesRecord API
- [x] admin.reuploadSales (동일 기간 덮어쓰기 Upsert) API
- [x] 접근 게이트 화면 (전체 화면 블로킹, 마스킹 입력, 오류 메시지)
- [x] sessionStorage 기반 인증 상태 유지
- [x] Admin 페이지 (목표값 CRUD 그리드, 품목 매핑 편집, 비밀번호 변경)
- [x] Admin 페이지 비밀번호 변경 폼
- [x] 사이드바에 Admin 메뉴 항목 추가

## 갭 보완 작업
- [x] 동일 기간 엑셀 재업로드 Upsert 흐름 - Admin 페이지에 명확한 안내 UI 추가
- [x] 품목 매핑(대/중/소분류) 마스터 데이터 CRUD Admin 탭 추가
- [x] 비밀번호 변경 시 현재 비밀번호 검증 로직 강화 (이미 구현됨 - 확인 완료)

## 갭 보완 작업 2차
- [x] 품목 매핑 탭 - 기존 행 편집(수정) 버튼 및 폼 프리필 UX 추가
- [x] Admin 매출 탭 - 동일 기간 재업로드/덮어쓰기 안내 배너 추가

## 2차 고도화: 핵심 기능 복원

### 백엔드 API
- [x] 채널별 드릴다운 집계 API (채널→대분류→품명 계층)
- [x] 품목 계층 필터 옵션 API (대분류/중분류/소분류/품명 목록 반환)
- [x] 전역 필터(품목 계층 + 채널) 적용된 KPI/차트 쿼리 수정
- [x] 시뮬레이터 연산 API (성장률/마진율 입력 → 예측 GMV/수익 반환)
- [x] 프로모션 목록 API (달력 바인딩용)

### 프론트엔드 - 품목 계층 다중 선택 필터
- [x] MultiSelectFilter 컴포넌트 (검색 가능, 다중 선택, 계층 연동)
- [x] 전역 필터 컨텍스트 (FilterContext) 구현
- [x] 사이드바/상단 툴바에 필터 위젯 배치

### 프론트엔드 - 매출/수익 분석 페이지
- [x] 채널별 드릴다운 테이블 (채널→대분류→품명, YoY/MoM 컬럼)
- [x] 전역 필터 연동 (모든 차트/테이블에 필터 적용)

### 프론트엔드 - 프로모션/목표 관리 페이지
- [x] 프로모션 달력 실제 DB 데이터 바인딩
- [x] 마감 예측 시뮬레이터 실시간 연산 활성화
- [x] 성장 시뮬레이션 슬라이더 → 백엔드 API 연동

## 노션 행사관리 DB 연동

- [x] NOTION_API_KEY, NOTION_DATABASE_ID 환경변수 등록
- [x] 노션 DB 속성 구조 파악 및 컬럼 매핑 정의 (행사(프로모션)/행사기간/채널명/브랜드/매출목표/달성매출/상태/메인제품)
- [x] notionSync.ts 모듈 구현 (노션 → DB Upsert 파이프라인, 페이지네이션 처리)
- [x] promotions.syncFromNotion tRPC API 추가
- [x] promotions.getLastSyncedAt API 추가
- [x] TargetsPage 노션 동기 버튼(보라색) 및 마지막 동기 시각 표시
- [x] 서버 시작 시 자동 동기 (5초 후 첫 실행 + 1시간 주기 setInterval)
- [x] 노션 연동 vitest 테스트 추가 (notionSync.test.ts, 14개 테스트)

## 3차 고도화: 필터 UX + 시각화 개선 + 이익률 버그 수정

- [x] [긴급] 이익률 100% 오류 수정 - db.ts aggregateSales profit/profitRate 계산 로직 수정 (BOM JOIN)
- [x] 필터 드롭다운 GMV 기준 정렬 - getFilterOptions ORDER BY GMV DESC + startDate/endDate 파라미터 추가
- [x] 퀵 배지 필터(Chip) 백엔드 API - filters.getTopItems (채널/대분류 TOP 8)
- [x] 퀵 배지 필터(Chip) 프론트엔드 - SalesPage에 QuickChipFilter 컴포넌트 인라인 구현
- [x] QuickChipFilter.tsx 별도 컴포넌트 파일로 분리 (client/src/components/QuickChipFilter.tsx)
- [x] 파이차트 라벨 표시 - SalesPage 파이차트 퍼센트 내부 라벨 + 하단 범례 표시
- [x] 파이차트 크기 확대 - 3:2 비율 그리드, innerRadius 55/outerRadius 100으로 확대
- [x] 채널별 드릴다운 테이블 계층 가독성 개선 - Zebra striping + 들여쓰기 + 가이드라인 + 이익률 색상 코딩

## 노션 행사관리 DB 연동 (재개)

- [x] NOTION_API_KEY, NOTION_DATABASE_ID 환경변수 등록
- [x] 노션 DB 속성 구조 파악 및 컬럼 매핑 정의 (행사(프로모션)/행사기간/채널명/브랜드/매출목표/달성매출/상태/메인제품)
- [x] notionSync.ts 모듈 구현 (노션 → DB Upsert 파이프라인, 페이지네이션 처리)
- [x] promotions.syncFromNotion tRPC API 추가
- [x] promotions.getLastSyncedAt API 추가
- [x] TargetsPage 노션 동기 버튼(보라색) 및 마지막 동기 시각 표시
- [x] 서버 시작 시 자동 동기 (5초 후 첫 실행 + 1시간 주기 setInterval)
- [x] 노션 연동 vitest 테스트 추가 (notionSync.test.ts, 14개 테스트)

## 4차 고도화: 프로모션 페이지 Read-only 전환 + 달력/목록 UX 개선

- [x] TargetsPage 추가/수정/삭제 버튼 전체 제거 (Read-only 전환)
- [x] PromoDialog (추가/편집 다이얼로그) 컴포넌트 제거
- [x] 상세 조회 전용 모달(PromoDetailModal) 구현 - 수정/삭제 불가, 조회만 가능
- [x] 달력 행사 타이틀 클릭 시 상세 조회 모달 연동
- [x] 달력 +N 숫자 클릭 시 해당 날짜 행사 목록 모달 연동 (DayPromosModal)
- [x] 달력 내부 텍스트 폰트 크기 확대 (날짜 text-xs, 행사 text-[10px])
- [x] 프로모션 목록 섹션 텍스트 검색창 추가 (행사명/채널명/비고 검색)
- [x] 프로모션 목록 조건별 필터 (채널/상태: 예정·진행중·종료) 추가
- [x] 프로모션 목록 행사 클릭 시 상세 조회 모달 연동

## 5차 고도화: 금액 단위 표기 변경, 커서 포인터, 퀵 필터 확장

- [x] fmtAmt 함수 수정 - 축약형(십억/백만) 제거, 천 단위 콤마 전체 숫자 표기
- [x] fmtQty 함수 수정 - K 단위 제거, 천 단위 콤마 전체 숫자 표기
- [x] 커서 포인터 CSS 일괄 적용 (button/role/select/a/recharts 요소 전체 적용)
- [x] 퀴칩 필터 5단계 계층 확장 - 중분류/소분류/품명 카테고리 탭 추가
- [x] getTopItems API에 itemMid/itemSmall/itemName 타입 추가

## 6차 고도화: 부서 기본값 고정, 금액 단위 버그, 채널 상세 라우팅, 캐싱 최적화

- [x] 부서 선택 기본값 '국내사업' 고정 (FilterContext 초기값 변경)
- [x] 금액 단위 중복 버그 수정 - '원 백만원' → '원' 단일 표기 (SalesPage/MonthlyPage/AiPage)
- [x] 수량 표기 K 단위 제거 - '9.0K' → '9,000' 콤마 전체 숫자 (fmtQty 이미 수정됨)
- [x] 채널 상세 분석 서브페이지 구현 (ChannelDetailPage.tsx 신규)
  - 채널 요약 지표 카드 (총 매출, 수량, 이익률 등)
  - 상품 리스트 테이블 (매출순/수량순 정렬 토글, 검색)
  - 뒤로가기 버튼
- [x] SalesPage 채널 드릴다운 테이블 → 채널 클릭 시 상세 페이지 라우팅으로 변경
- [x] App.tsx에 /sales/channel/:channelName 라우트 추가
- [x] 서버 사이드 인메모리 캐싱 구현 (TTL 5분, 쿼리 파라미터 기반 캐시 키, 엑셀 업로드 시 전체 무효화)
- [x] 채널 상세 페이지 - kpi.getSummary + sales.getItemPerf (채널 필터) 재활용
- [x] cursor-pointer 누락 요소 추가 점검 및 보완 (ChannelDetailPage 포함)

## 7차: 네이버 랭킹 분석 메뉴 신설

- [x] DB 스키마: naver_rankings (일시/키워드/상품코드/순위/상품명/가격/판매처) 테이블
- [x] DB 스키마: naver_favorites (userId/productCode 즐겨찾기) 테이블
- [x] DB 스키마: naver_memos (productCode/keyword/memo 메모) 테이블
- [x] Drizzle 마이그레이션 SQL 생성 및 적용
- [x] naverSheetSync.ts - 구글 시트 연동 모듈 (Google Sheets API v4)
- [x] tRPC naverRanking 라우터: getRankings (전일 대비 순위 변동 포함), syncFromSheet
- [x] tRPC naverRanking 라우터: toggleFavorite, getFavorites
- [x] tRPC naverRanking 라우터: upsertMemo, getMemo
- [x] tRPC naverRanking 라우터: getRankingHistory (시계열 그래프용)
- [x] NaverRankingPage.tsx 신규 구현
  - 날짜/키워드 필터
  - 즐겨찾기 상단 고정 + 별 아이콘 토글
  - 순위 변동 배지 (▲초록/▼빨강/- 회색)
  - 비고 셀 클릭 → 메모 모달 (저장/조회)
  - 시계열 그래프 (Y축 역순, 40위/80위 기준선, 80위 권외 처리)
  - 가격 천 단위 콤마 + 원 표기
  - cursor-pointer 적용
- [x] DashboardLayout 사이드바에 '네이버 랭킹 분석' 메뉴 추가 (ShoppingBag 아이콘)
- [x] App.tsx에 /naver-ranking 라우트 추가
- [x] Vitest 테스트 작성 (naverRanking.test.ts, 19개 테스트)

## 2026-05-26 수정 요청서

- [x] GMV → 매출 용어 변경 (전체 파일)
- [x] DOC → 재고 가용 일수 용어 변경 (전체 파일)
- [x] 캘린더 특정기간 Date Range Picker 버그 수정 (시작일 클릭 시 팝업 닫힘 현상, 기간 하이라이트 추가)
- [x] 매출/분석 탭 메인 그래프에 판매수량 + 목표 대비 달성률 지표 추가
- [x] 매출/분석 탭 개별 상품 비교 라인 그래프 섹션 신설
- [x] 매출/분석 탭 툴팁에 전월 대비 증감률(%) + 전주 대비 증감률(%) 추가
- [x] 매출/분석 탭 AI 분석 결과 섹션 추가 (대필터+기간 단위 트리거)
- [x] 매출/분석 탭 수동 입력 메모 섹션 추가 (저장/불러오기, 대필터+기간 Key)
- [x] 프로모션 목표관리 탭 마진율 조정 기능 삭제

## 8차: 필터 성능 최적화 (2026-05-27)

- [x] sales_daily_mart 집계 테이블 구축 (sales_records → 일별/채널/분류 집계)
- [x] 마트 테이블 컬럼 길이 수정 (yearMonth varchar 16, yearStr varchar 8, weekLabel varchar 32)
- [x] DB 인덱스 추가 (salesDate, dept, channel, itemLarge, itemMid, 복합 인덱스 포함 11개)
- [x] getItemPerformanceFromMart 함수 추가 (마트 기반 빠른 조회)
- [x] getChannelDrilldownFromMart 함수 추가 (마트 기반 빠른 조회)
- [x] routers.ts: getItemPerf 마트 우선 조회로 전환 (폴백: 원본 테이블)
- [x] routers.ts: channel.getDrilldown 마트 우선 조회로 전환 (폴백: 원본 테이블)
- [x] 서버 시작 시 마트 자동 빌드 확인 (6681행 집계 완료)
- [x] 테스트 116개 모두 통과

## 9차 수정 요청 (2026-05-28)

- [x] [긴급] 마트 기반 조회로 인한 데이터 조회 안 되는 버그 수정 (원본 테이블 폴백 강화)
- [x] 매쳙/수익 분석 - 해당 월 목표, 해당 연도 전체 목표 KPI 카드 추가 (누적 목표는 유지)
- [x] 매쳙/수익 분석 - 매쳙 추세 그래프에 월별 목표 막대그래프 추가 (선+막대 혼합, 주간 필터 시 미표시)
- [x] 매쳙/수익 분석 - 분류별 비중 섹션에 소분류, 품명 탭 추가
- [x] 매쳙/수익 분석 - '메모' → '인사이트', '분석 메모' → '분석 인사이트' 텍스트 변경
- [x] 매쳙/수익 분석 - 그래프 가로 스크롤 적용 (데이터 많을 때 가독성)
- [x] 매쳙/수익 분석 - 신상품 탭 추가 (퀴칩 필터 옆, 눈에 띄는 색상, 수동 추가 가능)
- [x] 신상품 DB 테이블 추가 및 CRUD API 구현
- [x] 좌측 사이드바에서 'AI 분석 비서' 메뉴 삭제
- [x] 프로모션/목표 관리 - '목표 달성률' → '행사 목표 달성률' 텍스트 변경
- [x] 프로모션/목표 관리 - '5월 마감 예측 시뮬레이터' 섹션 삭제
- [x] 프로모션/목표 관리 - 프로모션 달력 크기 확대
- [x] 프로모션/목표 관리 - 프로모션 목록에 기간 필터 추가
- [x] 프로모션/목표 관리 - 프로모션 목록 시작일 기준 최신순 정렬

## 10차 수정 요청 (2026-05-28)

- [x] 신상품 버튼 클릭 시 신상품 데이터만 필터링 (AdminPage에서 품목 지정 UI 구현)
- [x] 기간 필터(DateRangeFilter) 전역 Context로 통합 - 페이지 이동 시 유지
- [x] 부서 필터(dept) 전역 Context로 통합 - 매쳙/수익 분석 ↔ 프로모션/목표 관리 공유
- [x] 노션 동기화 월별 오류 수정 (오류 메시지 상세 표시 개선)
- [x] 프로모션 목록 날짜 필터링 적용 안 되는 버그 수정
- [x] 달력 UI 세로폭 확대 (52px → 90px)

## 11차 수정 요청 (2026-05-29)

- [x] 5월 매출 중복 데이터 확인 및 동일 파일명 업로드 시 덮어쓰기 로직 수정 (이미 구현됨)
- [x] ChannelDetailPage 필터 전역 유지 (dateFilter 전역 Context 사용)
- [x] 사이드바 메뉴 순서 변경 (매출/수익, 채널별, 프로모션/목표, 재고, 네이버)
- [x] 매출 추세 그래프 교체 (매출=선그래프, 목표=막대그래프)
- [x] 신상품 수동 추가 UI 확인 (AdminPage 신상품 관리 탭 - 이미 구현됨)
- [x] 프로모션/목표 관리 - 품목별 목표 현황 섹션 삭제
- [x] 채널별 분석 페이지 - 이익률/평균이익률 제거 (ChannelPage + ChannelDetailPage)

## 12차 수정 요청 (2026-05-29)

- [x] Admin 페이지 UI 가독성 개선 (글씨 색상 밝게, 테이블 텍스트 가독성 향상)
- [x] 신상품 등록 다이얼로그: 품명 직접 입력 → DB 품명 목록에서 검색/선택으로 변경
- [x] 서버: sales_records에서 distinct 품명 목록 반환 API 추가 (newProducts.getDistinctSalesItemNames)
- [x] SalesPage 신상품 버튼 활성화 시 등록된 신상품 목록 카드 표시

## 13차 수정 요청 (2026-05-29)

- [x] Admin 신상품 관리 페이지 UI 가독성 개선 (다크→라이트 스타일, 진한 텍스트)
- [x] 신상품 등록 시 품명 선택하면 대/중/소분류 자동 채우기 (getItemMetaByName API 추가)
- [x] SalesPage 신상품 목록 카드 텍스트 진한 색으로 개선 (보라색 배경 + 진한 보라 텍스트)

## 14차 수정 요청 (2026-05-29)

- [x] SalesPage 매출 추세 그래프 범례 텍스트 수정 (매출=선, 목표=막대, 수량=우축)
- [x] 재고 가용 일수 분석 - 분석 설정 날짜 라벨 개선 (기준 시작일/종료일 + 설명 추가)
- [x] 재고 가용 일수 분석 - 예측 기간 설명 텍스트 추가
- [x] 재고 가용 일수 분석 - 재고 소진 예측 리스트에 검색 필터 추가 (품명/품번)
- [x] 재고 가용 일수 분석 - 대분류/중분류 드롭다운 필터 추가
- [x] 재고 가용 일수 분석 - 테이블에 대분류/중분류 컬럼 추가
- [x] 서버 doc.analyze API에 itemLarge/itemMid/itemSmall 반환 추가

## 15차 수정 요청 (2026-05-29)

- [x] SalesPage: 채널/대분류/중분류/소분류/품명 버튼 클릭 시 신상품 필터 자동 해제 (상호 배타)
- [x] 분석 인사이트 저장 단위: [필터+기간] → 6개 탭(채널/대분류/중분류/소분류/품명/신상품) 기준으로 분리 (filterKey에 __tab: 접미사 추가)
- [x] 탭 내 세부 버튼(채널명, 품명 등) 변경 시에도 해당 탭의 인사이트 유지

## 16차 수정 요청 (2026-05-29)

- [x] 신상품 목록 카드: 각 품명 배지에 X버튼 추가 → 클릭 시 해당 품목만 필터에서 제외
- [x] 매출/수익 분석 KPI: 매출이익 수치 수정 (grossProfit 재계산) + 공헌이익 카드 추가 (추후 개발 예정 표시)
- [x] 노션 프로모션 달력: 5월 외 다른 달 데이터도 가져오도록 수정
- [x] 채널별 분석 페이지: 행 클릭 시 상세 페이지 이동, 드롭다운 제거
- [x] 매출/수익 분석 페이지: 현재 필터 날짜 범위 메인에 표시

## 16차 수정 요청 (2026-06-01)

- [x] 신상품 목록 카드 각 품명 배지에 X버튼 추가 (클릭 시 해당 품목만 필터에서 제거)
- [x] 공헌이익 KPI 카드 추가 (추후 개발 예정 표시, N/A 값)
- [x] 매출/수익 분석 날짜 범위 메인 헤더 subtitle에 표시 (startDate ~ endDate)
- [x] 채널별 분석 행 클릭 시 채널 상세 페이지로 이동 (드롭다운 확장 제거, 상세 버튼 제거)
- [x] 노션 프로모션 달력 교차월 행사 처리 개선 (월 경계 클리핑으로 정확한 날짜 표시)

## 17차 수정 요청 (2026-06-02)

- [x] 노션 동기화 504 타임아웃 수정 (백그라운드 처리로 변경)
- [x] 매출/수익 분석 날짜 범위: 필터 날짜가 아닌 실제 매출 데이터 최신 판매일자 기준으로 표시
- [x] 채널별 분석 품목별 성과 섹션에 소분류 필터 추가

## 18차 수정 요청 (2026-06-02)

- [x] BOM 테이블 DB 스키마 추가 (품번, 원가) + 변동비 테이블 추가 (연도, 월, 금액)
- [x] BOM 파일 업로드 파이프라인 구현 (품번 매칭 원가 계산 - aggregateSales BOM LEFT JOIN으로 이미 구현됨)
- [x] 매출이익 = 매출액 - 원가(BOM 매칭), 이익률 = 매출이익/매출액 재계산 로직 적용
- [x] 관리자 페이지 월별 변동비 입력 폼 구현 (연도/월별 누적 저장)
- [x] 공헌이익 = 매출이익 - 변동비 안분(SKU별 매출 비율) 로직 구현
- [x] KPI/채널/상품 필터에 공헌이익 연동 (필터 조건별 정확한 공헌이익 출력)
- [x] 데이터 관리자 페이지 UI 가시성 개선 (텍스트 검정색, 호버 효과 제거)

## 18차 수정 완료 (2026-06-02)

- [x] BOM 매칭 매출이익 계산 로직 확인 (aggregateSales에서 BOM LEFT JOIN으로 이미 구현됨)
- [x] monthly_variable_costs DB 테이블 추가 및 마이그레이션 실행
- [x] 변동비 CRUD API 구현 (getAllVariableCosts, upsertVariableCost, deleteVariableCost)
- [x] 공헌이익 안분 로직 구현 (getContribMarginForPeriod - SKU별 매출 비율 안분)
- [x] kpi.getSummary에 contribMargin/contribMarginRate 반환 추가
- [x] KpiCards.tsx에 공헌이익 카드 실수치 연동 (변동비 입력 시 실수치 표시)
- [x] AdminPage.tsx 전체 라이트 테마로 재작성 (검정 텍스트, 흰 배경, 호버 효과 제거)
- [x] AdminPage.tsx 월별 변동비 탭 추가 (연도별 구분, 연간 합계, 안내 배너)

## 19차 수정 요청 (2026-06-04)

- [x] DB에서 타 부서 데이터 929,196행 삭제 (국내사업팀 데이터만 남김)
- [x] parseSalesFile 국내사업팀 행만 DB 저장 필터 추가
- [x] SalesPage, ChannelPage, TargetsPage, DocPage, MonthlyPage, AiPage 팀 선택 필터 제거 (dept='국내사업팀' 고정)
- [x] uploadRoute.ts: BOM/매출 파일 업로드 완료 시 rebuildMartFromAllRecords(true) 자동 호출
- [x] uploadRoute.ts: JobStatus에 step/progress 필드 추가 (parsing→rebuilding 단계 표시)
- [x] UploadPage.tsx: 진행률 바(Progress 컴포넌트) 추가 - step/progress 폴링 연동
- [x] UploadPage.tsx: 최대 대기 시간 5분 → 10분으로 연장
- [x] UploadPage.tsx: 완료 메시지에 martBuilt 행수 표시 + "이익률이 갱신되었습니다" 안내
- [x] UploadPage.tsx: BOM/매출 파일 유형에 "업로드 후 마트 자동 재빌드" 배지 표시
- [x] UploadPage.tsx: 업로드 중 파일 유형 선택 버튼 비활성화 (disabled)

## 20차 수정 요청 (2026-06-04) - 네이버 랭킹 시스템 전면 업그레이드

- [x] DB 스키마: naver_brand_keywords 테이블 추가 (브랜드 강조 키워드 영구 저장)
- [x] 백엔드: 브랜드 키워드 CRUD API (getBrandKeywords, addBrandKeyword, removeBrandKeyword)
- [x] 백엔드: 메모 저장 시 구글 시트 H열 업데이트 (updateSheetNote)
- [x] 백엔드: 멀티 상품 히스토리 조회 (getRankingHistoryMulti)
- [x] 백엔드: 급상승 TOP5 요약 API (getTopRisers)
- [x] naverSheetSync.ts: I열 브랜드 키워드 읽기/쓰기 (readBrandKeywordsFromSheet, writeBrandKeywordsToSheet)
- [x] 프론트엔드: 브랜드 태그 관리 UI (추가/삭제, 구글 시트 I열 + DB 동기화)
- [x] 프론트엔드: 브랜드 하이라이트 행 (노란 배경, 상품명/판매처 매칭)
- [x] 프론트엔드: 강조 브랜드만 필터 체크박스
- [x] 프론트엔드: 행 클릭 시 메모 모달 (일시/상품명 표시, H열 업데이트)
- [x] 프론트엔드: 멀티 선택 트렌드 그래프 (40위 빨간 점선 기준선)
- [x] 프론트엔드: 급상승 TOP5 요약 카드 (상단 대시보드)

## 21차 수정 요청 (2026-06-04) - 키워드 기본값 전체 + 검색 Combobox

- [x] NaverRankingPage: 키워드 기본값 "전체" (keyword="") 설정 - 첫 진입 시 전체 데이터 표시
- [x] NaverRankingPage: 키워드 Select → 검색 가능한 Combobox (Popover + Command 패턴) 교체
- [x] NaverRankingPage: 드롭다운 상단에 "전체" 옵션 추가
- [x] NaverRankingPage: getDates/getRankings enabled 조건 `!!keyword` → `true` 수정 (전체 모드 지원)
- [x] NaverRankingPage: TopRisersCard enabled 조건 `!!keyword` → `true` 수정 (전체 모드 지원)
- [x] NaverRankingPage: 전체 모드에서 트렌드 그래프 버튼 비활성화 (백엔드 미지원)
- [x] NaverRankingPage: 전체 모드에서 단일/멀티 트렌드 모달 미표시 조건 추가
- [x] NaverRankingPage: 키워드 자동 선택 useEffect 제거 (전체가 기본값이므로 불필요)

## 22차 수정 요청 (2026-06-04) - 네이버 랭킹 UI 개선

- [ ] 백엔드: 전체 모드(keyword="") getRankings - 최신 recordedDate 기준 1~80위 전체 표시 (현재 1위만 나오는 버그 수정)
- [ ] 프론트엔드: 테이블 그래프 버튼 열 완전 제거 (thead + tbody)
- [ ] 프론트엔드: 그래프 섹션을 테이블 아래 별도 독립 섹션으로 분리 (상품별 순위 히스토리)
- [ ] 프론트엔드: 순위 변동 배지 정렬 개선 - 변동 없는 행과 변동 있는 행의 순위 텍스트 라인 맞춤 (고정 너비 레이아웃)

## 23차 수정 요청 (2026-06-04) - 네이버 랭킹 전체 모드 정렬 재수정 + 그래프 섹션 수정
- [ ] 전체 모드 정렬: keyword ASC, rank ASC (키워드별 그룹화하여 각 키워드 1~80위 순서대로 표시)
- [ ] 그래프 섹션 표시 문제 수정 (현재 그래프가 보이지 않음)
- [ ] 상품별 순위 히스토리 차트 전용 섹션 구현 (즐겨찾기 기반 멀티셀렉트, Y축 반전, 40위 기준선)

## 24차 수정 요청 (2026-06-04) - NaverRankingPage 전면 개편
- [ ] 즐겨찾기를 리스트 단위가 아닌 상품코드 단위로 변경 (DB 스키마 수정)
- [ ] 날짜 필터에 "전체" 옵션 추가 + 캘린더 UI로 변경
- [ ] 탭 구조 재편: 순위현황 탭(급상승Top5+브랜드키워드관리+그래프) + 전체리스트 탭(필터+테이블 200개)
- [ ] 그래프 상품 검색 기능 추가 (즐겨찾기 상품 최상단 표시)
- [ ] 즐겨찾기 관리 모달 추가 (추가/삭제)

## 25차 수정 요청 (2026-06-04) - 그래프 UI 개선
- [ ] 매출 카드 X축 너비 꽉 차도록 수정
- [ ] 매출 추세 그래프 X축 스크롤 추가 (전체 데이터 표시)
- [ ] 개별 상품 추세 비교 그래프 X축 스크롤 추가
- [ ] 네이버 랭킹 그래프: 키워드 선택 제거, 상품 검색만으로 그래프 추가
- [ ] 동일 상품이 여러 키워드에 있으면 키워드별로 각각 라인 표시
- [ ] 키워드별 라인 on/off 토글
