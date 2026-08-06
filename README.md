# 발주 관리 시스템

FastAPI + Supabase 기반 실시간 공유 발주 관리 웹 애플리케이션입니다.
팀원 간 발주 현황을 실시간으로 공유하고, 상품별 입고 단계를 단계별로 추적합니다.

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| Backend | FastAPI 0.111.0, Uvicorn 0.30.1 |
| Database | Supabase (PostgreSQL + Realtime) |
| Frontend | Vanilla JS (Supabase JS SDK v2) |
| Template | Jinja2 |
| 환경 변수 | python-dotenv |

---

## 프로젝트 구조

```
order-management/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI 앱 설정, CORS, 라우터 등록
│   ├── db.py            # Supabase 클라이언트 싱글톤
│   ├── schemas.py       # Pydantic 모델 (OrderBase / OrderCreate / OrderUpdate / OrderOut)
│   └── routers/
│       └── orders.py    # CRUD API 엔드포인트
├── static/
│   ├── css/style.css    # 전체 UI 스타일
│   └── js/app.js        # Supabase Realtime 포함 프론트엔드 로직
├── templates/
│   └── index.html       # SPA 템플릿 (통계 카드, 필터, 테이블, 모달)
├── supabase_schema.sql  # DB 스키마, RLS 정책, Realtime 설정
├── requirements.txt
├── .env                 # 환경 변수 (Git 제외 권장)
└── main.py              # 실행 진입점 (uvicorn)
```

---

## DB 스키마

Supabase `orders` 테이블 구조입니다.

| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `id` | uuid | gen_random_uuid() | PK |
| `sku` | text | — | SKU 코드 (필수) |
| `name` | text | — | 상품명 (필수) |
| `category` | text | — | 카테고리 (필수) |
| `qty` | integer | 0 | 주문 수량 |
| `broken` | integer | 0 | 파손 물량 |
| `extra_qty` | integer | 0 | 추가 주문 수량 |
| `factory_arrived` | boolean | false | 공장 도착 여부 |
| `factory_inspected` | boolean | false | 공장 검수 여부 |
| `rocket_arrived` | boolean | false | 로켓그로스 도착 여부 |
| `note` | text | null | 비고 |
| `created_at` | timestamptz | now() | 생성 시각 |
| `updated_at` | timestamptz | now() | 수정 시각 (트리거 자동 갱신) |

> RLS는 공개 읽기/쓰기 정책으로 설정되어 있습니다 (팀 공유 목적).  
> 운영 환경에서는 인증 기반 RLS 정책으로 교체를 권장합니다.

---

## 설치 및 실행

### 1. Supabase 설정

1. [supabase.com](https://supabase.com)에서 프로젝트 생성
2. **SQL Editor** → `supabase_schema.sql` 전체 내용을 붙여넣고 실행
3. **Project Settings → API**에서 `URL`과 `anon public key` 복사

### 2. 환경 변수 설정

`.env` 파일을 생성하고 아래 내용을 입력합니다.

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-public-key
```

### 3. 패키지 설치

```bash
pip install -r requirements.txt
```

### 4. 서버 실행

```bash
python main.py
```

브라우저에서 `http://localhost:8000` 접속

---

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/orders` | 전체 목록 조회 (생성일 내림차순) |
| POST | `/api/orders` | 상품 추가 |
| PATCH | `/api/orders/{id}` | 상품 부분 수정 |
| DELETE | `/api/orders/{id}` | 상품 삭제 |

Swagger UI: `http://localhost:8000/docs`

### 요청/응답 예시

**POST `/api/orders`**

```json
{
  "sku": "SKU-001",
  "name": "에어팟 케이스",
  "category": "전자기기",
  "qty": 100,
  "broken": 0,
  "factory_arrived": false,
  "factory_inspected": false,
  "rocket_arrived": false,
  "extra_qty": 0,
  "note": "1차 발주"
}
```

**PATCH `/api/orders/{id}`** — 변경할 필드만 전송

```json
{
  "factory_arrived": true,
  "factory_inspected": true
}
```

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 실시간 동기화 | Supabase Realtime (PostgreSQL CDC)으로 팀원 변경 사항 즉시 반영 |
| 자동 정렬 | 진행 중 상품 상단 고정, 로켓그로스 도착 시 자동 하단 이동 |
| 카테고리 필터 | 색상 구분 배지 + 드롭다운 필터 |
| 중복 감지 | 동일 상품명 자동 감지 및 통계 카드 표시 |
| 사용 가능 물량 | `qty - broken` 자동 계산 표시 |
| CSV 내보내기 | 현재 필터 기준 데이터를 엑셀 호환 CSV로 저장 |
| 통계 대시보드 | 전체 상품 수 / 진행 중 / 로켓그로스 도착 / 카테고리 수 요약 |

---

## 배포

| 방식 | 방법 |
|------|------|
| 로컬 | `python main.py` → `http://localhost:8000` |
| 외부 공유 (임시) | `ngrok http 8000` |
| 클라우드 | Railway / Render / EC2 등 — `SUPABASE_URL`, `SUPABASE_KEY` 환경 변수 설정 필요 |

---

## 주의 사항

- `.env` 파일에 실제 Supabase 키가 포함되므로 `.gitignore`에 반드시 추가하세요.
- 현재 RLS 정책은 인증 없이 누구나 읽기/쓰기가 가능합니다. 외부 공개 시 인증 기반 정책으로 교체를 권장합니다.
- `updated_at`은 DB 트리거로 자동 갱신됩니다. 애플리케이션 레벨에서 별도 처리 불필요합니다.