# tapeletter API 계약서

tapeletter(테이프레터) 앱(`tapeletter-app`, Flutter)과 이 서버(`tapeletter-api`) 사이의 **단일 계약서**다. 앱은 이 문서만 보고 맞춘다.
서버를 바꾸면 이 문서를 같은 커밋에서 고친다. 맨 아래 "변경 이력"에 한 줄 남긴다.

- 상태 표시: ✅ 구현됨 · ⏳ 예정 (경로·모양은 확정안이지만 구현하면서 바뀔 수 있다. 바뀌면 변경 이력에 적는다)
- 수치·문구의 정답은 디자인 원본 `design_handoff_cassette_app/source/TapeletterApp.logic.js`다.

## 목차
1. [공통 규칙](#1-공통-규칙)
2. [공통 타입](#2-공통-타입)
3. [오류 코드](#3-오류-코드)
4. [엔드포인트 한눈에 보기](#4-엔드포인트-한눈에-보기)
5. [app-version](#5-app-version) · [auth](#6-auth) · [users](#7-users) · [friends](#8-friends) · [recordings](#9-recordings) · [deliveries](#10-deliveries) · [shelf](#11-shelf) · [share](#12-share) · [wallet](#13-wallet) · [shop](#14-shop) · [billing](#15-billing) · [notifications](#16-notifications) · [dev](#17-dev-개발-전용)
6. [로컬 개발 서버에 붙기](#0-로컬-개발-서버에-붙기) · [화면 → API 대응표](#18-화면--api-대응표-디자인-v2)
7. [회원 탈퇴 데이터 정책](#19-회원-탈퇴-데이터-정책)
8. [변경 이력](#20-변경-이력)

---

## 0. 로컬 개발 서버에 붙기

S3 저장소·ffmpeg 없이 맥 한 대로 전체 흐름(녹음 업로드 → 변환 → 보내기 → 재생, 상점, 크레딧)을 돌릴 수 있다.

1. 서버 실행 (`tapeletter-api`에서)
   ```bash
   cp .env.example .env            # 처음 한 번. DATABASE_URL, JWT_SECRET, PUBLIC_BASE_URL 채우기
   createdb cassette_dev           # 처음 한 번 (Homebrew Postgres)
   npm run migration:run
   npm run start:dev               # http://<맥 IP>:3000/api
   ```
   - 실기기·에뮬레이터에서 붙으면 `.env`의 `PUBLIC_BASE_URL`을 **기기에서 닿는 주소**(예: `http://192.168.0.10:3000`)로 바꾼다. 업로드·재생 URL과 링크 주소가 이 값으로 만들어진다. (Android 에뮬레이터는 `http://10.0.2.2:3000`)
2. 저장소·변환 모드 (개발 기본값)
   | 환경 변수 | 개발 | 운영 |
   |---|---|---|
   | `STORAGE_DRIVER` | `local`: 파일을 `.data/storage`에 두고, 업로드·재생은 API의 서명 URL(`PUT/GET /api/dev-storage/{key}?op=&exp=&ct=&sig=`) | `s3` (SeaweedFS / R2 presigned URL). 운영에서 `local`이면 서버가 시작하지 않는다 |
   | `FFMPEG_MODE` | `passthrough`: 원본을 그대로 결과로 쓰고, 길이는 앱이 알린 `durationMs` | `real` (강제) |
   - 앱 코드는 드라이버와 상관없이 같다: `upload.url` + `upload.headers`로 PUT, `preview.url` / 재생 `url`로 GET. 서명 URL은 Range 요청도 된다.
   - 실제 테이프 소리를 들으려면 `brew install ffmpeg` 후 `FFMPEG_MODE=real`.
3. 개발 로그인: `POST /api/auth/dev { "key": "minkyung", "name": "민경" }` → `accessToken`
4. 프로토타입 초기 데이터: `POST /api/dev/seed` (Bearer) → 친구 6명, 분류 안 함 2개(안 뜯음, 1개는 링크로 받음), 칸 3개(테이프 8개), 보낸 기록 4개, 크레딧 120 + 내역 5줄, 1분 테이프 2개, 서랍 12. 오디오는 생성한 톤(WAV, 3~6초)이라 바로 재생된다. 다시 부르면 그 계정의 테이프·친구·내역을 지우고 새로 만든다.
   - 친구만 따로: `POST /api/dev/friends { "name": "지현", "starred": true }`
5. 크레딧: 스토어 결제와 AdMob 콜백은 로컬에서 받을 수 없으니 `POST /api/dev/credits`를 쓴다 ([17. dev](#17-dev-개발-전용)).
6. 두 기기로 주고받기: 각 기기에서 다른 `key`로 개발 로그인 → 한쪽에서 `POST /api/dev/friends { "userId": "<상대 id>" }`.

---

## 1. 공통 규칙

| 항목 | 규칙 |
|---|---|
| 기본 주소 | 개발: `http://<맥 IP>:3000/api` · 운영: `https://<도메인>/api` (Cloudflare Tunnel) |
| 전역 prefix | 모든 API는 `/api`로 시작한다. 예외: 링크 웹 페이지 `GET /t/{token}`과 공유 이미지 `GET /t/{token}/*.png`, `/.well-known/*`. 루트 `/`(소개 사이트)는 api가 아니라 edge Caddy가 정적으로 서빙한다(`docs/deploy.md` 3-1) |
| 형식 | 요청·응답 모두 JSON (`Content-Type: application/json`), 키는 **camelCase** |
| 날짜 | ISO 8601 UTC 문자열. 예: `"2026-09-25T06:34:46.549Z"`. 화면의 `09.25`는 앱이 기기 시간대로 바꿔 만든다 |
| ID | 모두 UUID 문자열 |
| 테이프 종류 | `tapeType`: 정수 `15` · `60` · `180` = **녹음 한도(초)**. 15초(무료·무제한) · 1분 · 3분(구매해서 보낼 때 1개씩 차감). 옛 코드 `1`·`3`·`5`는 받지 않는다(`400 VALIDATION_FAILED`) |
| 인증 | `Authorization: Bearer <accessToken>`. `@공개`라고 적힌 API만 없어도 된다 |
| 멱등 | 보내기·구매·선물·결제 확인은 `Idempotency-Key` 헤더가 **필수**다 (아래) |
| 빈 응답 | 돌려줄 게 없으면 `204 No Content` |
| 목록 | `{ "items": [...] }`. 페이지가 있으면 `{ "items": [...], "nextCursor": "..." \| null }`, 요청은 `?cursor=&limit=` (limit 기본 30, 최대 100) |
| 모르는 필드 | 요청 본문에 문서에 없는 필드가 있으면 `400 VALIDATION_FAILED` |
| 요청 횟수 제한 | 공개 엔드포인트(auth: IP당 1분 20번, 링크 웹 페이지·`/share/*/web`: 60번, `/share/*/web/audio`: 30번)는 넘으면 `429 RATE_LIMITED` |

### 인증 흐름
1. 카카오/Apple SDK로 로그인 → 받은 토큰을 `POST /auth/kakao` 또는 `POST /auth/apple`로 보낸다.
2. 응답의 `accessToken`(기본 1시간)과 `refreshToken`(기본 60일)을 안전한 저장소(Keychain/Keystore)에 둔다.
3. API가 `401 UNAUTHORIZED`를 주면 `POST /auth/refresh`로 새 토큰 쌍을 받고 원래 요청을 한 번 다시 보낸다.
   - refresh token은 **한 번 쓰면 사라진다**(회전). 새로 받은 refresh token으로 바꿔 저장한다.
   - 동시에 여러 요청이 401을 받으면 refresh는 한 번만 부르고 나머지는 기다리게 한다(단일 비행).
4. refresh도 `401 INVALID_REFRESH_TOKEN`이면 로그인 화면으로 보낸다.
5. `user.name`이 `null`이면 이름 정하기 화면(`auName`)부터 시작한다.

### 멱등 (`Idempotency-Key`)
- 값: 요청마다 새로 만든 UUID v4 (8~255자, `[A-Za-z0-9_-:.]`). **재시도할 때는 같은 값**을 쓴다.
- 서버는 (사용자, 키)로 첫 응답을 저장해 두었다가, 같은 키로 다시 오면 처리하지 않고 **첫 응답을 그대로** 돌려준다. 이때 응답 헤더 `Idempotent-Replayed: true`가 붙는다.
- 첫 요청이 오류로 끝났으면 키는 풀린다(같은 키로 다시 시도 가능).
- 같은 키를 다른 본문·경로에 쓰면 `422 IDEMPOTENCY_KEY_REUSED`, 첫 요청이 아직 처리 중이면 `409 IDEMPOTENCY_IN_PROGRESS`(잠시 뒤 같은 키로 재시도).
- 헤더가 없으면 `400 IDEMPOTENCY_KEY_REQUIRED`.
- 저장 기간: 24시간 (매시간 정리 작업이 지운다).

### 오류 형식
모든 오류는 같은 모양이다.
```json
{ "code": "INSUFFICIENT_CREDITS", "message": "크레딧이 부족해요", "need": 20 }
```
- `code`: 대문자 스네이크. **앱은 `code`로 분기한다.**
- `message`: 디자인 톤의 한국어. 그대로 토스트에 띄워도 된다.
- 일부 오류는 화면에 필요한 값을 함께 준다 (표의 "추가 필드").
- `5xx`는 서버 오류 화면(`serverOn`, 다시 시도), 네트워크 끊김은 오프라인 배너(`offlineOn`)로 처리한다.

---

## 2. 공통 타입

### Me ✅
`GET /users/me`, 로그인 응답의 `user`.
```json
{
  "id": "d3d62aa5-39ec-41ac-b771-f642d4ac4b87",
  "name": "민경",
  "credits": 120,
  "drawer": { "stored": 11, "cap": 12, "full": false, "unopenedCount": 1 },
  "tapes": [
    { "tapeType": 15, "qty": null },
    { "tapeType": 60, "qty": 2 },
    { "tapeType": 180, "qty": 0 }
  ],
  "stats": { "receivedCount": 11, "sentCount": 4, "friendCount": 6 },
  "providers": ["kakao"],
  "notificationsEnabled": true,
  "createdAt": "2026-09-01T03:00:00.000Z"
}
```
| 필드 | 설명 |
|---|---|
| `name` | 친구에게 보이는 이름, 최대 8자. 가입 직후 `null` |
| `drawer.stored` | 보관 중인 테이프 수(분류 안 함 + 모든 칸) |
| `drawer.full` | `stored >= cap`. 서랍 꽉 참 배너(`fullOn`) |
| `drawer.unopenedCount` | "분류 안 함"의 안 뜯은 소포 수. 탭바 서랍 레드 점(`hasNew`) — 앱은 탭바 때문에 이 API를 자주 불러도 된다 |
| `tapes` | 보유 테이프. 항상 15·60·180 순서 3개. 15초는 무제한이라 `qty: null`("무료") |
| `stats.receivedCount` | 받은 테이프 수 = 보관량 (디자인과 같음) |
| `stats.sentCount` | 보낸 테이프 수 (링크로 보낸 것 포함) |
| `stats.friendCount` | 친구 수 (차단한 사람 제외) |
| `providers` | 연결된 계정 (`kakao` · `apple` · `dev`) — 설정 > 연결된 계정 |

### 별명 (nickname) ✅
상대 사용자를 보여 주는 모든 응답은 원래 이름 `name`과 함께 **내가 붙인 별명 `nickname`**(없으면 `null`)을 준다. 앱은 **`nickname ?? name`**으로 표시한다. 별명은 나에게만 보이고 상대에게는 영향이 없다(친구 관계가 방향이 있어서 내 쪽 줄에만 저장).

| 응답 | 필드 |
|---|---|
| Friend (`GET /friends`, `PATCH /friends/{id}`, 친구 화면의 `friend`, 링크 받기의 `friend`) | `nickname` |
| BlockedUser (`GET /friends/blocks`, `POST /friends/{id}/block`) | `nickname`(차단할 때 붙어 있던 별명) |
| ShelfItem.`sender` (서랍, 받은 테이프, 뜯기, 친구 화면, 옮기기, 링크 받기) | `sender.nickname` |
| SentTape.`recipient` (보낸 테이프 목록·상세, 보내기 응답) | `recipient.nickname` |
| `GET /share/{token}`의 `sender` | 보낸 사람이 이미 내 친구면 별명 |

- 푸시("○○님이 테이프를 보냈어요", 선물, 링크 받음)는 **알림을 받는 사람이 붙인 별명**이 있으면 그 별명을 쓴다.
- 크레딧 내역의 선물 문구("○○님이 선물", "○○님에게 선물")는 **원래 이름으로 기록한다**. 원장은 고치지 않는 기록이라, 나중에 별명을 바꾸거나 지워도 내역이 달라지지 않게 하려는 것이다. 이미 저장된 문구에도 소급하지 않는다.
- 웹 링크 페이지(`/t/{token}`, `/share/{token}/web`)는 로그인이 없어 원래 이름만 쓴다.

### Friend ✅
```json
{ "userId": "7347352a-…", "name": "고동민", "nickname": "동민이", "starred": true, "lastAt": "2026-09-24T09:00:00.000Z" }
```
- `lastAt`: 마지막으로 테이프를 주고받은 시각. 없으면 `null` ("최근 -")
- 이름을 아직 안 정한 사용자는 `name: "이름 없음"`

### BlockedUser ✅
```json
{ "userId": "…", "name": "민수", "nickname": null, "blockedAt": "2026-09-25T06:00:00.000Z" }
```

### Tag ✅
테이프 라벨 태그. **선택 값이고 없으면 `null`**(디자인 v2에는 태그를 고르거나 보여 주는 화면이 없어서 앱은 보내지 않는다). 서버는 코드만 저장한다.
| code | 앱 문구 (`TAGS`) |
|---|---|
| `birthday` | 생일 축하해 |
| `congrats` | 축하해요 |
| `thinking` | 그냥, 생각나서 |

### ShelfItem (받은 테이프) ✅
```json
{
  "id": "delivery uuid",
  "sender": { "userId": "…", "name": "지현", "nickname": null },
  "tapeType": 60,
  "durationMs": 34000,
  "tag": "birthday",
  "sentAt": "2026-09-24T09:00:00.000Z",
  "opened": false,
  "openedAt": null,
  "viaLink": false,
  "groupId": null,
  "memo": null
}
```
- `groupId: null` = "분류 안 함". `opened: false`면 소포 상태(`boxed`, "소포 도착")
- 보낸 사람이 탈퇴했으면 `sender.userId: null`, `name`은 보낼 때의 이름
- `durationMs`: **변환 후 ffprobe로 잰 실제 길이**. 재생 화면은 이 값을 쓴다(디자인의 `DUR`은 쓰지 않는다)
- `viaLink`: 링크로 받은 테이프(소포 화면의 `viaLink` 칩)
- `memo`: 받는 사람이 남긴 메모(없으면 `null`, 최대 40자). **나에게만 보이고** 보낸 사람 응답(SentTape)에는 없다. 바꾸기는 `PUT /shelf/items/{id}/memo`

### SentTape (보낸 테이프) ✅
```json
{
  "id": "delivery uuid",
  "recipient": { "userId": "…", "name": "엄마", "nickname": "우리 엄마" },
  "linkName": null,
  "tapeType": 180,
  "durationMs": 120000,
  "tag": "thinking",
  "sentAt": "2026-09-10T09:00:00.000Z",
  "status": "opened",
  "claimedAt": "2026-09-10T09:00:00.000Z",
  "openedAt": "2026-09-11T02:00:00.000Z",
  "share": null
}
```
| status | 목록 문구 | 상세 문구(`sdStatus`) |
|---|---|---|
| `link_pending` | 링크 대기 | 아직 아무도 받지 않았어요 (+ 링크 다시 공유하기) |
| `link_expired` | 링크 만료 | 링크가 만료됐어요 |
| `unopened` | 안 뜯음 | 아직 소포를 안 뜯었어요 |
| `opened` | `MM.DD 들음` | `MM.DD에 들었어요` |

- 링크로 보냈으면 `recipient`는 받기 전까지 `null`, `linkName`은 라벨에 적은 이름(**이름을 안 적었으면 `null`**), `share`는 `{ "url", "expiresAt" }`
- **받은 뒤에는 `recipient`가 채워진다**(받은 사람의 실제 이름 `name`, 내가 붙인 별명 `nickname`). `linkName`은 적은 그대로 남는다
- 앱 표시 이름 순서: `recipient`가 있으면 **`recipient`를 우선**(`nickname` → `name`), 없으면 `linkName`, 그것도 `null`이면 "새 친구"
- **재생 URL은 없다.** 보낸 사람은 들을 수 없다("테이프는 이제 받는 사람만 들을 수 있어요")
- 받는 사람이 나를 차단해서 전달되지 않은 테이프도 계속 `unopened`로 보인다
- 받는 사람이 서랍에서 지워도 보낸 테이프 목록에는 남는다. 받는 사람이 탈퇴하면 목록에서 사라진다

### LedgerEntry ✅
```json
{ "id": "…", "delta": -30, "reason": "1분 테이프 구매", "kind": "tape_purchase", "createdAt": "…" }
```
| kind | reason 문구 (디자인 원본) |
|---|---|
| `signup_gift` | 가입 선물 (가입할 때 10 크레딧) |
| `ad_reward` | 광고 보상 |
| `iap` | 크레딧 충전 · ₩1,100 / ₩5,500 / ₩11,000 |
| `tape_purchase` | 1분 테이프 구매 / 1분 테이프 5개 구매 / 3분 테이프 구매 / 3분 테이프 5개 구매 |
| `drawer_expand` | 서랍 넓히기 |
| `gift_sent` | {이름}님에게 선물 |
| `gift_received` | {이름}님이 선물 (별명이 아니라 원래 이름으로 기록) |
| `refund` | 크레딧 충전 취소 · ₩1,100 (스토어 환불) |
| `admin` | 개발용 지급 (개발 전용) |

앱은 `delta > 0`이면 `+10`(잉크), 아니면 `−30`(회색)으로 그린다.

---

## 3. 오류 코드

| code | HTTP | message | 추가 필드 | 상태 |
|---|---|---|---|---|
| `VALIDATION_FAILED` | 400 | 입력한 내용을 다시 확인해 주세요 | `fields: string[]` | ✅ |
| `UNAUTHORIZED` | 401 | 다시 로그인해 주세요 | | ✅ |
| `FORBIDDEN` | 403 | 할 수 없는 요청이에요 | | ✅ |
| `NOT_FOUND` | 404 | 찾을 수 없어요 | | ✅ |
| `RATE_LIMITED` | 429 | 잠시 후에 다시 시도해 주세요 | | ✅ |
| `INTERNAL_ERROR` | 500 | 잠시 문제가 생겼어요. 다시 시도해 주세요 | | ✅ |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | 요청을 다시 보내 주세요 | | ✅ |
| `IDEMPOTENCY_KEY_REUSED` | 422 | 이미 다른 요청에 쓴 키예요 | | ✅ |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | 처리하고 있어요. 잠시만 기다려 주세요 | | ✅ |
| `SOCIAL_TOKEN_INVALID` | 401 | 로그인하지 못했어요. 다시 시도해 주세요 | | ✅ |
| `SOCIAL_PROVIDER_UNAVAILABLE` | 503 | 로그인 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요 | | ✅ |
| `REJOIN_RESTRICTED` | 403 | 탈퇴 후 30일 동안은 다시 가입할 수 없어요 | `availableAt` (다시 가입할 수 있는 시각, ISO) | ✅ |
| `INVALID_REFRESH_TOKEN` | 401 | 다시 로그인해 주세요 | | ✅ |
| `USER_NOT_FOUND` | 404 | 찾을 수 없는 사용자예요 | | ✅ |
| `INVALID_NAME` | 400 | 이름은 1~8자로 적어주세요 | | ✅ |
| `FRIEND_NOT_FOUND` | 404 | 친구 목록에 없는 사람이에요 | | ✅ |
| `INVALID_NICKNAME` | 400 | 별명은 10자까지 적을 수 있어요 | | ✅ |
| `CANNOT_BLOCK_SELF` | 400 | 나는 차단할 수 없어요 | | ✅ |
| `BLOCK_NOT_FOUND` | 404 | 차단한 친구가 아니에요 | | ✅ |
| `INSUFFICIENT_CREDITS` | 402 | 크레딧이 부족해요 | `need: number` (모자란 크레딧, charge 시트) | ✅ |
| `NO_TAPE_LEFT` | 409 | 테이프가 없어요. 상점에서 채워 주세요 | `tapeType` | ✅ |
| `RECORDING_NOT_FOUND` | 404 | 녹음을 찾을 수 없어요 | | ✅ |
| `RECORDING_NOT_READY` | 409 | 테이프 소리로 바꾸는 중이에요 | `status` | ✅ |
| `RECORDING_TOO_LONG` | 400 | 테이프 길이를 넘었어요 | | ✅ |
| `RECORDING_TOO_LARGE` | 400 | 녹음 파일이 너무 커요 | | ✅ |
| `RECORDING_ALREADY_SENT` | 409 | 이미 보낸 녹음이에요 | | ✅ |
| `UPLOAD_NOT_FOUND` | 409 | 녹음 파일을 올리지 못했어요. 다시 시도해 주세요 | | ✅ |
| `NOT_FRIEND` | 403 | 친구에게만 보낼 수 있어요 | | ✅ |
| `TAPE_NOT_FOUND` | 404 | 테이프를 찾을 수 없어요 | | ✅ |
| `TAPE_NOT_OPENED` | 409 | 소포를 먼저 뜯어 주세요 | | ✅ |
| `INVALID_MEMO` | 400 | 메모는 40자까지 적을 수 있어요 | | ✅ |
| `AUDIO_NOT_READY` | 409 | 테이프를 불러오지 못했어요 | | ✅ |
| `GROUP_NOT_FOUND` | 404 | 칸을 찾을 수 없어요 | | ✅ |
| `INVALID_GROUP_NAME` | 400 | 칸 이름은 1~12자로 적어주세요 | | ✅ |
| `LINK_NOT_FOUND` | 404 | 링크를 찾을 수 없어요 | | ✅ |
| `LINK_TAKEN` | 409 | 이미 다른 분이 받은 테이프예요 | | ✅ |
| `LINK_EXPIRED` | 410 | 링크가 만료됐어요 | | ✅ |
| `LINK_OWN` | 409 | 내가 보낸 테이프예요 | `deliveryId`, `url` | ✅ |
| `INVALID_GIFT_AMOUNT` | 400 | 선물은 10, 30, 50, 100 크레딧만 할 수 있어요 | | ✅ |
| `GIFT_NOT_ALLOWED` | 403 | 선물할 수 없는 친구예요 | | ✅ |
| `REPORT_TARGET_NOT_FOUND` | 404 | 신고할 대상을 찾을 수 없어요 | | ✅ |
| `CANNOT_REPORT_SELF` | 400 | 나는 신고할 수 없어요 | | ✅ |
| `PRODUCT_NOT_FOUND` | 404 | 없는 상품이에요 | | ✅ |
| `AD_LIMIT_REACHED` | 429 | 오늘은 다 받았어요 | (`POST /dev/credits`만) | ✅ |
| `RECEIPT_INVALID` | 400 | 결제를 확인하지 못했어요 | | ✅ |
| `RECEIPT_PENDING` | 409 | 결제를 확인하고 있어요. 잠시 후 다시 시도해 주세요 | | ✅ |
| `RECEIPT_ALREADY_USED` | 409 | 이미 다른 계정에서 쓴 결제예요 | | ✅ |
| `IAP_UNAVAILABLE` | 503 | 지금은 결제를 확인할 수 없어요. 잠시 후 다시 시도해 주세요 | (스토어 키가 없을 때) | ✅ |
| `BILLING_NOTIFICATIONS_UNAVAILABLE` | 503 | 스토어 알림을 받을 수 없어요 | (서버 전용) | ✅ |
| `INVALID_SIGNATURE` | 403 | 서명이 올바르지 않아요 | (SSV·스토어 알림·개발 저장소 URL) | ✅ |

---

## 4. 엔드포인트 한눈에 보기

| 상태 | 메서드 | 경로 | 설명 |
|---|---|---|---|
| ✅ | GET | `/health` | 헬스 체크 @공개 |
| ✅ | GET | `/app-version` | 강제 업데이트 확인 @공개 |
| ✅ | POST | `/auth/kakao` | 카카오 로그인 @공개 |
| ✅ | POST | `/auth/apple` | Apple 로그인 @공개 |
| ✅ | POST | `/auth/dev` | 개발 전용 로그인 @공개 (운영 404) |
| ✅ | POST | `/auth/refresh` | 토큰 갱신 @공개 |
| ✅ | POST | `/auth/logout` | 로그아웃 @공개 |
| ✅ | GET | `/users/me` | 내 정보 |
| ✅ | PATCH | `/users/me` | 이름 수정, 알림 켜기/끄기 |
| ✅ | DELETE | `/users/me` | 회원 탈퇴 |
| ✅ | GET | `/friends` | 친구 목록 |
| ✅ | PATCH | `/friends/{userId}` | 즐겨찾기 |
| ✅ | DELETE | `/friends/{userId}` | 목록에서 빼기 |
| ✅ | POST | `/friends/{userId}/block` | 차단 |
| ✅ | DELETE | `/friends/{userId}/block` | 차단 해제 |
| ✅ | GET | `/friends/blocks` | 차단한 친구 목록 |
| ✅ | GET | `/friends/{userId}/tapes` | 친구 화면 (그 친구가 보낸 테이프) |
| ✅ | POST | `/recordings` | 녹음 업로드 URL 발급 |
| ✅ | POST | `/recordings/{id}/complete` | 업로드 완료 → 변환 시작 |
| ✅ | GET | `/recordings/{id}` | 변환 상태 + 미리 듣기 URL |
| ✅ | POST | `/recordings/{id}/retry` | 변환 다시 시도 |
| ✅ | POST | `/deliveries` | 테이프 보내기 (친구 / 링크) 🔑 |
| ✅ | GET | `/deliveries/sent` | 보낸 테이프 목록 |
| ✅ | GET | `/deliveries/sent/{id}` | 보낸 테이프 상세 |
| ✅ | POST | `/deliveries/sent/{id}/share` | 링크 다시 공유하기 |
| ✅ | GET | `/deliveries/{id}` | 받은 테이프 하나 |
| ✅ | POST | `/deliveries/{id}/open` | 소포 뜯기 |
| ✅ | GET | `/deliveries/{id}/audio` | 재생 URL (받는 사람만) |
| ✅ | GET | `/shelf` | 서랍 전체 (분류 안 함 + 칸) |
| ✅ | POST | `/shelf/groups` | 칸 만들기 |
| ✅ | PATCH | `/shelf/groups/{id}` | 칸 이름 바꾸기 / 순서 |
| ✅ | DELETE | `/shelf/groups/{id}` | 칸 지우기 |
| ✅ | PATCH | `/shelf/items/{id}` | 테이프 옮기기·정렬 |
| ✅ | PUT | `/shelf/items/{id}/memo` | 테이프 메모 남기기·고치기·지우기 |
| ✅ | DELETE | `/shelf/items/{id}` | 테이프 지우기 |
| ✅ | GET | `/share/{token}` | 링크 열기(앱) |
| ✅ | POST | `/share/{token}/claim` | 링크 테이프 받기 → 서로 친구 🔑 |
| ✅ | GET | `/share/{token}/web` | 링크 미리보기(웹) @공개 |
| ✅ | POST | `/share/{token}/web/audio` | 웹 재생 URL @공개 |
| ✅ | GET | `/t/{token}` | 모바일 웹 페이지(HTML, `/api` 밖) @공개 |
| ✅ | GET | `/t/{token}/kakao.png` | 카카오 피드 공유 이미지 800×400 (`/api` 밖) @공개 |
| ✅ | GET | `/t/{token}/og.png` | 링크 미리보기 이미지(og:image) 1200×630 (`/api` 밖) @공개 |
| ✅ | GET | `/static/og-image.png` | 대표 이미지 600×600 (옛 앱 빌드·없는 링크 페이지용, `/api` 밖) @공개 |
| ✅ | GET | `/privacy` | 개인정보 처리방침 (HTML, `/api` 밖) @공개 |
| ✅ | GET | `/terms` | 이용약관 (HTML, `/api` 밖) @공개 |
| ✅ | GET | `/child-safety` | 아동 안전 정책 (HTML, `/api` 밖, Google Play 아동 안전 표준) @공개 |
| ✅ | GET | `/.well-known/apple-app-site-association` · `/.well-known/assetlinks.json` | 유니버설 링크·앱 링크 (`/api` 밖, 환경 변수가 없으면 404) @공개 |
| ✅ | GET | `/wallet` | 잔액 + 오늘 남은 광고 |
| ✅ | GET | `/wallet/ledger` | 크레딧 내역 |
| ✅ | POST | `/wallet/gifts` | 크레딧 선물 🔑 |
| ✅ | GET | `/shop/products` | 상품 목록 |
| ✅ | POST | `/shop/purchases` | 테이프 사기 / 서랍 넓히기 🔑 |
| ✅ | POST | `/billing/iap` | 인앱 결제 영수증 확인 → 크레딧 충전 🔑 |
| ✅ | GET | `/billing/admob/ssv` | AdMob 광고 보상 콜백 @공개(서명 검증) |
| ✅ | POST | `/billing/apple/notifications` | App Store 서버 알림(환불) @공개(서명 검증) |
| ✅ | POST | `/billing/google/rtdn` | Google Play 실시간 알림(환불) @공개(Pub/Sub 인증) |
| ✅ | PUT | `/notifications/devices` | FCM 토큰 등록 |
| ✅ | DELETE | `/notifications/devices/{token}` | FCM 토큰 해제 |
| ✅ | POST | `/reports` | 신고 (테이프 / 사람) 🔑 |
| ✅ | POST | `/dev/friends` | 개발 전용: 가짜 친구 만들기 (운영 404) |
| ✅ | POST | `/dev/credits` | 개발 전용: 크레딧 받기 (광고·충전 흉내) (운영 404) |
| ✅ | POST | `/dev/seed` | 개발 전용: 프로토타입 초기 데이터 (운영 404) |
| ✅ | PUT·GET | `/dev-storage/{key}` | 개발 전용: 로컬 저장소 서명 URL (`STORAGE_DRIVER=local`, 운영 404) @공개(서명) |

🔑 = `Idempotency-Key` 필수

---

## 5. app-version

### ✅ `GET /app-version` @공개
앱 시작 시(스플래시) 로그인 전에 부른다. `updateRequired: true`면 강제 업데이트 화면(`updateOn`) → "업데이트하기"는 `storeUrl`을 연다.

쿼리
| 이름 | 필수 | 설명 |
|---|---|---|
| `platform` | O | `ios` \| `android` |
| `version` | | 지금 앱 버전 `x.y.z`. 주면 `updateRequired`·`updateAvailable`을 계산한다 |

응답 `200`
```json
{
  "platform": "ios",
  "minVersion": "1.0.0",
  "latestVersion": "1.2.0",
  "storeUrl": "https://apps.apple.com/app/id0000000000",
  "updateRequired": false,
  "updateAvailable": true
}
```
`version`을 안 주면 `updateRequired`, `updateAvailable`은 `null`. 값은 서버 환경 변수(`APP_MIN_VERSION_IOS` 등)로 바꾼다.

---

## 6. auth

모든 로그인 응답은 `AuthResponse`다.
```json
{
  "accessToken": "eyJ…",
  "accessTokenExpiresAt": "2026-09-25T07:34:46.490Z",
  "refreshToken": "ujlqfa6QZNdO…",
  "refreshTokenExpiresAt": "2026-11-24T06:34:46.490Z",
  "isNewUser": true,
  "suggestedName": "민경",
  "user": { "…": "Me" }
}
```
- `isNewUser`: 이번에 가입했으면 `true`. 가입하면 **가입 선물 10 크레딧**이 들어온다(내역 "가입 선물").
- `suggestedName`: 이름 정하기 화면에 미리 채울 이름(카카오 닉네임 앞 8자). 없으면 `null`.
- `user.name == null`이면 이름 정하기 → `PATCH /users/me { name }`.

### ✅ `POST /auth/kakao` @공개
카카오 SDK의 액세스 토큰을 보낸다. 서버가 `kapi.kakao.com`에 물어 우리 앱(`KAKAO_APP_ID`)의 토큰인지 확인한다.
```json
{ "accessToken": "카카오 액세스 토큰" }
```
응답 `200 AuthResponse` · 오류 `401 SOCIAL_TOKEN_INVALID`, `503 SOCIAL_PROVIDER_UNAVAILABLE`, `403 REJOIN_RESTRICTED`(+`availableAt`, 탈퇴 후 30일 안에 새로 가입하려 할 때)

### ✅ `POST /auth/apple` @공개
`sign_in_with_apple`의 `identityToken`을 보낸다. 서버가 Apple 공개 키(JWKS)로 서명·`iss`·`aud`(번들 ID)·만료를 검사한다.
```json
{ "identityToken": "eyJ…", "authorizationCode": "c1a…", "nonce": "원문 nonce (선택)" }
```
- `authorizationCode`: 선택이지만 **보내 주세요.** 서버가 Apple refresh token으로 바꿔 암호화해 두었다가, 탈퇴할 때 Apple 정책대로 토큰을 철회한다.
- `nonce`: Apple에 `sha256(nonce)`를 넘겼다면 원문을 같이 보낸다(재전송 공격 방지, 권장).
- Apple은 이름을 토큰에 넣지 않는다. 첫 로그인 때 SDK가 준 이름은 앱이 이름 정하기 화면에 미리 채운다.

응답 `200 AuthResponse` · 오류 `401 SOCIAL_TOKEN_INVALID`, `503 SOCIAL_PROVIDER_UNAVAILABLE`, `403 REJOIN_RESTRICTED`(+`availableAt`)

### ✅ `POST /auth/dev` @공개 · 개발 전용
`NODE_ENV=production`이면 `404 NOT_FOUND`. 앱 개발과 e2e 테스트용.
```json
{ "key": "minkyung", "name": "민경" }
```
- `key`: `[A-Za-z0-9_-]{1,64}`. 같은 key면 같은 사용자.
- `name`: 선택. **처음 만들 때만** 이름으로 쓴다(1~8자). 없으면 `name: null`로 가입.

응답 `200 AuthResponse`

### ✅ `POST /auth/refresh` @공개
```json
{ "refreshToken": "…" }
```
응답 `200`
```json
{ "accessToken": "…", "accessTokenExpiresAt": "…", "refreshToken": "새 값", "refreshTokenExpiresAt": "…" }
```
쓴 refresh token은 바로 사라진다. 오류 `401 INVALID_REFRESH_TOKEN` → 로그인 화면.

### ✅ `POST /auth/logout` @공개
이 기기의 refresh token을 지운다. access token은 만료(최대 1시간)까지 남으니 앱에서 지운다.
로그아웃 전에 `DELETE /notifications/devices/{token}`도 부른다.
```json
{ "refreshToken": "…" }
```
응답 `204`

---

## 7. users

### ✅ `GET /users/me`
응답 `200 Me`. 마이 탭(`vMy`), 녹음 탭의 테이프 개수 알약, 상점의 "지금 11/12"에 쓴다.

### ✅ `PATCH /users/me`
바꿀 필드만 보낸다.
```json
{ "name": "민경", "notificationsEnabled": false }
```
- `name`: 앞뒤 공백을 빼고 1~8자(한글·이모지도 한 글자). 어기면 `400 INVALID_NAME`
- `notificationsEnabled`: 마이 > 알림 토글. 끄면 테이프 도착·선물 푸시를 보내지 않는다

응답 `200 Me`

### ✅ `DELETE /users/me`
회원 탈퇴(`shWithdraw`에서 체크 후 "탈퇴하기"). 응답 `204` → 앱은 저장한 토큰을 지우고 로그인 화면으로.
탈퇴하면 그 계정의 access·refresh token은 즉시 쓸 수 없다(`401`). 지워지는 것은 [19. 회원 탈퇴 데이터 정책](#19-회원-탈퇴-데이터-정책).

---

## 8. friends

친구는 "테이프를 주고받은 사이"다. 친구 추가 API는 따로 없고, **링크 테이프를 받으면(claim) 서로 친구**가 된다. 친구에게 테이프를 보내거나 받으면 `lastAt`이 갱신된다.
관계는 방향이 있다. 내가 목록에서 빼거나 차단해도 상대 목록에는 내가 남는다.

### ✅ `GET /friends`
녹음 > 받는 사람(`vPick`), 마이 > 친구(`myFriends`).
정렬: 즐겨찾기 먼저 → `lastAt` 최근 순(없으면 뒤) → 친구가 된 최근 순.
**내가 차단한 사람은 나오지 않는다**(차단 해제 전까지).
```json
{ "items": [ { "userId": "…", "name": "지현", "starred": true, "lastAt": "2026-09-24T09:00:00.000Z" } ] }
```
화면 부제: 즐겨찾기면 `즐겨찾기 · MM.DD`, 아니면 `최근 MM.DD`.

### ✅ `PATCH /friends/{userId}`
즐겨찾기(☆/★)와 별명. 보낸 필드만 바꾸고, 둘을 같이 보내도 된다. 둘 다 없으면 `400 VALIDATION_FAILED`.
```json
{ "starred": true, "nickname": "동민이" }
```
- `starred`: 토글은 앱이 현재 값을 뒤집어 보낸다
- `nickname`: 나에게만 보이는 별명. 앞뒤 공백을 빼고 **최대 10자**(한글·이모지도 한 글자, 이름과 같은 규칙). **빈 문자열이나 `null`이면 별명을 지운다.** 규칙을 어기면 `400 INVALID_NICKNAME`
- 별명은 **차단했다가 해제하면 즐겨찾기처럼 되돌아온다.** 친구 목록에서 빼면(`DELETE /friends/{userId}`) 별명도 함께 사라진다

응답 `200 Friend` · 오류 `404 FRIEND_NOT_FOUND`, `400 INVALID_NICKNAME`

### ✅ `DELETE /friends/{userId}`
친구 시트 > "목록에서 빼기". 응답 `204` · 오류 `404 FRIEND_NOT_FOUND`
받은 테이프는 그대로 남는다. 그 사람이 다시 테이프를 보내면 목록에 다시 나타난다.

### ✅ `POST /friends/{userId}/block`
친구 시트 ⋯ > 차단(`shBlock`) → "차단하기". 친구가 아니어도(예: 링크로 받은 사람) 차단할 수 있다.
- 내 친구 목록에서 빠지고 차단 목록에 들어간다. 이미 차단했으면 그대로 `200`
- 차단한 사람이 보내는 테이프는 받지 않는다(보낸 쪽에는 정상 발송처럼 보이고, 내 서랍에는 들어오지 않는다). 차단 관계에서는 선물도 주고받을 수 없다
- 상대에게는 알리지 않는다

응답 `200 BlockedUser` · 오류 `400 CANNOT_BLOCK_SELF`, `404 USER_NOT_FOUND`

### ✅ `GET /friends/blocks`
설정 > 차단한 친구(`shBlocked`). 최근에 차단한 순. 설정 행의 "N명 / 없음"은 `items.length`.
```json
{ "items": [ { "userId": "…", "name": "민수", "blockedAt": "2026-09-25T06:00:00.000Z" } ] }
```

### ✅ `DELETE /friends/{userId}/block`
차단 해제("해제"). 차단하기 전에 친구였다면 **즐겨찾기·lastAt까지 그대로** 친구 목록으로 돌아온다.
응답 `204` · 오류 `404 BLOCK_NOT_FOUND`

### ✅ `GET /friends/{userId}/tapes`
친구 화면(`fvOn`): 그 친구가 나에게 보낸 테이프 중 뜯은 것(모든 칸 + 분류 안 함), "모두 재생" 목록.
```json
{
  "friend": { "userId": "…", "name": "엄마", "starred": true, "lastAt": "…" },
  "items": [ { "…": "ShelfItem", "groupName": "엄마 목소리" }, { "…": "ShelfItem", "groupName": null } ],
  "unopenedCount": 1
}
```
- **`items` 순서 = "모두 재생" 대기열 순서**(프로토타입 `fromTapes`와 같다): 칸 순서대로 → 칸 안에서는 칸 안 순서대로 → 마지막에 "분류 안 함"의 **뜯은** 테이프를 그 순서대로
- `groupName`: 칸 이름. **"분류 안 함"에 있으면 `null`**(앱이 "분류 안 함"으로 표시)
- 안 뜯은 소포는 `items`에 없고 `unopenedCount`로만 센다
부제: `받은 테이프 N개 · 뜯지 않은 테이프 M개`, 둘 다 0이면 "받은 테이프 없음". 오류 `404 FRIEND_NOT_FOUND`

---

## 9. recordings

녹음 파일은 앱이 저장소(SeaweedFS / R2)에 **직접** 올린다(presigned PUT). 형식은 AAC(m4a) 64kbps 권장, 최대 6MB.
변환 워커(BullMQ)가 ffmpeg로 "테이프 소리"(대역 제한 · 히스 노이즈 · 약한 wow/flutter · 새추레이션)를 입히고, **ffprobe로 잰 실제 길이로 `durationMs`를 바꾼다.**

### Recording
```json
{
  "id": "recording uuid",
  "tapeType": 180,
  "durationMs": 95000,
  "status": "ready",
  "preview": { "url": "https://…presigned GET…", "expiresAt": "…(10분)" }
}
```
| status | 화면 |
|---|---|
| `uploading` | 업로드 URL을 받았고 아직 `complete` 전 |
| `processing` | 변환 중 (`conv`) |
| `ready` | 미리 듣기(`preview` 있음) → "누구에게 보낼까요?" |
| `failed` | 변환 실패(`convFailOn`): 다시 시도 → `POST /recordings/{id}/retry` · 처음부터 다시 녹음(새 `POST /recordings`) |

- `durationMs`: `ready`가 되면 실제 파일 길이로 바뀐다. 확인 화면·재생 화면은 이 값을 쓴다
- `preview`: `ready`이고 **아직 보내지 않은** 녹음의 주인에게만. 보낸 뒤에는 `null`
- 서버는 변환을 3번까지 시도하고, 모두 실패하면 `failed`로 바꾼다. 실제 길이가 테이프 한도(+1.5초)를 넘어도 `failed`

### ✅ `POST /recordings`
녹음을 멈추면 부른다.
```json
{ "tapeType": 180, "durationMs": 95000, "contentType": "audio/mp4" }
```
- `contentType`: `audio/mp4` · `audio/m4a` · `audio/x-m4a` · `audio/aac`
- `durationMs ≤ 한도 + 1,000` (15초 15,000 · 1분 60,000 · 3분 180,000). 넘으면 `400 RECORDING_TOO_LONG` (예: 15초 테이프에 16,000은 통과, 17,000은 거절)
- 1분·3분 테이프를 가졌는지는 **보낼 때** 확인한다(녹음은 자유)

응답 `201` = Recording + `upload`
```json
{
  "id": "…", "tapeType": 180, "durationMs": 95000, "status": "uploading", "preview": null,
  "upload": {
    "url": "https://…presigned PUT…",
    "method": "PUT",
    "headers": { "Content-Type": "audio/mp4" },
    "expiresAt": "…(15분)"
  }
}
```
`upload.headers`는 서명에 들어가 있으니 **그대로** 붙여서 PUT한다(본문은 파일 바이트).

### ✅ `POST /recordings/{id}/complete`
PUT이 끝나면 부른다. 서버가 파일이 있는지·크기를 확인하고 변환 큐에 넣는다. 응답 `200 Recording` (`status: "processing"`). 이미 넘어간 상태면 지금 상태를 그대로 준다.
오류 `409 UPLOAD_NOT_FOUND`(파일이 없음 → PUT 다시), `400 RECORDING_TOO_LARGE`(6MB 초과), `404 RECORDING_NOT_FOUND`

### ✅ `GET /recordings/{id}`
확인 화면(`vConfirm`)이 **1초 간격으로 폴링**한다(롱폴링 없음). "테이프 소리로 바꾸는 중…"은 `ready`가 될 때까지, **최소 1.4초** 보여 준다. 1.4초를 넘기면 대기 표현(`convSlowOn`). 응답 `200 Recording`

### ✅ `POST /recordings/{id}/retry`
`failed`인 녹음을 다시 변환한다. 다른 상태면 지금 상태를 그대로 준다. 응답 `200 Recording`

---

## 10. deliveries

### ✅ `POST /deliveries` 🔑
라벨 화면(`vLabel`)의 "보내기". 한 트랜잭션에서 **녹음 확인 → 친구·차단 확인 → 보유 테이프 1개 차감(1분·3분만, 15초는 무료) → 테이프 생성 → 친구 `lastAt` 갱신**, 끝나면 받는 사람에게 푸시.

친구에게:
```json
{ "recordingId": "…", "recipientId": "friend userId" }
```
새 친구에게 링크로 (`vPick` > "새 친구에게 링크로 보내기"):
```json
{ "recordingId": "…", "linkName": "유진" }
```
- `recipientId`가 있으면 친구에게, 없으면 새 친구 링크로 보낸다
- `linkName`은 **선택 입력**: 라벨에 적은 이름. 생략·`null`·빈 문자열(공백만 포함)이면 `null`로 저장한다(앱은 "새 친구"로 표시). 값이 있을 때만 이름 규칙(1~8자)을 적용해 어기면 `400 INVALID_NAME`
- 친구에게 보내면서 `linkName`에 값을 넣으면 `400 VALIDATION_FAILED`
- `tag`는 **선택**: 생략하거나 `null`이면 태그 없음(응답의 `tag`도 `null`)
- 받는 사람 서랍이 꽉 차도 보낸다("분류 안 함" 맨 위에 들어가고, 받는 쪽 앱이 배너를 띄운다)
- 받는 사람이 나를 차단했어도 `201`로 보인다(받는 쪽에는 들어가지 않는다)
- 받는 사람이 나를 목록에서 뺐었다면 테이프가 도착하면서 다시 친구 목록에 나타난다

응답 `201 SentTape` (링크면 `share.url`로 카카오톡/문자 공유 시트를 연다)
오류 `409 NO_TAPE_LEFT`(+`tapeType`), `409 RECORDING_NOT_READY`(+`status`), `409 RECORDING_ALREADY_SENT`, `403 NOT_FRIEND`, `404 RECORDING_NOT_FOUND`, `400 INVALID_NAME`
보내기 실패(`sendFailOn`) → "다시 보내기"는 **같은 `Idempotency-Key`**로 재시도한다. 이미 처리된 요청이면 첫 응답이 그대로 온다(`Idempotent-Replayed: true`, 테이프는 한 번만 차감).

### ✅ `GET /deliveries/sent?cursor=&limit=`
마이 > 보낸 테이프. 최근 순. `{ "items": [SentTape], "nextCursor": "…" | null }`

### ✅ `GET /deliveries/sent/{id}`
보낸 테이프 상세(`shSentDetail`). `200 SentTape` · `404 TAPE_NOT_FOUND`

### ✅ `POST /deliveries/sent/{id}/share`
"링크 다시 공유하기". 아직 아무도 받지 않은 링크 테이프만. 만료 전이면 같은 링크를, 만료됐으면 **새 링크(7일)**를 준다(옛 링크는 `LINK_NOT_FOUND`가 된다). **확정 정책**: 만료된 링크 테이프의 파일은 지우지 않고, 보낸 사람이 다시 공유할 수 있다.
응답 `200 { "url": "https://<도메인>/t/…", "expiresAt": "…" }` · 받은 뒤면 `409 LINK_TAKEN`

### ✅ `GET /deliveries/{id}`
받은 테이프 하나(푸시를 눌러 들어올 때). `200 ShelfItem` · `404 TAPE_NOT_FOUND`

### ✅ `POST /deliveries/{id}/open`
소포 뜯기(`unwrap`). 처음 한 번만 `openedAt`을 채우고, 보낸 사람의 보낸 테이프 상태가 `opened`가 된다. 응답 `200 ShelfItem`

### ✅ `GET /deliveries/{id}/audio`
재생 URL. **받는 사람만**, 뜯은 테이프만. 짧은 만료(10분)라서 곡을 넘길 때마다 부른다. 앱은 한 번 받은 파일을 캐시한다.
```json
{ "url": "https://…presigned GET…", "expiresAt": "…", "durationMs": 34000 }
```
불러오는 중(`vLoadingOn`) → 실패하면 `vErrorOn`("다시 시도"). 오류 `404 TAPE_NOT_FOUND`(보낸 사람이 불러도 404), `409 TAPE_NOT_OPENED`, `409 AUDIO_NOT_READY`

---

## 11. shelf

서랍 = "분류 안 함"(`groupId: null`) + 사용자 칸. 칸 안의 순서와 칸의 순서는 서버가 fractional index로 관리하고, 앱은 **배열 순서 그대로** 그린다.

### ✅ `GET /shelf`
```json
{
  "stored": 11,
  "cap": 12,
  "full": false,
  "unopenedCount": 1,
  "unsorted": [ShelfItem],
  "groups": [ { "id": "…", "name": "2026 생일", "items": [ShelfItem] } ]
}
```
- 새로 도착한 테이프는 "분류 안 함" **맨 위**
- `full: true`면 꽉 참 배너(`fullOn`) "지우거나 넓혀야 새 테이프를 받을 수 있어요" → 넓히기 → 상점
- `stored == 0`이면 빈 서랍(`emptyOn`)
- `unopenedCount`: "분류 안 함"의 안 뜯은 소포 수(= `Me.drawer.unopenedCount`)

### ✅ `POST /shelf/groups`
칸 추가(무료, 맨 뒤에 붙는다). `{ "name": "2026 생일" }` (1~12자, 비우거나 빼면 "새 칸") → `201 { "id", "name", "items": [] }` · `400 INVALID_GROUP_NAME`

### ✅ `PATCH /shelf/groups/{id}`
`{ "name": "새 이름" }` 그리고/또는 순서 `{ "afterId": "바로 앞 칸 id" | null }` (null = 맨 앞) → `200 { "id", "name", "items" }` · `404 GROUP_NOT_FOUND`

### ✅ `DELETE /shelf/groups/{id}`
칸 지우기. 안에 있던 테이프는 "분류 안 함"의 **끝**으로 가고 뜯은 상태가 된다("칸을 지웠어요 · 테이프는 분류 안 함으로"). `204`

### ✅ `PATCH /shelf/items/{id}`
드래그 정렬, 옮기기 시트(`shMove`). 둘 다 **필수**(null 가능).
```json
{ "groupId": "칸 id 또는 null(분류 안 함)", "afterId": "바로 앞 테이프 id 또는 null(맨 앞)" }
```
응답 `200 ShelfItem`. 앱은 낙관적으로 먼저 옮기고, 실패하면 되돌린다.
오류 `409 TAPE_NOT_OPENED`(안 뜯은 소포는 칸으로 못 옮긴다. "분류 안 함" 안에서 순서 바꾸기는 된다), `404 TAPE_NOT_FOUND`(`afterId`가 그 칸에 없을 때도), `404 GROUP_NOT_FOUND`

### ✅ `PUT /shelf/items/{id}/memo`
테이프 메모(`shMemo`, ⋯ 메뉴 "메모 남기기/메모 수정하기"). **나에게만 보인다**(보낸 사람에게는 보이지 않는다).
```json
{ "memo": "생일 아침에 받은 노래" }
```
- `memo` **필수**. 앞뒤 공백을 빼고 **최대 40자**(한글·이모지도 한 글자, 이름과 같은 규칙이라 줄바꿈 같은 제어 문자는 안 된다). **빈 문자열·공백만·`null`이면 메모를 지운다**
- 응답 `200 ShelfItem`. 오류 `400 INVALID_MEMO`, `404 TAPE_NOT_FOUND`
- 테이프를 지우면(`DELETE /shelf/items/{id}`) 메모도 지운다

### ✅ `DELETE /shelf/items/{id}`
테이프 지우기(`itemDel`, "테이프를 지웠어요"). 파일도 지운다(보낸 사람도 못 듣기 때문에). 보낸 사람의 보낸 테이프 목록에는 남는다. `204`

---

## 12. share

링크 주소: `https://<도메인>/t/{token}` (유니버설 링크 / 앱 링크). 유효 기간 **7일**. 한 사람만 받을 수 있다.

### ✅ `GET /share/{token}`
앱에서 링크를 열었을 때. 소포 화면(`vParcel` + `viaLink` 칩)을 띄울 정보를 준다.
```json
{
  "state": "available",
  "deliveryId": null,
  "sender": { "userId": "…", "name": "하늘", "nickname": null },
  "tapeType": 60,
  "durationMs": 34000,
  "tag": "thinking",
  "sentAt": "…",
  "expiresAt": "…"
}
```
- `state: "claimed"`: **내가 이미 받은** 링크. `deliveryId`로 서랍의 그 테이프를 연다

| 오류 | 화면(`leOn`) |
|---|---|
| `409 LINK_TAKEN` | 이미 다른 분이 받은 테이프예요 |
| `410 LINK_EXPIRED` | 링크가 만료됐어요 |
| `409 LINK_OWN` (+`deliveryId`, `url`) | 내가 보낸 테이프예요 → 링크 다시 공유하기(`url` 그대로 공유) |
| `404 LINK_NOT_FOUND` | 찾을 수 없어요 |

### ✅ `POST /share/{token}/claim` 🔑
"뜯기"를 누르면 받는다. 한 트랜잭션에서 받는 사람을 채우고 테이프를 **"분류 안 함" 맨 위**에 넣고 **서로 친구**가 된다(어느 쪽이든 차단 관계면 친구는 맺지 않는다). 내가 이미 받았으면 같은 결과를 다시 준다.
```json
{ "item": ShelfItem, "friend": Friend | null }
```
→ 뜯기(`POST /deliveries/{id}/open`) → 재생 → "○○님과 친구가 되었어요"(`friend`가 있을 때). 오류는 위 표와 같다.

### ✅ `GET /share/{token}/web` @공개 · `POST /share/{token}/web/audio` @공개
앱이 없는 사람의 모바일 웹 페이지(`webOn`)용. 로그인 없이 부른다.
- `web` → `{ "senderName", "tapeType", "durationMs", "tag", "sentAt", "expiresAt" }`
- `web/audio` → `{ "url", "expiresAt", "durationMs" }` (10분)
- 웹에서 들어도 받은 것(claim)으로 치지 않는다. 오류: `LINK_TAKEN`, `LINK_EXPIRED`, `LINK_NOT_FOUND`

### ✅ `GET /t/{token}` @공개 (`/api` 밖, HTML)
모바일 웹 페이지. 디자인 `webOn`·`leOn` 블록을 하이파이로 옮긴 서버 렌더 HTML 한 장이다(CSS·JS 인라인, 외부는 SUIT 폰트만).
- 흐름: 소포 흔들림(`shake 2.2s`) → 탭해서 뜯기(`tearL`/`tearR` .7s, 750ms 뒤) → 테이프 등장(`insert` .7s) → 700ms 뒤 자동 재생(`POST /share/{token}/web/audio`의 URL, 릴 감김·진행 바) → 앱 설치 안내(App Store / Google Play, `APP_STORE_URL_*`)
- 문구는 원본 그대로이고, "앱이 없어도 이 페이지에서 **N일** 동안 들을 수 있어요"의 N은 `expiresAt`까지 남은 날(올림)
- **앱에서 열기**: `tapeletter://t/{token}`(Android는 `intent://t/{token}#Intent;scheme=tapeletter;package=<ANDROID_PACKAGE_NAME>;…`)을 열고, 1.6초 안에 앱으로 넘어가지 않으면 스토어로 보낸다. **앱은 URL 스킴 `tapeletter`를 등록하고 `tapeletter://t/{token}`을 링크 열기(`GET /share/{token}`)로 처리해야 한다**
- 상태별 응답: 받을 수 있음 `200` · 이미 받음 `409`(leOn taken) · 만료 `410`(leOn expired) · 없음 `404`(같은 톤의 "테이프를 찾을 수 없어요")
- 카카오톡·문자 미리보기(Open Graph, 받을 수 있는 링크, 핸드오프 `design_handoff_kakao_share` README): `og:title` "○○님이 목소리 테이프를 보냈어요"(이름이 없으면 "누군가 목소리 테이프를 보냈어요"), `og:description` "탭해서 소포를 뜯어보세요", `og:image` `https://<도메인>/t/{token}/og.png`, `og:image:width` 1200 · `og:image:height` 630, `twitter:card` `summary_large_image`. 페이지 `<title>`·`description`은 예전 그대로("○○님이 테이프를 보냈어요", "1분 테이프 · 앱이 없어도 …")
- 이미 받음·만료·없음 화면의 미리보기는 그 화면 문구와 `https://<도메인>/static/og-image.png`(600×600)를 쓴다
- 보안: 이름은 HTML 이스케이프, `Content-Security-Policy`는 요청마다 새 nonce(`script-src 'nonce-…'`, `style-src 'nonce-…' https://cdn.jsdelivr.net`, `default-src 'none'`), `Referrer-Policy: no-referrer`, `Cache-Control: no-store`
- 웹은 로그인이 없어 **보낸 사람 본인인지 알 수 없다.** 그래서 웹에서는 `own` 화면을 띄우지 않고, 보낸 사람이 앱으로 링크를 열면 앱이 `LINK_OWN`을 받는다

### ✅ `GET /t/{token}/kakao.png` · `GET /t/{token}/og.png` @공개 (`/api` 밖, PNG)
링크 공유 이미지. 디자인은 `design_handoff_kakao_share`(`template/share-card.html`, `assets/*.png`)이고 서버가 satori + resvg로 그린다(폰트 SUIT 600·800 내장).

| 경로 | 크기 | 내용 |
|---|---|---|
| `/t/{token}/kakao.png` | 800×400 | 카카오 피드(`Kakao.Share.sendDefault`의 `imageUrl`, `imageWidth: 800`, `imageHeight: 400`). 워드마크 + 길이 라벨(`15 SEC` #E5402B · `1 MIN` #2E6BD6 · `3 MIN` #111111) + 소포와 "보낸 사람" 라벨 |
| `/t/{token}/og.png` | 1200×630 | 링크 미리보기(`og:image`). 헤드라인 "○○님이 / 목소리를 보냈어요", 길이 라벨 없음 |

- 이름은 **보낼 때 저장한 보낸 사람 이름**(`sender_name`)이다. 나중에 이름을 바꿔도 이미지는 바뀌지 않는다. 최대 8자, 넘으면 8자 + "…"(라벨 칸이 좁아 긴 이름은 라벨 안에서 한 번 더 말줄임될 수 있다)
- 이름이 없으면(`이름 없음`) "누군가": kakao는 라벨에 "누군가", og는 헤드라인 "누군가 / 목소리를 보냈어요"
- 받았거나 만료된 링크도 `200`으로 그린다(이미 나간 카톡 미리보기가 깨지지 않게). 없는 토큰·모양이 틀린 토큰은 `404 LINK_NOT_FOUND`(JSON)
- `Content-Type: image/png`, `Cache-Control: public, max-age=31536000, immutable`. 서버는 그린 PNG를 메모리 LRU(최대 500장, 형식·이름·길이 기준)에 담아 둔다
- 요청 횟수 제한은 `/t/{token}`과 같다(IP당 분당 60회)

`GET /static/og-image.png`(대표 이미지 600×600, 옛 앱 빌드가 쓰므로 유지), `/.well-known/apple-app-site-association`(`/t/*`), `/.well-known/assetlinks.json`도 제공한다(환경 변수 `APPLE_APP_ID`, `ANDROID_PACKAGE_NAME`, `ANDROID_SHA256_FINGERPRINTS`가 없으면 404).


### ✅ `GET /privacy` · `GET /terms` @공개 (`/api` 밖, HTML)
개인정보 처리방침과 이용약관. 앱은 설정 → 정보에서 **외부 브라우저나 인앱 웹뷰로** 열고, 스토어 등록 URL로도 쓴다(`https://<도메인>/privacy`, `https://<도메인>/terms`).
- 링크 웹 페이지와 같은 톤(SUIT, 토큰 색), 스크립트 없음, `Content-Security-Policy`는 요청마다 새 nonce(`style-src 'nonce-…'`, `script-src 'none'`)
- 운영자 정보(상호, 보호책임자, 이메일, 사업자 정보, 시행일)는 환경 변수 `POLICY_*`에서 읽고, 비어 있으면 "준비 중"으로 표시한다
- 내용과 버전 관리는 `src/policy/`, 확인이 필요한 항목은 `docs/policy.md`

### ✅ `GET /child-safety` @공개 (`/api` 밖, HTML)
아동 안전 정책(Google Play "아동 안전 표준" 게시 요건, `https://<도메인>/child-safety`). `/privacy`·`/terms`와 같은 레이아웃·CSP·`POLICY_*` 운영자 정보를 쓴다.
- 한국어 본문(CSAE·CSAM 무관용, 만 14세 이상 가입, 앱 안 신고와 이메일 신고, 운영자 확인 뒤 콘텐츠 삭제·약관 12조 이용 제한·관계 당국 신고, 담당자 `POLICY_PRIVACY_OFFICER`·`POLICY_CONTACT_EMAIL`, 시행일 `POLICY_EFFECTIVE_DATE`) + 아래에 영어 요약(`lang="en"`)
- 세 정책 페이지는 아래쪽에서 서로 링크한다
---

## 12-1. reports (신고)

Apple 심사 가이드라인 1.2(사용자 생성 콘텐츠: 신고·차단·연락처)를 위한 신고. 신고 화면은 디자인을 받은 뒤 앱에 붙인다.

### ✅ `POST /reports` 🔑
```json
{
  "target": { "type": "tape", "deliveryId": "…" },
  "reason": "harassment",
  "memo": "선택, 최대 300자",
  "alsoBlock": true
}
```
| 필드 | 필수 | 값 |
|---|---|---|
| `target` | O | `{ "type": "tape", "deliveryId" }`: **내가 받은**(서랍에 보이는) 테이프만 · `{ "type": "user", "userId" }`: **나와 친구이거나 나에게 테이프를 보낸 적이 있는** 사람만(차단한 뒤에도 가능) |
| `reason` | O | `harassment`(괴롭힘·혐오) · `sexual`(성적인 내용) · `spam`(스팸·광고) · `illegal`(불법·권리 침해) · `impersonation`(사칭) · `other`(기타). 화면 문구는 앱이 가진다 |
| `memo` | | 최대 300자 (앞뒤 공백 제거, 비우면 없음) |
| `alsoBlock` | | `true`면 같은 트랜잭션에서 차단한다(테이프면 보낸 사람, 사람이면 그 사람). `POST /friends/{userId}/block`과 같은 동작. 보낸 사람이 탈퇴한 테이프면 차단은 건너뛴다 |

- 응답 `201 { "id": "…", "createdAt": "…" }`
- **같은 대상을 24시간 안에 다시 신고하면** 새로 만들지 않고 **기존 신고**를 `201`로 돌려준다(오류 아님, 한도에도 세지 않음). `alsoBlock`은 그때도 적용한다
- 요청 제한: 사용자당 24시간에 20건. 넘으면 `429 RATE_LIMITED`
- 오류: `404 REPORT_TARGET_NOT_FOUND`(대상이 없거나 신고할 수 없는 대상), `400 CANNOT_REPORT_SELF`, `400 VALIDATION_FAILED`
- 테이프를 신고해도 녹음 파일은 복사하지 않는다. 운영자에게는 서버 로그(`warn`)와 `REPORT_WEBHOOK_URL`(설정 시)로 신고 번호·사유·대상 유형만 알린다. 운영자 조회·상태 변경은 `ops/reports/reports.sh`(`docs/deploy.md`)
- 보관: 3년. 신고자가 탈퇴하면 신고자 연결만 끊고 남긴다

---

## 13. wallet

### ✅ `GET /wallet`
```json
{ "credits": 120, "ads": { "rewardPerView": 10, "dailyLimit": 3, "remainingToday": 3 } }
```
하루 기준은 한국 시간(Asia/Seoul) 자정. `remainingToday == 0`이면 광고를 띄우지 않는다("오늘은 다 받았어요").

### ✅ `GET /wallet/ledger?cursor=&limit=`
크레딧 내역(`histOn`). 최신이 앞. `{ "items": [LedgerEntry], "nextCursor": "…" | null }`

### ✅ `POST /wallet/gifts` 🔑
친구 시트 > 선물(`shGift`).
```json
{ "toUserId": "…", "amount": 30 }
```
- `amount`: `10` · `30` · `50` · `100`만 (`400 INVALID_GIFT_AMOUNT`)
- 한 트랜잭션에서 내 원장 `−30 "{상대}님에게 선물"`, 상대 원장 `+30 "{나}님이 선물"`, 끝나면 상대에게 선물 푸시
- 친구에게만(`404 FRIEND_NOT_FOUND`). 어느 쪽이든 차단 관계면 `403 GIFT_NOT_ALLOWED`

응답 `201 { "credits": 90, "entry": LedgerEntry }` → 토스트 "{이름}님에게 30 크레딧을 선물했어요"
오류 `402 INSUFFICIENT_CREDITS`(+`need`)

---

## 14. shop

### ✅ `GET /shop/products`
가격은 서버가 정한다(앱은 표시만).
```json
{
  "tapes": [
    { "id": "tape60_1", "tapeType": 60, "qty": 1, "name": "1분 테이프", "price": 30 },
    { "id": "tape60_5", "tapeType": 60, "qty": 5, "name": "1분 테이프 5개", "price": 120 },
    { "id": "tape180_1", "tapeType": 180, "qty": 1, "name": "3분 테이프", "price": 50 },
    { "id": "tape180_5", "tapeType": 180, "qty": 5, "name": "3분 테이프 5개", "price": 200 }
  ],
  "drawer": [ { "id": "drawer_10", "name": "서랍 넓히기", "slots": 10, "price": 100 } ],
  "creditPacks": [
    { "productId": "tapeletter.credits_100", "credits": 100, "priceKrw": 1100, "priceLabel": "₩1,100" },
    { "productId": "tapeletter.credits_550", "credits": 550, "priceKrw": 5500, "priceLabel": "₩5,500" },
    { "productId": "tapeletter.credits_1200", "credits": 1200, "priceKrw": 11000, "priceLabel": "₩11,000" }
  ],
  "giftAmounts": [10, 30, 50, 100]
}
```
`creditPacks[].productId`는 App Store Connect / Play Console의 **소비성** 상품 ID와 같게 등록한다. 실제 표시 가격은 스토어 SDK 값을 우선한다.

### ✅ `POST /shop/purchases` 🔑
구매 확인 시트(`shBuy`)의 "사기". 한 트랜잭션에서 크레딧 조건부 차감 → 테이프 추가 또는 서랍 +10.
```json
{ "productId": "tape60_5" }
```
응답 `201`
```json
{
  "credits": 0,
  "tapes": [ { "tapeType": 15, "qty": null }, { "tapeType": 60, "qty": 7 }, { "tapeType": 180, "qty": 0 } ],
  "drawer": { "stored": 11, "cap": 12, "full": false, "unopenedCount": 0 },
  "entry": LedgerEntry
}
```
토스트: 테이프 "보유 테이프에 넣었어요" / 서랍 "서랍에 10개 더 보관할 수 있어요".
오류 `402 INSUFFICIENT_CREDITS` + `need` → 충전 시트(`shCharge`, "N 크레딧이 더 필요해요"), `404 PRODUCT_NOT_FOUND`

---

## 15. billing

### ✅ `POST /billing/iap` 🔑
스토어 결제가 끝나면(`shPay`) 영수증을 보낸다. 서버가 스토어로 검증하고 크레딧을 준다.
```json
{ "store": "app_store", "productId": "tapeletter.credits_100", "verificationData": "JWS 또는 purchaseToken" }
```
| 필드 | 필수 | 값 |
|---|---|---|
| `store` | O | **`app_store`**(iOS) 또는 **`play`**(Android) 둘 중 하나. 다른 값(`google_play` 등)이면 `400 VALIDATION_FAILED` (`fields: ["store"]`) |
| `productId` | O | `tapeletter.credits_100` · `tapeletter.credits_550` · `tapeletter.credits_1200`. 모르는 값이면 `404 PRODUCT_NOT_FOUND` |
| `verificationData` | O | iOS: `jwsRepresentation` · Android: `purchaseToken` |
| `transactionId` | | 참고용 |

- iOS: StoreKit 2 `jwsRepresentation`. 서버가 Apple 인증서 체인으로 서명·번들 ID·환경을 확인한다(샌드박스 결제도 받는다. 앱 심사용)
- Android: `purchaseToken`. 서버가 Google Play Developer API(`purchases.products.get`)로 확인하고, 지급 후 **서버가 consume**한다(앱은 consume하지 않는다)
- `transactionId`(선택)는 참고용이다. 서버는 스토어에서 확인한 거래 id를 쓴다
- 응답 `200 { "credits": 220, "granted": 100, "alreadyProcessed": false, "entry": LedgerEntry }` → iOS는 `finishTransaction`
- **같은 결제를 다시 보내면** 지급 없이 `200 { "granted": 0, "alreadyProcessed": true, … }` (앱이 재시작 후 다시 보내도 안전하다)
- 오류 `400 RECEIPT_INVALID` → 결제 실패 시트(`shPayFail`), `409 RECEIPT_PENDING`(Play 대기 결제), `409 RECEIPT_ALREADY_USED`(다른 계정이 이미 쓴 결제), `503 IAP_UNAVAILABLE`(서버에 스토어 키가 없음 — 개발에서는 `POST /dev/credits`)
- 결제 취소는 스토어 SDK에서 끝난다(서버 호출 없음, 토스트만)

### ✅ `GET /billing/admob/ssv` @공개
AdMob 보상형 광고 서버 측 확인(SSV) 콜백. **Google이 부른다.** Google 공개 키(ECDSA)로 서명을 검증하고 `user_id`에게 10 크레딧(원장 "광고 보상")을 준다. 같은 `transaction_id`는 한 번만, 한국 시간 하루 3회까지(넘으면 조용히 무시). 서명이 틀리면 `403 INVALID_SIGNATURE`.
**앱 흐름**: 보상형 광고를 띄울 때 `ServerSideVerificationOptions(userId: me.id)`를 넣는다 → 보상 콜백을 받으면 `GET /wallet`을 1초 간격으로 최대 5번 불러 크레딧이 늘었는지(`remainingToday` 감소) 확인한다. 끝까지 안 보고 닫으면 보상이 없다("끝까지 봐야 받을 수 있어요"). 개발에서는 `POST /dev/credits { "type": "ad" }`.

### ✅ `POST /billing/apple/notifications`, `POST /billing/google/rtdn` @공개 (서버 전용)
스토어 서버 알림. 모두 `billing_events`에 기록한다.
- App Store Server Notifications V2: `{ "signedPayload" }`를 Apple 인증서로 검증. `REFUND`·`REVOKE`면 환불 처리
- Google Play RTDN(Cloud Pub/Sub 푸시): `Authorization: Bearer <OIDC 토큰>`을 `GOOGLE_RTDN_AUDIENCE`로 검증. `voidedPurchaseNotification`이면 환불 처리

**환불 정책**: 환불된 충전만큼 크레딧을 **잔액 안에서** 회수한다(원장 `refund` "크레딧 충전 취소 · ₩1,100"). 이미 써서 잔액이 모자라면 0까지만 회수하고(잔액은 음수가 되지 않는다), 못 회수한 양은 `iap_purchases.unrecovered_credits`에 남긴다. 산 테이프·서랍·선물은 되돌리지 않는다. 반복 악용은 운영자가 기록을 보고 판단한다.

---

## 16. notifications

### ✅ `PUT /notifications/devices`
로그인 후, 그리고 FCM 토큰이 바뀔 때마다. `{ "token": "FCM 토큰", "platform": "ios" | "android" }` → `204`. 같은 토큰을 다른 계정이 등록하면 그 계정으로 옮긴다.

### ✅ `DELETE /notifications/devices/{token}`
로그아웃 전에. `204`

### 푸시 모양 ✅
FCM HTTP v1로 보낸다(`notification` + `data`). 문구의 이름은 **알림을 받는 사람이 붙인 별명**이 있으면 별명, 없으면 원래 이름이다. `notificationsEnabled: false`면 보내지 않는다. 앱이 지워져 무효가 된 토큰은 서버가 지운다. 서버에 FCM 키가 없으면(개발) 보내지 않고 로그만 남긴다.
| 종류 | title | body | data |
|---|---|---|---|
| 테이프 도착 | `{보낸 사람}님이 테이프를 보냈어요` | `{15초·1분·3분} 테이프가 도착했어요. 뜯어서 들어보세요` | `{ "type": "tape", "deliveryId": "…" }` → 서랍 + 소포 화면 |
| 크레딧 선물 | `{보낸 사람}님이 크레딧을 선물했어요` | `{30} 크레딧을 받았어요` | `{ "type": "gift" }` → 크레딧 내역 |
| 링크 테이프를 받음 | `{받은 사람}님이 테이프를 받았어요` (받은 사람의 실제 이름 또는 내가 붙인 별명. `linkName`은 쓰지 않는다) | `이제 서로 친구예요` | `{ "type": "claimed", "deliveryId": "…" }` → 보낸 테이프 상세 |

---

## 17. dev (개발 전용)

`NODE_ENV=production`이면 전부 `404`. 앱 개발과 e2e 테스트용.

### ✅ `POST /dev/seed`
로그인한 계정을 **프로토타입 초기 데이터**로 만든다(기존 테이프·칸·친구·차단·내역·보유 테이프는 지운다). 응답 `200 { "friends": 6, "stored": 10, "groups": 3, "sent": 4, "credits": 120 }`

| 항목 | 내용 |
|---|---|
| 친구 | 지현★ 엄마★ 민수 하늘 박과장님 은비 (`lastAt`은 프로토타입 날짜) |
| 분류 안 함 | 지현 1분(안 뜯음), 하늘 15초(안 뜯음, 링크로 받음) |
| 칸 | 2026 생일(엄마 3분, 민수 15초, 수아 1분, 할머니 15초) · 승진 축하(박과장님 1분, 은비 15초) · 엄마 목소리(엄마 3분, 엄마 1분) |
| 보낸 기록 | 유진(링크 대기) · 엄마(들음) · 민수(안 뜯음) · 박과장님(들음) |
| 지갑 | 크레딧 120, 내역 5줄(가입 선물 +10, 지현님이 선물 +30, 크레딧 충전 · ₩1,100 +100, 1분 테이프 구매 −30, 광고 보상 +10), 1분 테이프 2개, 서랍 12 |
| 오디오 | 생성한 사인파 톤 WAV(3~6초, `audio/wav`) |

### ✅ `POST /dev/credits`
```json
{ "type": "ad" }
{ "type": "charge", "productId": "tapeletter.credits_100" }
{ "type": "admin", "amount": 500 }
```
- `ad`: 실제 광고 보상과 같은 경로(원장 "광고 보상", 하루 3회. 넘으면 `429 AD_LIMIT_REACHED`)
- `charge`: 충전 흉내(원장 "크레딧 충전 · ₩1,100")
- `admin`: 임의 금액(원장 "개발용 지급")

응답 `200` = `GET /wallet`과 같다.

### ✅ `POST /dev/friends`
서로 친구 관계를 만든다(`lastAt`은 지금).
```json
{ "name": "지현", "starred": true }
```
또는 이미 있는 사용자(예: 다른 기기의 개발 계정)와:
```json
{ "userId": "…" }
```
`name`과 `userId` 중 하나만. 응답 `201 Friend`

### ✅ `PUT /dev-storage/{key}` · `GET /dev-storage/{key}` @공개(HMAC 서명)
`STORAGE_DRIVER=local`일 때 `upload.url` / `preview.url` / 재생 `url`이 가리키는 곳. 앱이 직접 만들 일은 없다. 서명(`sig`)·만료(`exp`)·Content-Type(`ct`)이 맞지 않으면 `403 INVALID_SIGNATURE`. GET은 Range 요청(206)을 지원한다.

---

## 18. 화면 → API 대응표 (디자인 v2)

| 화면 (템플릿 블록) | API |
|---|---|
| 스플래시 `splashOn` | `GET /app-version` → 미달이면 강제 업데이트 `updateOn`. 저장된 토큰이 있으면 `GET /users/me` |
| 온보딩 `auOnb` | 없음 |
| 로그인 `auLogin` | `POST /auth/kakao` · `POST /auth/apple` (개발: `POST /auth/dev`) |
| 이름 정하기 `auName` | `PATCH /users/me { name }` (`suggestedName`으로 미리 채움) |
| 마이크·알림 권한 `auMic` `auNoti` | 알림 허용 시 `PUT /notifications/devices`, 거부/나중에면 `PATCH /users/me { notificationsEnabled: false }` |
| 녹음 대기 `vIdle` | `GET /users/me` (`tapes` → 개수 알약, 0개면 상점으로) |
| 탭바 서랍 레드 점 `hasNew` | `GET /users/me` → `drawer.unopenedCount > 0` |
| 녹음 확인 `vConfirm` `convSlowOn` `convFailOn` | `POST /recordings` → PUT 업로드 → `POST /recordings/{id}/complete` → `GET /recordings/{id}` 1초 폴링 → 실패 시 `POST /recordings/{id}/retry` |
| 받는 사람 `vPick` | `GET /friends` |
| 라벨 `vLabel` · 포장 `vSending` · 발송 `vSent` · 실패 `sendFailOn` | `POST /deliveries` 🔑 |
| 서랍 `vShelf` `fullOn` `emptyOn` | `GET /shelf`, 칸 `POST/PATCH/DELETE /shelf/groups`, 드래그·옮기기 `PATCH /shelf/items/{id}`, 메모 `PUT /shelf/items/{id}/memo`, 지우기 `DELETE /shelf/items/{id}` |
| 소포 뜯기 `vParcel` | `POST /deliveries/{id}/open` |
| 재생 `vPlay` `vLoadingOn` `vErrorOn` | `GET /deliveries/{id}/audio` |
| 새 테이프 푸시 `pushOn` | `GET /deliveries/{id}` |
| 친구 화면 `fvOn` | `GET /friends/{userId}/tapes` |
| 상점 `vShop` | `GET /shop/products`, `GET /wallet`, `GET /users/me` |
| 구매 `shBuy` / 충전 `shCharge` | `POST /shop/purchases` 🔑 → `402 need` → 충전 시트 |
| 결제 `shPay` `shPayFail` | 스토어 SDK → `POST /billing/iap` 🔑 |
| 광고 `shAd` `shAdFail` | AdMob SDK(SSV) → `GET /wallet` 폴링 |
| 선물 `shGift` · 선물 받음 푸시 | `POST /wallet/gifts` 🔑 |
| 크레딧 내역 `histOn` | `GET /wallet/ledger` |
| 마이 `vMy` | `GET /users/me`, `GET /friends`, `GET /deliveries/sent`, 이름 수정 `PATCH /users/me` |
| 친구 시트 `shFriend` | 즐겨찾기 `PATCH /friends/{id}`, 목록에서 빼기 `DELETE /friends/{id}`, 차단 `shBlock` → `POST /friends/{id}/block` |
| 보낸 테이프 상세 `shSentDetail` | `GET /deliveries/sent/{id}`, 링크 다시 공유하기 `POST /deliveries/sent/{id}/share` |
| 설정 > 알림 | `PATCH /users/me { notificationsEnabled }` |
| 설정 > 연결된 계정 | `GET /users/me` → `providers` |
| 설정 > 차단한 친구 `shBlocked` | `GET /friends/blocks`, 해제 `DELETE /friends/{id}/block` |
| 설정 > 로그아웃 | `DELETE /notifications/devices/{token}` → `POST /auth/logout` |
| 설정 > 회원 탈퇴 `shWithdraw` | `DELETE /users/me` |
| 설정 > 앱 버전 | `GET /app-version` (`latestVersion`) |
| 링크 열기 `leOn`(taken/expired/own) · 앱에서 링크 `viaLink` | `GET /share/{token}` → `POST /share/{token}/claim` 🔑 |
| 모바일 웹 `webOn` | `GET /t/{token}`, `GET /share/{token}/web`, `POST /share/{token}/web/audio` |
| 오프라인 `offlineOn` · 서버 오류 `serverOn` | 네트워크 오류 / `5xx` |

---

## 19. 회원 탈퇴 데이터 정책

**확정 (2026-09-25)**. 탈퇴 화면 경고("받은 테이프와 크레딧이 모두 사라진다")에 맞춘다. `DELETE /users/me`는 **즉시·영구 삭제**(유예 기간 없음)다.

**재가입 제한**: 탈퇴하고 **30일**(`REJOIN_COOLDOWN_DAYS`) 동안은 같은 카카오·Apple 계정으로 다시 가입할 수 없다(`403 REJOIN_RESTRICTED`, `availableAt`). 30일이 지나 다시 가입하면 새 계정이고 **가입 선물을 다시 받는다**. 개발 로그인(`/auth/dev`)에는 적용하지 않는다. 탈퇴하지 않은 계정의 로그인에는 영향이 없다.

| 데이터 | 처리 | 상태 |
|---|---|---|
| 사용자(이름, 크레딧, 서랍 한도, 알림 설정) | 삭제 | ✅ |
| 로그인 계정(카카오·Apple 연결), refresh token | 삭제 → 모든 기기 즉시 로그아웃 | ✅ |
| 친구 관계 (내 목록, 상대 목록의 나) | 양쪽 모두 삭제 | ✅ |
| 차단 (내가 한 것, 나를 차단한 것) | 양쪽 모두 삭제 | ✅ |
| 크레딧 원장, 보유 테이프, 멱등 키 | 삭제 | ✅ |
| 받은 테이프(서랍, 칸)와 그 녹음 파일 | 삭제 | ✅ |
| 보낸 테이프 | **받은 사람의 서랍에는 남긴다**(받은 사람의 것). 보낸 사람은 `sender.userId: null` + 보낼 때 이름으로 보인다. 아직 아무도 안 받은 링크 테이프는 파일과 함께 삭제 | ✅ |
| 보내지 않은 녹음 | 파일과 함께 삭제 | ✅ |
| FCM 토큰 | 삭제 | ✅ |
| 결제 기록(`iap_purchases`) | 전자상거래법상 5년 보관: `user_id`만 NULL로 끊고 남긴다 | ✅ |
| 광고 보상 기록 | 삭제 | ✅ |
| Apple 로그인 | Apple 정책에 따라 토큰 철회(`appleid.apple.com/auth/revoke`, client_secret은 .p8로 서명한 JWT). 로그인 때 받은 `authorizationCode`로 얻어 둔 refresh token을 쓴다. 키나 토큰이 없으면 건너뛰고 로그만 | ✅ |
| 카카오 로그인 | 카카오 연결 끊기(`/v1/user/unlink`, 어드민 키). 키가 없으면 건너뛰고 로그만 | ✅ |
| **재가입 제한 기록** | 소셜 계정 식별자(provider, 회원번호/sub)는 **원문으로 남기지 않고** HMAC-SHA256 해시(`IDENTITY_HASH_KEY`)와 탈퇴 시각만 `withdrawn_identities`에 남긴다. **목적: 재가입 제한. 보관 기간: 30일**(지나면 매시간 정리 작업이 지운다). 해시 키 없이는 원래 계정을 알아낼 수 없다 | ✅ |

소셜 연결 해제가 실패해도 탈퇴는 진행된다(이미 데이터를 지운 뒤에 부른다).

---

## 20. 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-09-30 | 루트 `/`에 소개 사이트(정적, edge Caddy가 서빙). API 변경 없음 |
| 2026-09-30 | 아동 안전 정책 페이지 `GET /child-safety` 추가 (HTML, `/api` 밖, Google Play 아동 안전 표준 게시용, 한국어 본문 + 영어 요약). `/privacy`·`/terms` 아래에 이 페이지 링크 추가(문서 내용 변경 없음, 버전 그대로) |
| 2026-09-30 | 링크 공유 이미지 `GET /t/{token}/kakao.png`(800×400)·`GET /t/{token}/og.png`(1200×630) 추가(보낸 사람 이름·길이, 받았거나 만료된 링크도 그림, 없으면 404, immutable 캐시). `/t/{token}`의 `og:title` "○○님이 목소리 테이프를 보냈어요", `og:description` "탭해서 소포를 뜯어보세요", `og:image` → `/t/{token}/og.png`(1200×630), `twitter:card` `summary_large_image`. `/static/og-image.png`는 유지 |
| 2026-09-30 | 디자인 v9 테이프 메모: `PUT /shelf/items/{id}/memo` 추가(최대 40자, 빈 값·공백만·null이면 삭제, 나에게만 보임), ShelfItem에 `memo` 추가(SentTape에는 없음), 오류 코드 `INVALID_MEMO`, 테이프를 지우면 메모도 삭제. 개인정보 처리방침 1.5 |
| 2026-09-27 | **테이프 길이 변경(호환 안 됨)**: 1분·3분·5분 → **15초·1분·3분**. `tapeType` 코드가 **녹음 한도(초)**로 바뀐다: `1`→**`15`**(15초, 무료·무제한), `3`→**`60`**(1분), `5`→**`180`**(3분). 색·모양은 자리 그대로 옮긴다. 녹음 한도 15,000·60,000·180,000ms(+1초 오차), 옛 코드는 `400 VALIDATION_FAILED`. Me.tapes·구매 응답 `tapes`는 15·60·180. 상품 ID `tape3_1`·`tape3_5`·`tape5_1`·`tape5_5` → **`tape60_1`·`tape60_5`·`tape180_1`·`tape180_5`**(가격 30·120·50·200 그대로, 이름 "1분 테이프"·"3분 테이프 5개" 등). 원장 문구·푸시 문구·링크 웹 페이지 라벨(`15 SEC`·`1 MIN`·`3 MIN`)도 새 이름. 기존 데이터는 마이그레이션으로 옮긴다. 약관 1.4 |
| 2026-09-27 | 디자인 v3·v4: `POST /deliveries`의 `linkName`을 **선택 입력**으로(생략·null·빈 문자열 → `null` 저장, 값이 있을 때만 1~8자). `recipientId`가 없으면 링크로 보낸다. SentTape.`linkName`은 `null`일 수 있고, 받은 뒤에는 `recipient`가 채워져 앱은 `recipient`를 우선 표시. 디자인 원본 파일 이름 `TapeletterApp.logic.js`·`TapeletterApp.template.html` |
| 2026-09-27 | 크레딧 팩 상품 ID 변경: `credits_100`·`credits_550`·`credits_1200` → **`tapeletter.credits_100`·`tapeletter.credits_550`·`tapeletter.credits_1200`**(같은 Apple 개발자 팀의 다른 앱이 옛 ID를 이미 써서 새 앱에 만들 수 없었다). `GET /shop/products`의 `creditPacks[].productId`, `POST /billing/iap`·`POST /dev/credits`의 `productId`가 모두 새 ID다. 옛 ID는 `404 PRODUCT_NOT_FOUND` |
| 2026-09-26 | 서비스 이름 변경 **cassette → tapeletter**: 앱에서 열기 스킴 `tapeletter://t/{token}`(Android intent의 `scheme=tapeletter`), 웹 페이지 워드마크·`og:site_name`·`<title>`, Android 스토어 기본값 `com.kebi.tapeletter`, 도메인 예시 `tapeletter.lab241.com`. 약관 1.3·처리방침 1.4. API 경로·필드는 그대로 |
| 2026-09-25 | 1단계: 전체 계약 초안. app-version, auth(카카오·Apple·개발), users, friends(즐겨찾기·빼기·차단), dev 구현 |
| 2026-09-26 | 친구 별명: `PATCH /friends/{userId}`에 `nickname`(최대 10자, 빈 값·null이면 삭제), Friend·BlockedUser·ShelfItem.sender·SentTape.recipient·링크 미리보기 sender에 `nickname` 추가, 오류 코드 `INVALID_NICKNAME`, 푸시는 받는 사람의 별명, 원장 문구는 원래 이름. 개인정보 처리방침 1.3 |
| 2026-09-26 | 신고 `POST /reports` 🔑 추가(테이프·사람, 24시간 중복 신고는 기존 신고 반환, 하루 20건, `alsoBlock`), 오류 코드 `REPORT_TARGET_NOT_FOUND`·`CANNOT_REPORT_SELF`. 개인정보 처리방침·이용약관 1.2 |
| 2026-09-26 | 개인정보 처리방침·이용약관 1.1 (정책 결정 반영, `docs/policy.md`). 녹음 원본은 변환이 끝나면 삭제, 5년 지난 결제 기록 자동 파기 (응답 변경 없음) |
| 2026-09-25 | 개인정보 처리방침 `GET /privacy`·이용약관 `GET /terms` 추가 (HTML, `/api` 밖, 앱 설정 → 정보와 스토어 등록 URL용) |
| 2026-09-25 | 정책 확정: 탈퇴 후 30일 재가입 제한(`403 REJOIN_RESTRICTED` + `availableAt`, 30일 뒤 재가입 시 가입 선물 다시 지급), 탈퇴 데이터 정책 확정, 만료 링크 다시 공유 동작 확정 |
| 2026-09-25 | 링크 웹 페이지 `/t/{token}`을 디자인 하이파이(webOn·leOn)로 다시 만듦: 소포 뜯기 → 테이프 재생, 남은 기간 계산, "앱에서 열기"(`cassette://` 스킴), Open Graph, CSP nonce. `GET /static/og-image.png` 추가 |
| 2026-09-25 | `POST /billing/iap`의 `store` 값(`app_store` · `play`)과 잘못된 값의 오류(`VALIDATION_FAILED`)를 명시 |
| 2026-09-25 | 3단계: wallet(잔액·내역·선물), shop(상품·구매), billing(App Store·Google Play 결제 확인, AdMob SSV, 환불 알림), notifications(FCM 기기 등록·푸시) 구현. 로컬 개발 섹션(0장), `STORAGE_DRIVER=local`·`FFMPEG_MODE=passthrough`, `POST /dev/seed`·`POST /dev/credits`·`/dev-storage/*` 추가. 공개 엔드포인트 요청 횟수 제한. 탈퇴 시 카카오 연결 끊기·Apple 토큰 철회(`POST /auth/apple`에 `authorizationCode` 추가). 오류 코드 `GIFT_NOT_ALLOWED`·`RECEIPT_ALREADY_USED`·`IAP_UNAVAILABLE`·`BILLING_NOTIFICATIONS_UNAVAILABLE`·`INVALID_SIGNATURE` 추가. 앱 요청: 친구 테이프 `items` 순서 명시, 분류 안 함은 `groupName: null`, `POST /deliveries`의 `tag` 선택(null 허용) |
| 2026-09-25 | 2단계: recordings, deliveries, shelf, share(+웹 페이지 `/t/{token}`, `.well-known`), 친구 테이프 구현. `Me.drawer.unopenedCount`·`GET /shelf`의 `unopenedCount` 추가(앱 요청). 변환 후 실제 길이로 `durationMs` 갱신 명시(앱 요청). `GET /friends`는 차단한 사람 제외 명시(앱 요청). `GET /share/{token}`에 `state`·`deliveryId`, 오류 코드 `TAPE_NOT_OPENED`·`UPLOAD_NOT_FOUND`·`RECORDING_TOO_LARGE` 추가. `PATCH /shelf/items`의 `groupId`·`afterId` 필수 |
