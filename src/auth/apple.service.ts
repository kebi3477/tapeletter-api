import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  createRemoteJWKSet,
  errors as joseErrors,
  type JWTVerifyGetKey,
  jwtVerify,
} from 'jose';
import { socialFailure } from './auth-failure.js';
import { SocialProfile } from './social-profile.js';

export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

interface AppleClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | 'true' | 'false';
  nonce?: string;
}

/**
 * Apple identity token(JWT) 검증. Apple 공개 키(JWKS)로 서명을 확인하고
 * iss, aud(APPLE_CLIENT_IDS), exp, nonce를 검사한다.
 */
@Injectable()
export class AppleService {
  private readonly logger = new Logger(AppleService.name);
  /** 테스트에서 로컬 키로 바꿀 수 있게 열어 둔다 */
  jwks: JWTVerifyGetKey = createRemoteJWKSet(new URL(APPLE_JWKS_URL));

  constructor(private readonly config: ConfigService) {}

  /**
   * @param rawNonce 앱이 Apple에 sha256(rawNonce)를 nonce로 넘겼다면 원문을 같이 보낸다
   */
  async verify(
    identityToken: string,
    rawNonce?: string,
  ): Promise<SocialProfile> {
    const audience = (this.config.get<string>('APPLE_CLIENT_IDS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (audience.length === 0) {
      throw socialFailure(this.logger, 'apple', 'APPLE_CLIENT_IDS_MISSING');
    }

    let claims: AppleClaims;
    try {
      const { payload } = await jwtVerify<AppleClaims>(
        identityToken,
        this.jwks,
        {
          issuer: APPLE_ISSUER,
          audience,
          algorithms: ['RS256'],
        },
      );
      claims = payload;
    } catch (e) {
      if (
        e instanceof joseErrors.JOSEError &&
        !(e instanceof joseErrors.JWKSTimeout)
      ) {
        const claim =
          e instanceof joseErrors.JWTClaimValidationFailed
            ? ` claim=${e.claim}`
            : '';
        throw socialFailure(this.logger, 'apple', `${e.code}${claim}`);
      }
      throw socialFailure(
        this.logger,
        'apple',
        `JWKS ${e instanceof Error ? e.name : String(e)}`,
        'SOCIAL_PROVIDER_UNAVAILABLE',
      );
    }

    if (rawNonce !== undefined) {
      const hashed = createHash('sha256').update(rawNonce).digest('hex');
      if (claims.nonce !== hashed && claims.nonce !== rawNonce) {
        throw socialFailure(this.logger, 'apple', 'NONCE_MISMATCH');
      }
    }
    if (!claims.sub) throw socialFailure(this.logger, 'apple', 'NO_SUB');

    const verified =
      claims.email_verified === true || claims.email_verified === 'true';
    return {
      sub: claims.sub,
      email: verified ? (claims.email ?? null) : null,
      nickname: null,
    };
  }
}
