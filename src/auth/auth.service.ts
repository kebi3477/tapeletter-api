import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, LessThan, QueryFailedError, Repository } from 'typeorm';
import { AppException } from '../common/errors/app.exception.js';
import { LedgerReasons } from '../shop/products.js';
import type { AccessTokenPayload } from '../common/guards/jwt-auth.guard.js';
import { User } from '../users/entities/user.entity.js';
import { normalizeName, UsersService } from '../users/users.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { AppleSignInService } from './apple-sign-in.service.js';
import { RejoinService } from './rejoin.service.js';
import { AppleService } from './apple.service.js';
import { AuthResponse, TokenPair } from './dto/auth.response.js';
import { AuthIdentity, AuthProvider } from './entities/auth-identity.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { GoogleService } from './google.service.js';
import { KakaoService } from './kakao.service.js';
import { SocialProfile } from './social-profile.js';

export const SIGNUP_GIFT_REASON = LedgerReasons.signupGift;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isUniqueViolation(e: unknown): boolean {
  return (
    e instanceof QueryFailedError &&
    (e.driverError as { code?: string } | undefined)?.code === '23505'
  );
}

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AuthIdentity)
    private readonly identities: Repository<AuthIdentity>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly kakao: KakaoService,
    private readonly apple: AppleService,
    private readonly google: GoogleService,
    private readonly appleSignIn: AppleSignInService,
    private readonly wallet: WalletService,
    private readonly users: UsersService,
    private readonly rejoin: RejoinService,
  ) {}

  async loginWithKakao(accessToken: string): Promise<AuthResponse> {
    const profile = await this.kakao.verify(accessToken);
    return this.login('kakao', profile);
  }

  async loginWithApple(
    identityToken: string,
    nonce?: string,
    authorizationCode?: string,
  ): Promise<AuthResponse> {
    const profile = await this.apple.verify(identityToken, nonce);
    const response = await this.login('apple', profile);
    if (authorizationCode) {
      // 탈퇴할 때 철회할 refresh token을 받아 둔다 (실패해도 로그인은 된다)
      const encrypted = await this.appleSignIn.exchangeCode(authorizationCode);
      if (encrypted) {
        await this.identities.update(
          { provider: 'apple', providerSub: profile.sub },
          { providerRefreshToken: encrypted },
        );
      }
    }
    return response;
  }

  /** Google 로그인 (Android). 탈퇴 때 철회할 Google 토큰은 받지 않는다 */
  async loginWithGoogle(idToken: string): Promise<AuthResponse> {
    const profile = await this.google.verify(idToken);
    return this.login('google', profile);
  }

  /** 개발 전용 로그인. 컨트롤러의 DevOnlyGuard가 운영에서 막는다 */
  async loginDev(key: string, name?: string): Promise<AuthResponse> {
    return this.login('dev', { sub: key, email: null, nickname: null }, name);
  }

  /** refresh token을 새 것으로 바꾼다. 쓴 토큰은 바로 지운다 (재사용 불가) */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const result = await this.refreshTokens
      .createQueryBuilder()
      .delete()
      .where('token_hash = :hash AND expires_at > now()', {
        hash: hashToken(refreshToken),
      })
      .returning('user_id')
      .execute();
    const row = (result.raw as { user_id: string }[])[0];
    if (!row) throw new AppException('INVALID_REFRESH_TOKEN');
    return this.issueTokens(row.user_id);
  }

  /** 로그아웃. 이 기기의 refresh token만 지운다 */
  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens.delete({ tokenHash: hashToken(refreshToken) });
  }

  async issueTokens(userId: string): Promise<TokenPair> {
    const now = Date.now();
    const accessTtl = this.config.getOrThrow<number>('JWT_ACCESS_TTL');
    const refreshTtl = this.config.getOrThrow<number>('JWT_REFRESH_TTL');

    const payload: AccessTokenPayload = { sub: userId, typ: 'access' };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: accessTtl,
    });
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(now + refreshTtl * 1000);

    await this.refreshTokens.insert({
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
    });
    // 만료된 토큰 정리 (가볍게, 로그인할 때마다 그 사용자 것만)
    await this.refreshTokens.delete({
      userId,
      expiresAt: LessThan(new Date(now)),
    });

    return {
      accessToken,
      accessTokenExpiresAt: new Date(now + accessTtl * 1000).toISOString(),
      refreshToken,
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  private async login(
    provider: AuthProvider,
    profile: SocialProfile,
    initialName?: string,
  ): Promise<AuthResponse> {
    let isNewUser = false;
    let identity = await this.identities.findOneBy({
      provider,
      providerSub: profile.sub,
    });
    if (!identity) {
      try {
        identity = await this.signUp(provider, profile, initialName);
        isNewUser = true;
      } catch (e) {
        // 같은 계정으로 동시에 가입하면 한쪽이 UNIQUE에 걸린다. 먼저 만든 쪽으로 로그인한다
        if (!isUniqueViolation(e)) throw e;
        identity = await this.identities.findOneByOrFail({
          provider,
          providerSub: profile.sub,
        });
      }
    }

    const tokens = await this.issueTokens(identity.userId);
    const user = await this.users.getMe(identity.userId);
    const suggestedName = profile.nickname
      ? [...profile.nickname.trim()].slice(0, 8).join('') || null
      : null;
    return { ...tokens, isNewUser, suggestedName, user };
  }

  /** 가입: 사용자 + 로그인 계정 + 가입 선물 크레딧을 한 트랜잭션에서 만든다 */
  private async signUp(
    provider: AuthProvider,
    profile: SocialProfile,
    initialName?: string,
  ): Promise<AuthIdentity> {
    const name = initialName ? normalizeName(initialName) : null;
    return this.dataSource.transaction(async (manager) => {
      // 탈퇴 후 재가입 제한 (카카오·Apple·Google, 새로 가입할 때만)
      await this.rejoin.assertCanSignUp(manager, provider, profile.sub);
      const user = await manager.save(manager.create(User, { name }));
      const identity = await manager.save(
        manager.create(AuthIdentity, {
          userId: user.id,
          provider,
          providerSub: profile.sub,
          email: profile.email,
        }),
      );
      const gift = this.config.getOrThrow<number>('SIGNUP_GIFT_CREDITS');
      if (gift > 0) {
        await this.wallet.apply(manager, {
          userId: user.id,
          delta: gift,
          kind: 'signup_gift',
          reason: SIGNUP_GIFT_REASON,
        });
      }
      return identity;
    });
  }
}
