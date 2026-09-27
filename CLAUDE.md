# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

tapeletter(테이프레터) API. 목소리 테이프를 녹음해 친구에게 보내는 앱(`../tapeletter-app`, Flutter)의 백엔드. (서비스 이름은 cassette에서 tapeletter로 바뀌었다. 저장소·폴더 이름은 관제자가 따로 바꾼다)

- **운영 내부 이름은 `cassette`로 남긴다**: `BULLMQ_PREFIX`·`S3_BUCKET` 기본값, compose `name`·볼륨·컨테이너(`cassette-edge` 등), edge Caddyfile의 버킷 경로 `/cassette/*`, DB 이름, 개발용 기본 비밀값 문자열. 바꾸면 운영 데이터 이전이 필요하다. 사용자에게 보이는 이름(워드마크, 약관, 스킴 `tapeletter://`, 패키지 `com.kebi.tapeletter`)만 tapeletter다

- NestJS 12, ESM(`"type": "module"`), 테스트는 vitest, 린트는 oxlint
- Postgres(TypeORM, **마이그레이션으로 관리**, `synchronize` 사용 금지), Redis + BullMQ, S3 호환 저장소(운영: SeaweedFS)
- 미니PC에서 docker compose로 운영하고, myhandball Caddy 뒤의 edge 입구(`docker-compose.edge.yml`, `cassette-edge`)로 `https://tapeletter.lab241.com`에 공개한다(옛 도메인 `cassette.lab241.com`은 2026-09-27에 닫았다)(Cloudflare Tunnel 방식도 파일은 남아 있다. `docs/deploy.md` 0장)
- 두 저장소에 공통으로 적용되는 아키텍처 결정(스키마, 흐름, 미결정 사항)은 `../ARCHITECTURE.md`에 있다 (저장소 바깥 파일)
- 클라이언트는 Flutter 앱 하나다. 응답 스펙은 앱 도메인 모델과 맞춘다
- **API 계약서는 `docs/api.md` 하나다.** 엔드포인트·응답·오류 코드를 바꾸면 같은 커밋에서 고치고 변경 이력에 적는다. 오류 코드는 `src/common/errors/error-codes.ts`와 표를 같게 유지한다

## 폴더 구조 — Nest CLI 생성 구조

공식 문서와 Nest CLI가 만드는 구조를 따른다. 모듈은 손으로 만들지 않고 `nest g resource <이름>` 또는 `nest g module|controller|service`로 만든다.

```
src/
├── <기능>/
│   ├── <기능>.module.ts
│   ├── <기능>.controller.ts
│   ├── <기능>.service.ts
│   ├── dto/
│   └── entities/
├── common/                  # decorators/ guards/ filters/ interceptors/ pipes/
├── config/
├── app.module.ts
└── main.ts
test/                        # e2e
```

계획한 모듈은 다음과 같다: `auth` `users` `friends` `recordings`(+ `recordings.processor.ts`, ffmpeg 변환 워커) `deliveries` `shelf` `share` `wallet` `shop` `billing` `notifications`

## 서버가 강제하는 규칙

클라이언트를 믿지 않는다. 아래 규칙은 서버에서만 판정한다.

- 크레딧은 음수가 될 수 없다. 모든 증감은 `credit_ledger`에 기록하고, 차감은 `UPDATE ... WHERE credits >= :price` 같은 조건부 UPDATE로 한다
- 보내기·구매·선물은 `Idempotency-Key` 헤더로 중복 처리를 막는다
- 광고 보상(하루 3회, 1회 10 크레딧)은 AdMob SSV 콜백을 받을 때만 지급한다
- 결제는 스토어 영수증을 서버에서 검증하고, `transaction_id`는 UNIQUE로 둔다
- 테이프 종류 코드는 녹음 한도(초)다: 15·60·180(15초·1분·3분). 1분·3분 테이프는 보낼 때 1개 차감한다. 15초는 무제한 무료다
- 공유 링크는 7일 동안 유효하다. 이미 받은 링크(taken), 만료된 링크(expired), 내가 보낸 링크(own)를 구분해 응답한다
- 가입하면 "가입 선물" 크레딧을 준다
- 탈퇴하고 `REJOIN_COOLDOWN_DAYS`(기본 30일) 동안은 같은 카카오·Apple 계정으로 다시 가입할 수 없다(`REJOIN_RESTRICTED`). 탈퇴 계정은 HMAC 해시와 탈퇴 시각만 `withdrawn_identities`에 남기고 기간이 지나면 정리 작업이 지운다. 30일 뒤 재가입하면 가입 선물을 다시 준다
- 기간 판정은 `ClockService`로 현재 시각을 받는다(e2e에서 시계를 옮긴다)
- 서랍(cap, 기본 12)이 꽉 차도 받은 테이프는 "분류 안 함"에 넣는다. 보관량과 cap을 응답에 담아 앱이 배너를 띄우게 한다
- 보낸 사람은 자기가 보낸 테이프를 들을 수 없다. 보낸 테이프 조회는 받았는지·들었는지만 준다
- 녹음 파일은 받는 사람에게만, 짧은 만료의 presigned URL로 준다
- 가격과 수치는 디자인 원본 `../design_handoff_cassette_app/source/TapeletterApp.logic.js`와 `docs/DATA_MODEL.md`를 기준으로 한다 (저장소 바깥, Claude Design 프로젝트 https://claude.ai/design/p/42baf543-407c-43b6-a96e-04d5997ef801 에서 받은 v2)

## 명령어

```bash
npm run start:dev
npm run build
npm run lint
npm test
npm run test:e2e
npm run migration:generate -- src/migrations/<이름>   # 엔티티 변경 → 마이그레이션 생성 (빌드 후 dist 기준)
npm run migration:run      # .env의 DATABASE_URL에 적용
npm run migration:revert
```

- 엔티티를 추가하면 `src/config/entities.ts`에, 마이그레이션을 만들면 `src/migrations/index.ts`에 넣는다 (glob 로딩을 쓰지 않는다. vitest와 dist 양쪽에서 같은 목록을 쓰기 위해)
- 로컬 개발은 Homebrew Postgres(`cassette_dev`)와 Redis를 쓴다. `.env.example`을 `.env`로 복사해 채운다
- 로컬에는 S3 저장소·ffmpeg를 설치하지 않는다. 개발 기본값은 `STORAGE_DRIVER=local`(파일은 `.data/storage`, 업로드·재생은 `/api/dev-storage/*` HMAC 서명 URL)과 `FFMPEG_MODE=passthrough`(원본 그대로, 길이는 앱이 알린 값)다. 운영에서는 둘 다 env 검증이 막는다. 실제 테이프 소리를 들으려면 `brew install ffmpeg` 후 `FFMPEG_MODE=real`
- 앱을 붙여 볼 때: `npm run start:dev` → `POST /api/auth/dev {"key","name"}` → `POST /api/dev/seed`(프로토타입 초기 데이터) → 크레딧은 `POST /api/dev/credits`. 실기기면 `PUBLIC_BASE_URL`을 맥의 IP로. 자세한 것은 `docs/api.md` 0장
- e2e는 `cassette_test` DB를 쓴다. 시작할 때 스키마를 지우고 마이그레이션을 처음부터 적용한다 (`test/global-setup.ts`)
- e2e는 로컬 Redis를 실제로 쓰고(BullMQ 접두어 `cassette-e2e`), 저장소와 ffmpeg는 `test/fakes.ts`의 메모리 저장소·가짜 ffmpeg로 바꾼다. 실제 ffmpeg 테스트는 ffmpeg가 있을 때만 돈다
- 녹음 파일은 `StorageService`(S3 호환, SeaweedFS/R2)로만 다룬다. 변환 워커는 `recordings.processor.ts`이고 API 프로세스 안에서 돈다
- 개인정보 처리방침·이용약관(`/privacy`, `/terms`)은 `src/policy/`에 있다. **이 저장소 코드가 실제로 수집·보관·전송하는 것만** 적는다. 저장 항목·보관 기간·외부 전송·가격·정책을 바꾸면 이 문서도 같은 커밋에서 고치고 version을 올린다. 법률 검토 전 초안이며 확인할 항목은 `docs/policy.md`
- 신고(`POST /api/reports`)는 운영자에게 로그 `warn`과 `REPORT_WEBHOOK_URL`로만 알리고 개인정보는 넣지 않는다. 운영자 조회는 `ops/reports/reports.sh`
- 개발 전용 API(`POST /api/auth/dev`, `/api/dev/*`, `/api/dev-storage/*`)는 `DevOnlyGuard`로 운영에서 404가 된다
- 외부 서비스(카카오, Apple, App Store, Google Play, AdMob 키, FCM)는 서비스 클래스로 감싸고 e2e에서는 `test/fakes.ts`의 가짜로 바꾼다. 키가 없으면 결제 확인은 503, 푸시는 로그만, 탈퇴 연결 해제는 건너뛴다
- 정리 작업(`jobs/`, 매시간): 24시간 지난 멱등 키, 1시간 넘게 uploading인 녹음, consume 못 한 Play 결제, 재가입 제한 기간이 지난 탈퇴 계정 해시, 변환이 끝난 녹음의 남은 원본, 탈퇴로 연결이 끊긴 5년 지난 결제 기록과 스토어 알림 기록, 3년 지난 신고 기록. 공개 엔드포인트는 `PublicThrottlerGuard`로 요청 횟수를 제한한다(e2e는 `THROTTLE_DISABLED=true`)
- 전역 인증 가드가 기본이다. 로그인 없이 부르는 API는 `@Public()`을 붙인다. 보내기·구매·선물처럼 멱등이 필요한 API는 `@Idempotent()`를 붙인다

```bash
# 운영 (미니PC) — 설치·배포·백업·복원·환경 변수·콘솔 URL은 docs/deploy.md
docker compose --env-file .env.production up -d --build   # 컨테이너 시작 시 마이그레이션 적용
```

- 운영 compose: postgres, redis, s3(SeaweedFS), api, 입구(edge: 기존 리버스 프록시 뒤 / tunnel: Cloudflare), pg-backup(매일 pg_dump), offsite-backup(rclone으로 R2/B2 복제). 백업 스크립트는 `ops/backup/`
- 운영 필수 비밀값: `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`(32바이트 base64, Apple 토큰 암호화), `IDENTITY_HASH_KEY`(32바이트 base64, 탈퇴 계정 해시), `POSTGRES_PASSWORD`, `S3_ROOT_PASSWORD`, `TUNNEL_TOKEN`

npm 10.9에는 이 템플릿의 peer 의존성을 풀다가 죽는 버그(`Cannot read properties of null (reading 'edgesOut')`)가 있다. 의존성을 새로 설치할 때는 `npx npm@11 install`을 쓴다.

## 커밋

- **커밋 메시지는 한 줄만 쓴다.** 본문이나 트레일러(Co-Authored-By 등)를 붙이지 않는다
- 접두어를 붙인다: `feat:` `fix:` `refactor:` `docs:` `test:` `chore:`
- 메시지 본문은 한국어로 쓴다. 예: `feat: 테이프 보내기 API(POST /deliveries) 추가`
