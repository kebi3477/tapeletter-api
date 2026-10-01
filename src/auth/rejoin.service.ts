import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThan } from 'typeorm';
import { AppException } from '../common/errors/app.exception.js';
import { ClockService } from '../common/services/clock.service.js';
import { hashIdentity } from '../common/utils/identity-hash.js';
import type { AuthProvider } from './entities/auth-identity.entity.js';
import { WithdrawnIdentity } from './entities/withdrawn-identity.entity.js';

const DAY_MS = 86_400_000;

/** 재가입 제한을 거는 로그인 방식 (개발 로그인은 제외) */
const RESTRICTED: readonly AuthProvider[] = ['kakao', 'apple', 'google'];

/**
 * 탈퇴 후 재가입 제한. 탈퇴할 때 소셜 계정 해시와 탈퇴 시각만 남기고,
 * REJOIN_COOLDOWN_DAYS(기본 30일) 안에 같은 계정으로 새로 가입하려 하면 막는다.
 */
@Injectable()
export class RejoinService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly clock: ClockService,
  ) {}

  private get cooldownMs(): number {
    return this.config.getOrThrow<number>('REJOIN_COOLDOWN_DAYS') * DAY_MS;
  }

  private hash(provider: string, sub: string): string {
    return hashIdentity(
      this.config.getOrThrow<string>('IDENTITY_HASH_KEY'),
      provider,
      sub,
    );
  }

  /** 탈퇴 트랜잭션 안에서 부른다. 같은 계정이 다시 탈퇴하면 시각만 갱신한다 */
  async recordWithdrawal(
    m: EntityManager,
    identities: { provider: AuthProvider; providerSub: string }[],
  ): Promise<void> {
    const rows = identities
      .filter((i) => RESTRICTED.includes(i.provider))
      .map((i) => ({
        identityHash: this.hash(i.provider, i.providerSub),
        withdrawnAt: this.clock.now(),
      }));
    if (rows.length === 0) return;
    await m.upsert(WithdrawnIdentity, rows, ['identityHash']);
  }

  /**
   * 새로 가입할 때만 부른다 (기존 계정 로그인에는 쓰지 않는다).
   * 제한 기간 안이면 403 REJOIN_RESTRICTED(availableAt), 지났으면 기록을 지우고 통과한다.
   */
  async assertCanSignUp(
    m: EntityManager,
    provider: AuthProvider,
    sub: string,
  ): Promise<void> {
    if (!RESTRICTED.includes(provider)) return;
    const identityHash = this.hash(provider, sub);
    const row = await m.findOneBy(WithdrawnIdentity, { identityHash });
    if (!row) return;
    const availableAt = new Date(row.withdrawnAt.getTime() + this.cooldownMs);
    if (availableAt.getTime() > this.clock.now().getTime()) {
      throw new AppException('REJOIN_RESTRICTED', {
        availableAt: availableAt.toISOString(),
      });
    }
    await m.delete(WithdrawnIdentity, { identityHash });
  }

  /** 정리 작업: 제한 기간이 지난 기록을 지운다 */
  async cleanupExpired(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - this.cooldownMs);
    const result = await this.dataSource.manager.delete(WithdrawnIdentity, {
      withdrawnAt: LessThan(cutoff),
    });
    return result.affected ?? 0;
  }
}
