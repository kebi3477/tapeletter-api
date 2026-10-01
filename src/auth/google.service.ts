import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Certificates, OAuth2Client } from 'google-auth-library';
import { socialFailure } from './auth-failure.js';
import { SocialProfile } from './social-profile.js';

export const GOOGLE_ISSUERS = [
  'accounts.google.com',
  'https://accounts.google.com',
];

/**
 * google-auth-library 오류 메시지를 짧은 사유 코드로 바꾼다.
 * 메시지에 토큰 내용(JSON)이 붙을 수 있어 원문 대신 코드만 남긴다.
 */
export function googleReason(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/No pem found/i.test(m)) return 'UNKNOWN_KID';
  if (/audience|recipient/i.test(m)) return 'AUD_MISMATCH';
  if (/issuer/i.test(m)) return 'ISS_MISMATCH';
  if (/too late|expired/i.test(m)) return 'EXPIRED';
  if (/too early/i.test(m)) return 'NOT_YET_VALID';
  if (/signature/i.test(m)) return 'BAD_SIGNATURE';
  if (/envelope|segments|parse|token/i.test(m)) return 'MALFORMED';
  return 'INVALID';
}

/**
 * Google ID 토큰 검증 (Android의 Google 로그인. 서버는 플랫폼을 가리지 않는다).
 * OAuth2Client.verifyIdToken과 같은 검사(서명, aud = GOOGLE_CLIENT_IDS, iss, exp)를 한다.
 * 서버는 Google 액세스·리프레시 토큰을 받지 않으므로 탈퇴 때 철회할 것이 없다.
 * GOOGLE_CLIENT_IDS가 없으면 503 SOCIAL_PROVIDER_UNAVAILABLE.
 */
@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  private readonly client = new OAuth2Client();

  /** Google 공개 인증서. 테스트에서 로컬 키로 바꿀 수 있게 열어 둔다 */
  certs: () => Promise<Certificates> = async () =>
    (await this.client.getFederatedSignonCertsAsync()).certs;

  constructor(private readonly config: ConfigService) {}

  private audience(): string[] {
    return (this.config.get<string>('GOOGLE_CLIENT_IDS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async verify(idToken: string): Promise<SocialProfile> {
    const audience = this.audience();
    if (audience.length === 0) {
      throw socialFailure(
        this.logger,
        'google',
        'GOOGLE_CLIENT_IDS_MISSING',
        'SOCIAL_PROVIDER_UNAVAILABLE',
      );
    }

    let certs: Certificates;
    try {
      certs = await this.certs();
    } catch (e) {
      throw socialFailure(
        this.logger,
        'google',
        `CERTS_FETCH ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`,
        'SOCIAL_PROVIDER_UNAVAILABLE',
      );
    }

    let payload;
    try {
      const ticket = await this.client.verifySignedJwtWithCertsAsync(
        idToken,
        certs,
        audience,
        GOOGLE_ISSUERS,
      );
      payload = ticket.getPayload();
    } catch (e) {
      throw socialFailure(this.logger, 'google', googleReason(e));
    }
    if (!payload?.sub) throw socialFailure(this.logger, 'google', 'NO_SUB');

    return {
      sub: payload.sub,
      email: payload.email_verified === true ? (payload.email ?? null) : null,
      // 카카오 닉네임처럼 이름 정하기 화면에 미리 채우는 데만 쓴다 (저장하지 않음)
      nickname: payload.name?.trim() || null,
    };
  }
}
