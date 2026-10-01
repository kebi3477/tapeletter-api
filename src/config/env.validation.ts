import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  validateSync,
} from 'class-validator';

import { decodeBase64Strict } from '../common/utils/strict-encoding.js';

const SEMVER = /^\d+\.\d+\.\d+$/;

/** 개발 전용 기본 토큰 암호화 키 (운영에서는 거절) */
export const DEV_TOKEN_ENCRYPTION_KEY = Buffer.alloc(
  32,
  'cassette-dev-only',
).toString('base64');

/** 개발 전용 기본 탈퇴 계정 해시 키 (운영에서는 거절) */
export const DEV_IDENTITY_HASH_KEY = Buffer.alloc(
  32,
  'cassette-dev-identity',
).toString('base64');

@ValidatorConstraint({ name: 'isBase64Key32' })
class IsBase64Key32 implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'string' && decodeBase64Strict(value)?.length === 32
    );
  }

  defaultMessage(): string {
    return '32바이트를 base64로 적어야 합니다 (openssl rand -base64 32)';
  }
}

export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  /** postgres://user:password@host:5432/db */
  @IsString()
  @Matches(/^postgres(ql)?:\/\//)
  DATABASE_URL: string;

  /** BullMQ(변환 큐)용 Redis */
  @IsString()
  @Matches(/^rediss?:\/\//)
  REDIS_URL: string = 'redis://localhost:6379';

  /** BullMQ 키 접두어. 테스트와 개발 서버가 같은 Redis를 써도 섞이지 않게 */
  @IsString()
  BULLMQ_PREFIX: string = 'cassette';

  /** S3 호환 저장소(MinIO, R2). 비우면 AWS S3 기본 주소 */
  @IsOptional()
  @IsUrl({ require_tld: false })
  S3_ENDPOINT?: string;

  /** 앱이 presigned URL로 접속할 주소. 컨테이너 안 주소(S3_ENDPOINT)와 다를 때 */
  @IsOptional()
  @IsUrl({ require_tld: false })
  S3_PUBLIC_ENDPOINT?: string;

  @IsString()
  S3_REGION: string = 'us-east-1';

  @IsString()
  S3_BUCKET: string = 'cassette';

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  S3_SECRET_KEY?: string;

  /** MinIO는 path-style이 필요하다 */
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  S3_FORCE_PATH_STYLE: boolean = true;

  /** 시작할 때 버킷이 없으면 만든다 (MinIO 개발·운영 편의) */
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  S3_CREATE_BUCKET: boolean = false;

  /** 링크 주소의 앞부분. 예: https://tapeletter.lab241.com → https://tapeletter.lab241.com/t/{token} */
  @IsUrl({ require_tld: false })
  PUBLIC_BASE_URL: string = 'http://localhost:3000';

  @IsString()
  FFMPEG_PATH: string = 'ffmpeg';

  @IsString()
  FFPROBE_PATH: string = 'ffprobe';

  /** 녹음 파일 저장소: s3(MinIO·R2) 또는 local(개발 전용, 디스크 + API 서명 URL) */
  @IsIn(['s3', 'local'])
  STORAGE_DRIVER: 's3' | 'local' = 's3';

  /** local 드라이버가 파일을 두는 곳 */
  @IsString()
  LOCAL_STORAGE_DIR: string = '.data/storage';

  /** real: ffmpeg로 테이프 소리 변환 · passthrough: 원본 그대로(개발 전용, ffmpeg 없이) */
  @IsIn(['real', 'passthrough'])
  FFMPEG_MODE: 'real' | 'passthrough' = 'real';

  /** 공개 엔드포인트 요청 횟수 제한 끄기 (e2e 전용) */
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  THROTTLE_DISABLED: boolean = false;

  /** 요청 기록(request_logs)·edge 접속 로그 보관 기간(일). 지나면 정리 작업이 지운다 */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(3650)
  LOG_RETENTION_DAYS: number = 30;

  /** 요청 기록을 표준 출력(docker logs)에도 JSON 한 줄로 쓴다 (e2e는 false) */
  @Transform(
    ({ value }) => value === undefined || value === true || value === 'true',
  )
  @IsBoolean()
  REQUEST_LOG_STDOUT: boolean = true;

  /** 정리 작업(cron) 끄기 */
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  JOBS_DISABLED: boolean = false;

  // ---- 결제 · 광고 ----

  /** App Store 번들 ID. 없으면 iOS 결제 확인은 503 IAP_UNAVAILABLE */
  @IsOptional()
  @IsString()
  APPLE_BUNDLE_ID?: string;

  /** App Store Connect의 앱 Apple ID(숫자). 운영(Production) 영수증 검증에 필요 */
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  APPLE_APP_APPLE_ID?: number;

  /** 샌드박스 결제도 받는다 (앱 심사는 샌드박스로 결제한다) */
  @Transform(
    ({ value }) => value === undefined || value === true || value === 'true',
  )
  @IsBoolean()
  APPLE_IAP_ALLOW_SANDBOX: boolean = true;

  /** Apple 루트 인증서(.cer)가 있는 폴더. 없으면 apple.com에서 받아 온다 */
  @IsOptional()
  @IsString()
  APPLE_ROOT_CERTS_DIR?: string;

  /** Google Play 패키지 이름. 없으면 Android 결제 확인은 503 */
  @IsOptional()
  @IsString()
  GOOGLE_PLAY_PACKAGE_NAME?: string;

  /** Google Play Developer API용 서비스 계정 JSON (원문 또는 base64) */
  @IsOptional()
  @IsString()
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?: string;

  /** Play 실시간 알림(Pub/Sub 푸시)의 OIDC 토큰 audience. 없으면 RTDN은 503 */
  @IsOptional()
  @IsString()
  GOOGLE_RTDN_AUDIENCE?: string;

  /** FCM HTTP v1용 서비스 계정 JSON (원문 또는 base64). 없으면 푸시는 로그만 */
  @IsOptional()
  @IsString()
  FCM_SERVICE_ACCOUNT_JSON?: string;

  // ---- 탈퇴 시 소셜 연결 해제 ----

  /** 카카오 어드민 키 (연결 끊기) */
  @IsOptional()
  @IsString()
  KAKAO_ADMIN_KEY?: string;

  /** Sign in with Apple 토큰 교환·철회용 */
  @IsOptional()
  @IsString()
  APPLE_TEAM_ID?: string;

  @IsOptional()
  @IsString()
  APPLE_SIGN_IN_KEY_ID?: string;

  /** .p8 내용 (줄바꿈은 \n으로 적어도 된다) */
  @IsOptional()
  @IsString()
  APPLE_SIGN_IN_PRIVATE_KEY?: string;

  /** 신고가 들어오면 JSON을 POST할 웹훅 (슬랙·디스코드 등). 없으면 로그만 */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsUrl({ require_tld: false })
  REPORT_WEBHOOK_URL?: string;

  // ---- 개인정보 처리방침 · 이용약관 (/privacy, /terms). 비어 있으면 페이지에 "준비 중"으로 표시 ----

  /** 상호 또는 운영자 이름 */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsString()
  POLICY_OPERATOR_NAME?: string;

  /** 문의·개인정보 보호책임자 연락 이메일 */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsEmail()
  POLICY_CONTACT_EMAIL?: string;

  /** 개인정보 보호책임자 이름 */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsString()
  POLICY_PRIVACY_OFFICER?: string;

  /** 사업자등록번호 · 통신판매업 신고번호 등 (선택) */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsString()
  POLICY_BUSINESS_INFO?: string;

  /** 처리방침·약관 시행일 (YYYY-MM-DD) */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  POLICY_EFFECTIVE_DATE?: string;

  /** 유니버설 링크(apple-app-site-association)용 "<TEAM ID>.<번들 ID>" */
  @IsOptional()
  @IsString()
  APPLE_APP_ID?: string;

  /** 앱 링크(assetlinks.json)용 안드로이드 패키지 이름 */
  @IsOptional()
  @IsString()
  ANDROID_PACKAGE_NAME?: string;

  /** 앱 링크용 서명 인증서 SHA-256 지문. 쉼표로 구분 */
  @IsOptional()
  @IsString()
  ANDROID_SHA256_FINGERPRINTS?: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  /**
   * 저장하는 외부 토큰(Apple refresh token) 암호화 키. 32바이트를 base64로 (`openssl rand -base64 32`).
   * 운영 필수. 개발은 아래 기본값을 쓴다 (운영에서는 기본값을 거절한다)
   */
  @Transform(({ value }: { value: unknown }) =>
    value === undefined || value === '' ? DEV_TOKEN_ENCRYPTION_KEY : value,
  )
  @IsString()
  @Validate(IsBase64Key32)
  TOKEN_ENCRYPTION_KEY: string = DEV_TOKEN_ENCRYPTION_KEY;

  /**
   * 탈퇴한 소셜 계정 (provider, sub)을 HMAC-SHA256으로 해시하는 키. 32바이트 base64.
   * 재가입 제한에만 쓴다. TOKEN_ENCRYPTION_KEY와 따로 둔다. 운영 필수
   */
  @Transform(({ value }: { value: unknown }) =>
    value === undefined || value === '' ? DEV_IDENTITY_HASH_KEY : value,
  )
  @IsString()
  @Validate(IsBase64Key32)
  IDENTITY_HASH_KEY: string = DEV_IDENTITY_HASH_KEY;

  /** 탈퇴 후 같은 소셜 계정으로 다시 가입할 수 없는 기간(일) */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(3650)
  REJOIN_COOLDOWN_DAYS: number = 30;

  /** access token 수명(초) */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL: number = 3600;

  /** refresh token 수명(초) */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(3600)
  JWT_REFRESH_TTL: number = 60 * 60 * 24 * 60;

  /** 카카오 앱 ID. 액세스 토큰이 우리 앱에서 발급됐는지 확인한다 */
  @IsOptional()
  @IsString()
  KAKAO_APP_ID?: string;

  /** Apple identity token의 aud로 허용할 값(번들 ID, Service ID). 쉼표로 구분 */
  @IsOptional()
  @IsString()
  APPLE_CLIENT_IDS?: string;

  /** Google ID 토큰의 aud로 허용할 값(OAuth 웹 클라이언트 ID). 쉼표로 구분. 없으면 Google 로그인은 503 */
  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_IDS?: string;

  /** 가입 선물 크레딧 */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  SIGNUP_GIFT_CREDITS: number = 10;

  @Matches(SEMVER)
  APP_MIN_VERSION_IOS: string = '1.0.0';

  @Matches(SEMVER)
  APP_LATEST_VERSION_IOS: string = '1.0.0';

  /** 링크 웹 페이지(/t/{token})의 스토어 배지에 APP_STORE_URL_*를 건다. 출시 전에는 false(링크 없음) */
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  STORE_LINKS_ENABLED: boolean = false;

  @IsUrl()
  APP_STORE_URL_IOS: string = 'https://apps.apple.com/app/id0000000000';

  @Matches(SEMVER)
  APP_MIN_VERSION_ANDROID: string = '1.0.0';

  @Matches(SEMVER)
  APP_LATEST_VERSION_ANDROID: string = '1.0.0';

  @IsUrl()
  APP_STORE_URL_ANDROID: string =
    'https://play.google.com/store/apps/details?id=com.kebi.tapeletter';
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const detail = errors
      .map(
        (e) =>
          `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`환경 변수가 올바르지 않습니다.\n${detail}`);
  }
  if (env.NODE_ENV === 'production') {
    const missing = (
      [
        'KAKAO_APP_ID',
        'APPLE_CLIENT_IDS',
        'S3_ACCESS_KEY',
        'S3_SECRET_KEY',
      ] as const
    ).filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(
        `운영 환경에 필요한 환경 변수가 없습니다: ${missing.join(', ')}`,
      );
    }
    if (env.TOKEN_ENCRYPTION_KEY === DEV_TOKEN_ENCRYPTION_KEY) {
      throw new Error(
        '운영 환경에는 TOKEN_ENCRYPTION_KEY가 필요합니다 (openssl rand -base64 32)',
      );
    }
    if (env.IDENTITY_HASH_KEY === DEV_IDENTITY_HASH_KEY) {
      throw new Error(
        '운영 환경에는 IDENTITY_HASH_KEY가 필요합니다 (openssl rand -base64 32)',
      );
    }
    if (env.IDENTITY_HASH_KEY === env.TOKEN_ENCRYPTION_KEY) {
      throw new Error(
        'IDENTITY_HASH_KEY는 TOKEN_ENCRYPTION_KEY와 달라야 합니다',
      );
    }
    if (env.STORAGE_DRIVER !== 's3') {
      throw new Error('운영 환경에서는 STORAGE_DRIVER=s3만 쓸 수 있습니다');
    }
    if (env.FFMPEG_MODE !== 'real') {
      throw new Error('운영 환경에서는 FFMPEG_MODE=real만 쓸 수 있습니다');
    }
    if (env.THROTTLE_DISABLED) {
      throw new Error('운영 환경에서는 THROTTLE_DISABLED를 쓸 수 없습니다');
    }
  }
  return env;
}
