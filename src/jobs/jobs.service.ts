import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RejoinService } from '../auth/rejoin.service.js';
import { BillingService } from '../billing/billing.service.js';
import { Recording } from '../recordings/entities/recording.entity.js';
import { ReportsService } from '../reports/reports.service.js';
import { RequestLogsService } from '../request-logs/request-logs.service.js';
import { ShelfService } from '../shelf/shelf.service.js';
import { StorageService } from '../storage/storage.service.js';

export const IDEMPOTENCY_KEY_TTL_HOURS = 24;
export const STALE_UPLOAD_HOURS = 1;

/** 정리 작업 (매시간). JOBS_DISABLED=true면 cron으로는 돌지 않는다 (직접 부를 수는 있다) */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly shelf: ShelfService,
    private readonly billing: BillingService,
    private readonly rejoin: RejoinService,
    private readonly storage: StorageService,
    private readonly reports: ReportsService,
    private readonly requestLogs: RequestLogsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'hourly-cleanup' })
  async hourly(): Promise<void> {
    if (this.config.get<boolean>('JOBS_DISABLED')) return;
    for (const [name, job] of [
      ['멱등 키', () => this.cleanupIdempotencyKeys()],
      ['방치된 업로드', () => this.cleanupStaleUploads()],
      ['Play consume', () => this.billing.retryPlayConsumes()],
      ['재가입 제한 기록', () => this.rejoin.cleanupExpired()],
      ['변환 끝난 녹음 원본', () => this.cleanupReadyRaw()],
      ['5년 지난 결제 기록', () => this.billing.purgeExpiredPaymentRecords()],
      ['3년 지난 신고 기록', () => this.reports.purgeExpired()],
      ['보관 기간 지난 요청 기록', () => this.requestLogs.purgeExpired()],
    ] as const) {
      try {
        const n = await job();
        if (n > 0) this.logger.log(`${name} 정리: ${n}건`);
      } catch (e) {
        this.logger.error(`${name} 정리 실패: ${String(e)}`);
      }
    }
  }

  /** 24시간 지난 Idempotency-Key 기록을 지운다 */
  async cleanupIdempotencyKeys(): Promise<number> {
    const result = await this.dataSource.query(
      `DELETE FROM idempotency_keys WHERE created_at < now() - make_interval(hours => $1)`,
      [IDEMPOTENCY_KEY_TTL_HOURS],
    );
    return (result as [unknown, number])[1] ?? 0;
  }

  /**
   * 변환이 끝났는데(ready) 원본이 남아 있는 녹음의 원본 파일을 지운다.
   * 변환 직후 지우기에 실패한 것과, 원본을 지우기 전에 만든 기존 녹음을 한 번 정리하는 데 쓴다 (한 번에 200개씩)
   */
  async cleanupReadyRaw(limit = 200): Promise<number> {
    const rows: Pick<Recording, 'id' | 'rawKey'>[] =
      await this.dataSource.manager
        .createQueryBuilder(Recording, 'r')
        .select(['r.id', 'r.rawKey'])
        .where(`r.status = 'ready'`)
        .andWhere('r.raw_deleted_at IS NULL AND r.purged_at IS NULL')
        .andWhere('r.processed_key IS NOT NULL')
        .orderBy('r.created_at', 'ASC')
        .take(limit)
        .getMany();
    if (rows.length === 0) return 0;
    await this.storage.delete(rows.map((r) => r.rawKey));
    await this.dataSource.manager.update(
      Recording,
      rows.map((r) => r.id),
      { rawDeletedAt: new Date() },
    );
    return rows.length;
  }

  /** 1시간 넘게 uploading인 녹음(업로드하다 만 것)을 파일과 함께 지운다 */
  async cleanupStaleUploads(): Promise<number> {
    const stale: Pick<Recording, 'id' | 'rawKey' | 'processedKey'>[] =
      await this.dataSource.manager
        .createQueryBuilder(Recording, 'r')
        .select(['r.id', 'r.rawKey', 'r.processedKey'])
        .where(`r.status = 'uploading'`)
        .andWhere('r.created_at < now() - make_interval(hours => :h)', {
          h: STALE_UPLOAD_HOURS,
        })
        .take(500)
        .getMany();
    if (stale.length === 0) return 0;
    await this.dataSource.manager.delete(
      Recording,
      stale.map((r) => r.id),
    );
    await this.shelf.purgeFiles(stale);
    return stale.length;
  }
}
