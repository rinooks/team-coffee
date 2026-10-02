# ☕ 우리 팀 커피타임

팀원들의 커피 주문을 한 화면에 모아 주문서로 복사해 주는 작은 앱입니다.
정적 SPA(`index.html` + `styles.css` + `app.js`) + Vercel Serverless Functions(`api/`) + Turso(libSQL) 구성이며 빌드 과정이 없습니다.

## 구조

```
index.html / styles.css / app.js   프런트엔드 (바닐라 JS)
menu.json                          카페별 메뉴·가격 (정적 파일)
api/orders/index.js                GET·POST /api/orders
api/orders/[id].js                 DELETE /api/orders/:id
api/settings.js                    GET·PUT /api/settings
api/reset.js                       POST /api/reset
lib/api/db.js                      Turso 클라이언트 싱글톤 (+ 스키마 자동 보장)
lib/api/http.js, settings.js       공통 검증·응답·rate limit 헬퍼
schema.sql                         DB 스키마
```

## Turso 초기화

```bash
turso db create team-coffee
turso db shell team-coffee < schema.sql

# 접속 정보 확인
turso db show team-coffee --url
turso db tokens create team-coffee
```

> 함수가 처음 DB에 붙을 때 `CREATE TABLE IF NOT EXISTS`를 한 번 실행하므로 `schema.sql` 적용을 깜빡해도 동작은 합니다.

## 환경변수

| 이름 | 설명 |
| --- | --- |
| `TURSO_DATABASE_URL` | `libsql://team-coffee-<org>.turso.io` |
| `TURSO_AUTH_TOKEN` | `turso db tokens create team-coffee` 로 발급한 토큰 |

- 로컬: `.env.example`을 `.env.local`로 복사해 값을 채웁니다 (git에 올라가지 않음).
- Vercel: Project → Settings → Environment Variables에 두 값을 등록하거나 `vercel env add TURSO_DATABASE_URL` 등으로 추가합니다.
  시크릿은 `vercel env pull`로 옮기면 `[SENSITIVE]`로 가려지니, 다른 프로젝트로 옮길 때는 토큰을 새로 발급해 직접 등록하세요.
  환경변수를 바꾼 뒤에는 재배포해야 반영됩니다.

## 로컬 실행

```bash
npm install
npx vercel dev        # http://localhost:3000
```

Turso 없이 빠르게 확인하려면 로컬 SQLite 파일도 됩니다: `.env.local`에 `TURSO_DATABASE_URL=file:local.db` (토큰 비움).

## API

인증 없음(팀 내부용). 모든 날짜는 KST 기준 `YYYY-MM-DD`.

| 메서드 | 경로 | 본문/쿼리 | 설명 |
| --- | --- | --- | --- |
| GET | `/api/orders?date=YYYY-MM-DD` | date 생략 시 오늘 | 주문 목록 `{date, orders}` (token은 응답에 포함되지 않음) |
| POST | `/api/orders` | `{name, cafe, menu, price, temp, note?, token}` | 주문 생성 → `201 {order}`. 마감 상태면 409, IP당 분당 30회 초과 시 429 |
| DELETE | `/api/orders/:id` | `{token}` | token 일치 시 삭제, 불일치 403, 없는 주문 404 |
| GET | `/api/settings` | – | `{today_cafe, is_closed}` (기본 `메가커피`, `false`) |
| PUT | `/api/settings` | `{today_cafe?, is_closed?}` | 부분 업데이트 후 최신 설정 반환 |
| POST | `/api/reset` | `{date}` | 해당 날짜 주문 전부 삭제 (설정은 유지) → `{deleted}` |

검증 규칙: `cafe`는 메가커피/컴포즈커피/바나프레소, `temp`는 HOT/ICE, `price`는 양의 정수, `name` ≤ 20자, `note` ≤ 100자, `token` 16~128자.

## 메뉴 수정

`menu.json`을 직접 고치면 됩니다. 항목 형식:

```json
{"id":"mega-01","name":"아메리카노","price_hot":1700,"price_ice":2000,"category":"커피","temps":["HOT","ICE"]}
{"id":"mega-02","name":"메가리카노","price":3000,"category":"커피","temps":["HOT","ICE"]}
```

`category`는 `커피` / `라떼` / `티·에이드` / `스무디·프라페`, `temps`는 `["HOT","ICE"]` 또는 `["ICE"]`.
가격은 2026년 10월 기준이며 매장별로 다를 수 있습니다.
