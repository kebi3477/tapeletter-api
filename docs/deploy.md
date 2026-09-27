# tapeletter API 운영 가이드 (미니PC)

> 서비스 이름은 **tapeletter**(테이프레터)다. compose 프로젝트·컨테이너·볼륨·DB·버킷(`/cassette/*`)·BullMQ 접두어 같은 **운영 내부 이름은 `cassette`로 남긴다**(바꾸면 운영 데이터 이전이 필요하다).

미니PC 한 대에서 `docker compose`로 전부 돌린다. 외부 공개는 두 방식 중 하나를 `.env.production`의 `COMPOSE_FILE`로 고른다.

| 방식 | 파일 | 언제 |
|---|---|---|
| **edge** (지금 미니PC) | `docker-compose.edge.yml` | 이미 443을 쓰는 리버스 프록시가 있을 때. 미니PC에서는 myhandball Caddy가 `tapeletter.lab241.com`을 `cassette-edge:80`으로 넘긴다 (0장) |
| tunnel | `docker-compose.tunnel.yml` | 도메인이 Cloudflare에 있고 포트를 열 수 없을 때 (2장) |

## 0. 지금 미니PC 구성 (edge, tapeletter.lab241.com)

```
인터넷 ─443─▶ 공유기 ─▶ myhandball-caddy (HTTPS, 인증서 자동)
                         └ tapeletter.lab241.com ─▶ cassette-edge:80 ─┬─ /cassette/* ─▶ s3:9000 (녹음 파일, presigned URL)
                                                                     └─ 그 밖 ───────▶ api:3000 (/api, /t, /.well-known, /static, /privacy, /terms)
```

- 도메인 하나로 전부 받는다: `PUBLIC_BASE_URL=https://tapeletter.lab241.com`, `S3_PUBLIC_ENDPOINT=https://tapeletter.lab241.com`(버킷 경로 `/cassette/*`로 저장소(SeaweedFS)에 간다. 버킷 이름은 내부 이름이라 `cassette` 그대로).
- 옛 도메인 `cassette.lab241.com`은 이름 변경 전환 기간에만 같이 열었고, 2026-09-27에 닫았다(가비아 레코드 삭제, myhandball Caddy 블록 제거, `APPLE_CLIENT_IDS`에서 `com.kebi.cassette` 제거).
- DNS: 가비아 `lab241.com`에 `tapeletter`(전환 기간에는 `cassette`도) A 레코드 → 미니PC 공인 IP. 인증서는 myhandball Caddy가 발급·갱신한다.
- myhandball `deploy/Caddyfile`에 `tapeletter.lab241.com { reverse_proxy cassette-edge:80 }` 블록이 있고, `cassette-edge` 컨테이너만 `myhandball_default` 네트워크에 들어간다. api·s3를 그 네트워크에 넣지 않는 이유는 서비스 이름(`api`, `postgres`)이 myhandball과 겹쳐 엉뚱한 컨테이너로 가기 때문이다.
- 실제 사용자 IP: 바깥 Caddy가 `X-Forwarded-For`를 만들고, `cassette-edge`는 그 값을 바꾸지 않고 넘긴다(API는 `trust proxy 1`).
- 공유기는 집 안에서 공인 IP로 되돌아오는 접속을 지원하지 않아서, 같은 공유기 안의 기기는 `tapeletter.lab241.com`에 닿지 않는다. 집 안 테스트는 LTE로 하거나 맥의 로컬 서버를 쓴다.

```
인터넷 ──▶ Cloudflare ──(Tunnel)──▶ cloudflared ─┬─▶ api:3000   (api.<도메인>, <도메인>)
                                                 └─▶ s3:9000 (files.<도메인>)
미니PC (docker compose, 프로젝트 이름 cassette — 내부 이름)
  postgres · redis · s3(SeaweedFS) · api(+변환 워커) · edge 또는 cloudflared · cloudflared · pg-backup · offsite-backup
```

| 서비스 | 이미지 | 하는 일 | healthcheck |
|---|---|---|---|
| `postgres` | postgres:16-alpine | DB | `pg_isready` |
| `redis` | redis:7-alpine | BullMQ(변환 큐) | `redis-cli ping` |
| `s3` | chrislusf/seaweedfs | 녹음 파일 (S3 호환, 포트 9000). MinIO가 커뮤니티 도커 이미지 배포를 멈춰서 바꿨다 | `GET /healthz` |
| `edge` | caddy:2-alpine | (edge 방식) 앞단 프록시에서 받아 api·s3로 나눈다 | `GET /api/health` |
| `api` | 이 저장소 Dockerfile (ffmpeg 포함) | API + 변환 워커 + 정리 작업. 시작할 때 마이그레이션 적용 | `GET /api/health` |
| `cloudflared` | cloudflare/cloudflared | Cloudflare Tunnel (토큰 방식) | 없음(이미지에 셸이 없다). 대시보드의 터널 상태로 본다 |
| `pg-backup` | postgres:16-alpine | 매일 `pg_dump` → `./backups/postgres` | `pgrep crond` |
| `offsite-backup` | rclone/rclone | 매일 녹음 파일 버킷 + DB 백업을 R2/B2로 복제 | `pgrep crond` |

- 모든 서비스는 `restart: unless-stopped`이고, 로그는 json-file로 서비스마다 10MB × 5개까지만 남긴다.
- `api`는 postgres·redis·s3가 healthy가 된 뒤에 시작한다. `cloudflared`는 api가 healthy가 된 뒤에 붙는다.
- 호스트에 여는 포트는 모두 `127.0.0.1`에만 묶는다(3000 API, 9000 저장소 S3). 외부에서는 입구(edge·cloudflared)로만 들어온다.

---

## 1. 처음 설치

권장: Ubuntu Server 24.04 LTS, RAM 8GB 이상, SSD. 가장 긴 3분 녹음이 약 1.4MB라서 디스크는 넉넉히 잡는다.

```bash
# 1) Docker Engine + compose 플러그인 (공식 설치 스크립트)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
sudo systemctl enable --now docker          # 재부팅해도 docker가 뜨고, 컨테이너는 restart 정책으로 다시 뜬다
sudo timedatectl set-timezone Asia/Seoul    # 로그 읽기 편하게 (cron은 컨테이너 안에서 UTC 기준)

# 2) 소스
git clone https://github.com/kebi3477/tapeletter-api.git ~/projects/tapeletter-api
cd ~/projects/tapeletter-api

# 3) 환경 변수
cp .env.example .env.production
chmod 600 .env.production
openssl rand -base64 48   # → JWT_SECRET
openssl rand -base64 32   # → TOKEN_ENCRYPTION_KEY
openssl rand -base64 32   # → IDENTITY_HASH_KEY (다른 값)
openssl rand -base64 24   # → POSTGRES_PASSWORD, S3_ROOT_PASSWORD (각각)
vi .env.production        # 아래 "4. 환경 변수" 표의 필수 값 채우기

# 4) Cloudflare Tunnel 만들기 (2장) → TUNNEL_TOKEN을 .env.production에

# 5) 시작
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps          # 모두 healthy인지
curl -s http://127.0.0.1:3000/api/health             # {"status":"ok"}
curl -s https://api.<도메인>/api/health               # 터널 경유
```

> `.env.production`은 git에 올리지 않는다(`.gitignore`). **비밀번호 관리자 등 미니PC 밖에도 사본을 둔다.** 특히 `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `IDENTITY_HASH_KEY`, `POSTGRES_PASSWORD`, `S3_ROOT_PASSWORD`, `OFFSITE_*`가 없으면 복원할 수 없다.

---

## 2. Cloudflare Tunnel

1. 도메인을 Cloudflare에 연결한다(네임서버 변경).
2. Zero Trust → Networks → Tunnels → **Create a tunnel** → Cloudflared → 이름 `cassette`
3. 설치 명령에 나오는 토큰(`eyJ…`)만 복사해 `.env.production`의 `TUNNEL_TOKEN`에 넣는다. (설치 명령은 실행하지 않는다. compose의 `cloudflared`가 대신 돈다)
4. **Public Hostnames**를 세 개 만든다.

| 호스트 이름 | 서비스 | 쓰는 곳 |
|---|---|---|
| `api.<도메인>` | `http://api:3000` | 앱의 API 주소 `https://api.<도메인>/api`, 스토어·AdMob 콜백 |
| `<도메인>` (루트) | `http://api:3000` | `PUBLIC_BASE_URL=https://<도메인>` → 링크 `https://<도메인>/t/{token}`, `/.well-known/*` |
| `files.<도메인>` | `http://s3:9000` | `S3_PUBLIC_ENDPOINT=https://files.<도메인>` → presigned 업로드·재생 URL |

- `files.<도메인>`의 **HTTP Host Header를 바꾸지 않는다**(기본값). presigned URL 서명에 Host가 들어가 있어서 바꾸면 403이 난다.
- Cloudflare 대시보드 → Caching → Cache Rules에서 `files.<도메인>`은 **캐시 우회(Bypass)**. 서명 URL이라 캐시할 이유가 없다.
- Security → Bots의 "Bot Fight Mode"는 앱 요청을 막을 수 있으니 `api.<도메인>`에는 끈다(또는 WAF 예외).
- 요청 본문 한도(무료 플랜 100MB)는 녹음 최대 6MB라 문제없다.

---

## 3. 배포 · 업데이트 · 마이그레이션

```bash
cd ~/projects/tapeletter-api
# (권장) 업데이트 전에 DB 백업 한 번
docker compose --env-file .env.production run --rm --entrypoint /bin/sh pg-backup /ops/backup/pg-backup.sh

git pull
docker compose --env-file .env.production up -d --build   # api 이미지를 다시 만들고 바뀐 서비스만 재시작
docker compose --env-file .env.production logs -f api     # "Migration ... has been executed" / "Nest application successfully started"
```

- **마이그레이션은 api 컨테이너가 시작할 때 자동으로 적용된다**(`Dockerfile` CMD: `typeorm migration:run` → `node dist/main.js`). 실패하면 api가 뜨지 않고 이전 컨테이너는 이미 내려가 있으니, 로그를 보고 고치거나 되돌린다.
- 적용 상태 보기 / 되돌리기:
  ```bash
  docker compose --env-file .env.production exec api node node_modules/typeorm/cli.js -d dist/config/data-source.js migration:show
  docker compose --env-file .env.production exec api node node_modules/typeorm/cli.js -d dist/config/data-source.js migration:revert
  ```
- 코드 되돌리기: `git checkout <이전 커밋>` → `up -d --build`. 새 마이그레이션이 들어간 배포를 되돌릴 때는 **먼저** 위 `migration:revert`를 새 코드 컨테이너에서 실행한 뒤 코드를 되돌린다.
- 이미지 정리: `docker image prune -f` (가끔)
- 모니터링: Uptime Kuma 등에서 `https://api.<도메인>/api/health`를 1분 간격으로 확인한다.

---

## 4. 환경 변수

`.env.example`을 복사해 `.env.production`을 만든다. **필수**는 비어 있으면 서버가 시작하지 않거나(env 검증) 핵심 기능이 동작하지 않는 값이다.

### compose가 정하는 값 (직접 넣지 않는다)
`NODE_ENV=production`, `PORT=3000`, `DATABASE_URL`, `REDIS_URL`, `STORAGE_DRIVER=s3`, `FFMPEG_MODE=real`, `S3_ENDPOINT=http://s3:9000`, `S3_ACCESS_KEY`/`S3_SECRET_KEY`(= 저장소 루트 계정), `S3_CREATE_BUCKET=true`

### 인프라
| 변수 | 필수 | 설명 · 어디서 받나 |
|---|---|---|
| `POSTGRES_PASSWORD` | 필수 | `openssl rand -base64 24` |
| `POSTGRES_USER`, `POSTGRES_DB` | 선택 | 기본 `cassette` |
| `S3_ROOT_PASSWORD` | 필수 | `openssl rand -base64 24` (8자 이상) |
| `S3_ROOT_USER` | 선택 | 기본 `cassette` |
| `S3_BUCKET` | 선택 | 기본 `cassette` (없으면 시작할 때 만든다) |
| `S3_REGION` | 선택 | 기본 `us-east-1` |
| `S3_PUBLIC_ENDPOINT` | 필수 | `https://files.<도메인>` (2장) |
| `TUNNEL_TOKEN` | 필수 | Cloudflare Zero Trust → Tunnels (2장) |
| `PUBLIC_BASE_URL` | 필수 | `https://<도메인>` (링크 주소) |
| `BULLMQ_PREFIX` | 선택 | 기본 `cassette` |
| `FFMPEG_PATH`, `FFPROBE_PATH` | 선택 | 이미지 안 기본값 그대로 |
| `JOBS_DISABLED` | 선택 | `true`면 정리 작업(cron) 끔. 보통 비움 |

### 보안
| 변수 | 필수 | 설명 · 어디서 받나 |
|---|---|---|
| `JWT_SECRET` | 필수 | 32자 이상. `openssl rand -base64 48`. 바꾸면 모든 사용자가 다시 로그인한다 |
| `TOKEN_ENCRYPTION_KEY` | 필수 | 32바이트 base64. `openssl rand -base64 32`. Apple refresh token 암호화. 바꾸면 저장된 Apple 토큰을 철회할 수 없다 |
| `IDENTITY_HASH_KEY` | 필수 | 32바이트 base64. `openssl rand -base64 32` (`TOKEN_ENCRYPTION_KEY`와 다른 값). 탈퇴한 소셜 계정을 해시로만 기록해 재가입을 제한한다. 바꾸면 그 전에 탈퇴한 계정의 제한이 풀린다 |
| `REJOIN_COOLDOWN_DAYS` | 선택 | 탈퇴 후 같은 카카오·Apple 계정으로 다시 가입할 수 없는 기간(일). 기본 30 |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | 선택 | 초. 기본 3600 / 5184000(60일) |

### 로그인
| 변수 | 필수 | 설명 · 어디서 받나 |
|---|---|---|
| `KAKAO_APP_ID` | 필수 | Kakao Developers → 내 애플리케이션 → 앱 키 화면의 **앱 ID**(숫자) |
| `APPLE_CLIENT_IDS` | 필수 | iOS 번들 ID (웹 로그인을 쓰면 Services ID도 쉼표로) |
| `KAKAO_ADMIN_KEY` | 선택 | 앱 키의 **Admin 키**. 탈퇴 시 연결 끊기. 없으면 건너뜀 |
| `APPLE_TEAM_ID` | 선택 | Apple Developer 멤버십의 Team ID. 탈퇴 시 Apple 토큰 철회 |
| `APPLE_SIGN_IN_KEY_ID`, `APPLE_SIGN_IN_PRIVATE_KEY` | 선택 | Certificates, IDs & Profiles → Keys → "Sign in with Apple" 키(.p8). 내용을 한 줄로 넣을 때는 줄바꿈을 `\n`으로 |
| `SIGNUP_GIFT_CREDITS` | 선택 | 가입 선물. 기본 10 |

### 앱 버전 · 링크
| 변수 | 필수 | 설명 |
|---|---|---|
| `APP_MIN_VERSION_IOS/ANDROID`, `APP_LATEST_VERSION_IOS/ANDROID` | 필수 | 강제 업데이트 기준 (`x.y.z`) |
| `APP_STORE_URL_IOS`, `APP_STORE_URL_ANDROID` | 필수 | 스토어 주소 (기본값은 자리표시자) |
| `APPLE_APP_ID` | 선택 | `<TEAM ID>.<번들 ID>`. 유니버설 링크 파일. 없으면 404 |
| `ANDROID_PACKAGE_NAME`, `ANDROID_SHA256_FINGERPRINTS` | 선택 | 앱 링크 파일(assetlinks.json). Play Console → 앱 무결성 → 앱 서명 키 인증서 SHA-256 |

### 푸시 · 결제 · 광고
| 변수 | 필수 | 설명 · 어디서 받나 |
|---|---|---|
| `FCM_SERVICE_ACCOUNT_JSON` | 사실상 필수 | Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키(JSON). 원문 또는 base64. 없으면 푸시는 로그만 |
| `APPLE_BUNDLE_ID` | 결제 시 필수 | iOS 번들 ID. 없으면 iOS 결제 확인 503 |
| `APPLE_APP_APPLE_ID` | 결제 시 필수 | App Store Connect → 앱 정보 → Apple ID(숫자). 운영 영수증 검증 |
| `APPLE_IAP_ALLOW_SANDBOX` | 선택 | 기본 true (앱 심사가 샌드박스로 결제한다) |
| `APPLE_ROOT_CERTS_DIR` | 선택 | Apple 루트 인증서 폴더. 비우면 apple.com에서 받는다 |
| `GOOGLE_PLAY_PACKAGE_NAME` | 결제 시 필수 | 안드로이드 패키지 이름 |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | 결제 시 필수 | Google Cloud 서비스 계정 키(JSON). Play Console → 사용자 및 권한에서 이 계정에 "재무 데이터 보기", "주문 관리" 권한 |
| `GOOGLE_RTDN_AUDIENCE` | 선택 | Play 환불 알림(Pub/Sub 푸시) OIDC audience. 보통 `https://api.<도메인>/api/billing/google/rtdn`. 없으면 RTDN 503 |

### 백업
| 변수 | 필수 | 설명 |
|---|---|---|
| `BACKUP_DIR` | 선택 | 기본 `./backups` (DB 덤프가 쌓이는 호스트 폴더) |
| `PG_BACKUP_CRON` | 선택 | 기본 `0 19 * * *` (UTC 19:00 = 한국 04:00) |
| `PG_BACKUP_KEEP` | 선택 | 로컬에 남길 덤프 개수. 기본 14 |
| `OFFSITE_BACKUP_CRON` | 선택 | 기본 `30 19 * * *` (한국 04:30) |
| `OFFSITE_PROVIDER` | 권장 | R2: `Cloudflare` · B2: `Other` |
| `OFFSITE_ENDPOINT` | 권장 | R2: `https://<계정 ID>.r2.cloudflarestorage.com` · B2: `https://s3.<리전>.backblazeb2.com` |
| `OFFSITE_REGION` | 선택 | R2: `auto` · B2: 리전(예: `us-west-004`) |
| `OFFSITE_BUCKET` | 권장 | 외부 버킷 이름. **비우면 외부 복제를 건너뛴다** |
| `OFFSITE_ACCESS_KEY_ID`, `OFFSITE_SECRET_ACCESS_KEY` | 권장 | R2: API 토큰(Object Read & Write) · B2: Application Key |
| `OFFSITE_POSTGRES_RETENTION` | 선택 | 외부 DB 덤프 보관 기간. 기본 `30d` |
| `OFFSITE_DELETED_RETENTION` | 선택 | 저장소에서 지워진 파일을 외부에 남기는 기간. 기본 `30d` |

### 신고 알림
| 변수 | 필수 | 설명 |
|---|---|---|
| `REPORT_WEBHOOK_URL` | 선택 | 신고가 들어오면 JSON을 POST할 웹훅(슬랙 Incoming Webhook의 `text`, 디스코드 웹훅의 `content`를 둘 다 넣는다). 신고 번호·사유·대상 유형만 보낸다. 없으면 서버 로그(`warn`)만 |

### 개인정보 처리방침 · 이용약관 (`/privacy`, `/terms`)
비어 있으면 페이지에 "준비 중"으로 표시하고, 운영에서는 시작할 때 경고 로그만 남긴다(서버는 뜬다). 문서 내용과 사용자 확인이 필요한 항목은 `docs/policy.md`.

| 변수 | 필수 | 설명 |
|---|---|---|
| `POLICY_OPERATOR_NAME` | 권장 | 상호 또는 운영자 이름 (개인사업자 등록 후 상호) |
| `POLICY_CONTACT_EMAIL` | 권장 | 문의·개인정보 보호책임자 연락 이메일 |
| `POLICY_PRIVACY_OFFICER` | 권장 | 개인정보 보호책임자 이름 |
| `POLICY_BUSINESS_INFO` | 선택 | 사업자등록번호 · 통신판매업 신고번호 (예: `사업자등록번호 000-00-00000 · 통신판매업 신고 제2026-서울○○-0000호`) |
| `POLICY_EFFECTIVE_DATE` | 권장 | 시행일 `YYYY-MM-DD` |

---

## 5. 콘솔에 등록할 URL

| 콘솔 | 설정 | 값 |
|---|---|---|
| App Store Connect | 앱 → 앱 정보 → App Store 서버 알림 (**버전 2**), 프로덕션·샌드박스 둘 다 | `https://api.<도메인>/api/billing/apple/notifications` |
| App Store Connect | 앱 내 구입 → 소비성 상품 | `tapeletter.credits_100`, `tapeletter.credits_550`, `tapeletter.credits_1200` |
| Google Play Console | 수익 창출 설정 → 실시간 개발자 알림 → Pub/Sub 주제 | 주제에 `google-play-developer-notifications@system.gserviceaccount.com` 게시자 권한 |
| Google Cloud Pub/Sub | 위 주제의 **푸시 구독** → 엔드포인트 · 인증 사용(서비스 계정) · audience | `https://api.<도메인>/api/billing/google/rtdn` · audience = `GOOGLE_RTDN_AUDIENCE` |
| Google Play Console | 인앱 상품 (관리형, 소비성) | `tapeletter.credits_100`, `tapeletter.credits_550`, `tapeletter.credits_1200` |

상품 ID는 App Store·Google Play 모두 `tapeletter.credits_100`·`tapeletter.credits_550`·`tapeletter.credits_1200`으로 같게 만든다(서버 `src/shop/products.ts`와 같아야 결제를 확인한다). 옛 ID `credits_*`는 같은 Apple 팀의 다른 앱이 쓰고 있어 쓸 수 없다.
| AdMob | 보상형 광고 단위 → 서버 측 확인(SSV) → 콜백 URL | `https://api.<도메인>/api/billing/admob/ssv` |
| Firebase | 프로젝트 설정 → 클라우드 메시징 → Apple 앱 구성 | APNs 인증 키(.p8) 업로드 (iOS 푸시) |
| Apple Developer | 번들 ID → Associated Domains / 앱 Entitlements | `applinks:<도메인>` (링크 `/t/*`) |
| Android 앱 | intent-filter (autoVerify) | `https://<도메인>/t/*` |
| Kakao Developers | 플랫폼 → iOS 번들 ID / Android 패키지·키 해시 | 앱 설정 |
| Uptime Kuma 등 | HTTP 모니터 | `https://api.<도메인>/api/health` |
| App Store Connect · Google Play Console | 개인정보 처리방침 URL · (Play) 이용약관 | `https://<도메인>/privacy` · `https://<도메인>/terms` (지금 미니PC: `https://tapeletter.lab241.com/privacy`, `/terms`) |

---

## 6. 백업

**사람 목소리는 잃으면 복구할 수 없다.** 백업은 두 겹이다.

1. `pg-backup`: 매일 `pg_dump --format=custom`(압축)을 `./backups/postgres/<DB>-<UTC 시각>.dump`로 쓰고 최근 `PG_BACKUP_KEEP`개만 남긴다.
2. `offsite-backup`: 매일 rclone으로
   - 녹음 파일 버킷 → `offsite:<OFFSITE_BUCKET>/files` (`sync`. 저장소에서 지워진 파일은 `files-deleted/<날짜>/`로 옮겨 `OFFSITE_DELETED_RETENTION` 동안 보관)
   - `./backups/postgres` → `offsite:<OFFSITE_BUCKET>/postgres` (`copy`, `OFFSITE_POSTGRES_RETENTION` 지나면 삭제)

지금 바로 한 번 돌리기 / 확인:
```bash
docker compose --env-file .env.production run --rm --entrypoint /bin/sh pg-backup /ops/backup/pg-backup.sh
docker compose --env-file .env.production run --rm --entrypoint /bin/sh offsite-backup /ops/backup/offsite.sh
ls -lh backups/postgres
docker compose --env-file .env.production run --rm --entrypoint rclone offsite-backup lsd "offsite:<OFFSITE_BUCKET>"
docker compose --env-file .env.production logs --tail 50 pg-backup offsite-backup
```

> 한 달에 한 번은 7장의 복원을 **다른 컴퓨터나 임시 DB에** 실제로 해 본다. 확인하지 않은 백업은 백업이 아니다.

---

### 외장하드 백업 (미니PC)

미니PC에 USB 외장하드(2TB, FAT32, 라벨 `2TB`)를 `/mnt/backup`에 붙여 두고, `external-backup` 서비스가 매일 한국 05:00에 복제한다. FAT32 그대로 써서 맥에 꽂아도 열린다(파일 하나 4GB 제한은 녹음·DB 덤프 크기로는 문제없다).

- 마운트 (`/etc/fstab`, 빠져 있어도 부팅이 멈추지 않게 `nofail`):
  `LABEL=2TB /mnt/backup vfat uid=1000,gid=1000,umask=022,nofail,x-systemd.device-timeout=10 0 0`
- `.env.production`: `EXTERNAL_BACKUP_DIR=/mnt/backup`
- 외장하드 안의 `tapeletter-backup/.target` 표식이 있을 때만 돈다. 하드가 빠지면 `/mnt/backup`은 내장 저장소의 빈 폴더라서, 거기에 쌓지 않으려는 장치다
- 구조: `tapeletter-backup/files/`(녹음 파일 버킷 그대로), `files-deleted/<날짜>/`(지워진 파일 90일), `postgres/`(DB 덤프 90일), `LAST_SUCCESS`(마지막 성공 시각)
- 바로 한 번 돌리기: `docker compose --env-file .env.production run --rm --entrypoint /bin/sh external-backup /ops/backup/external.sh`
- 복원: DB는 `tapeletter-backup/postgres/`의 덤프를 7-1과 같은 방법으로, 녹음 파일은
  `docker compose --env-file .env.production run --rm --entrypoint rclone external-backup copy /external/tapeletter-backup/files store:cassette --transfers 8`
- 기존 파일(`prev/` 등)은 건드리지 않는다

## 7. 복원

### 7-1. DB만 되돌리기 (같은 미니PC)
```bash
cd ~/projects/tapeletter-api
docker compose --env-file .env.production stop api cloudflared        # 쓰기를 멈춘다
ls -lt backups/postgres | head                                         # 되돌릴 덤프 고르기
docker compose --env-file .env.production run --rm --entrypoint /bin/sh pg-backup -c \
  'pg_restore --clean --if-exists --no-owner --single-transaction -d "$PGDATABASE" /backups/postgres/<파일>.dump'
docker compose --env-file .env.production up -d                        # api가 뜨면서 이후 마이그레이션을 적용한다
```

외부 저장소에만 있는 덤프라면 먼저 받아 온다:
```bash
docker compose --env-file .env.production run --rm -v "$PWD/backups:/restore" --entrypoint /bin/sh offsite-backup -c \
  'rclone copy "offsite:$OFFSITE_BUCKET/postgres/<파일>.dump" /restore/postgres/'
```

### 7-2. 녹음 파일 되돌리기
```bash
# 외부 → 저장소 (있는 파일은 건너뛰고 없는 것만 채운다)
docker compose --env-file .env.production run --rm --entrypoint /bin/sh offsite-backup -c \
  'rclone copy "offsite:$OFFSITE_BUCKET/files" "store:$S3_BUCKET" --transfers 8'
```

### 7-3. 미니PC가 통째로 망가졌을 때
1. 새 장비에 1장의 1)~2)를 한다.
2. 보관해 둔 `.env.production`을 그대로 복사한다(같은 비밀값이어야 기존 로그인·서명·암호화가 유지된다).
3. 저장소만 먼저 띄운다: `docker compose --env-file .env.production up -d postgres redis s3`
4. 7-1의 "외부 저장소에서 받아 오기" → `pg_restore` (DB가 비어 있으므로 `--clean` 없이도 된다)
5. 7-2로 녹음 파일을 채운다. (버킷은 api가 시작할 때 만들지만, 먼저 채우려면 `docker compose ... run --rm --entrypoint rclone offsite-backup mkdir "storeo:cassette"`)
6. 전체 시작: `docker compose --env-file .env.production up -d --build` → 터널이 붙으면 끝. 같은 `TUNNEL_TOKEN`이면 Cloudflare 설정은 그대로 쓴다.

---

## 8. 신고 처리

앱의 신고(`POST /api/reports`)는 `reports` 테이블에 쌓인다. 관리자 API는 아직 없어서 미니PC에서 스크립트로 본다. 새 신고는 api 로그의 `[신고] id=…` 줄과 `REPORT_WEBHOOK_URL`(설정 시)로 알 수 있다.

```bash
cd ~/projects/tapeletter-api
ops/reports/reports.sh list            # 최근 신고 20개 (처리 안 한 received가 먼저, KST 시각·사유·대상 이름·신고자·메모 앞부분)
ops/reports/reports.sh list 50
ops/reports/reports.sh show <신고 id>   # 한 건 자세히: 대상 사람/테이프(보낸 사람, 보낸 시각, 파일 키), 같은 대상에 대한 신고 수
ops/reports/reports.sh set <신고 id> reviewed    # 상태: received → reviewed(확인함) → actioned(조치함) | dismissed(조치 안 함)
```

- 스크립트는 `docker compose --env-file .env.production exec postgres psql`로 돈다(`ENV_FILE`로 env 파일을 바꿀 수 있다).
- 테이프 내용 확인이 필요하면 `show`의 `tape_file_key`로 저장소에서 파일을 찾는다. 신고 기록에는 녹음 파일을 복사하지 않는다.
- 조치(계정 삭제 등)는 아직 도구가 없다. 필요하면 DB에서 직접 처리하고, 처리한 뒤 상태를 `actioned`로 바꾼다.
- 신고 기록은 3년 보관하고 매시간 정리 작업이 지운다. 신고자가 탈퇴하면 신고자만 비워 둔다(`신고자` 칸이 `(탈퇴)`).

## 9. 자주 쓰는 명령

```bash
alias dc='docker compose --env-file .env.production'
dc ps                              # 상태 (healthy 확인)
dc logs -f --tail 100 api          # 로그
dc restart api
dc exec postgres psql -U cassette cassette
dc exec api node node_modules/typeorm/cli.js -d dist/config/data-source.js migration:show
docker system df                   # 디스크 사용량
```

## 10. 검증 메모

- 이 저장소에서는 Docker 데몬 없이 `docker compose --env-file <예시 env> config --quiet`로 compose 문법·변수 치환을 확인했다. 실제 컨테이너 기동(이미지 빌드, healthcheck, 터널 연결, 백업 cron)은 미니PC에서 처음 올릴 때 1장 5)의 순서로 확인한다.
