import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThan } from 'typeorm';
import { ClockService } from '../common/services/clock.service.js';
import { RequestLog } from './entities/request-log.entity.js';

export type RequestLogEntry = Omit<RequestLog, 'id' | 'createdAt'> & {
  createdAt: Date;
};

const FLUSH_MS = 1000;
const FLUSH_SIZE = 100;
/** DB가 멈춰도 메모리가 넘치지 않게 */
const BUFFER_MAX = 5000;

/**
 * 요청 기록(서비스 이용 기록). 한 요청에 한 줄을
 * 1) 표준 출력(JSON 한 줄, docker logs)과 2) request_logs 표에 남긴다(1초마다 모아서 INSERT).
 * LOG_RETENTION_DAYS가 지난 줄은 매시간 정리 작업(purgeExpired)이 지운다.
 */
@Injectable()
export class RequestLogsService implements OnModuleDestroy {
  private readonly logger = new Logger(RequestLogsService.name);
  private buffer: RequestLogEntry[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly stdout: boolean;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly clock: ClockService,
  ) {
    this.stdout = config.get<boolean>('REQUEST_LOG_STDOUT') ?? true;
  }

  record(entry: RequestLogEntry): void {
    if (this.stdout) {
      process.stdout.write(
        JSON.stringify({
          type: 'request',
          ts: entry.createdAt.toISOString(),
          ...entry,
          createdAt: undefined,
        }) + '\n',
      );
    }
    if (this.buffer.length >= BUFFER_MAX) return;
    this.buffer.push(entry);
    if (this.buffer.length >= FLUSH_SIZE) void this.flush();
    else
      this.timer ??= setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, FLUSH_MS);
  }

  /** 모아 둔 기록을 DB에 쓴다. 실패하면 그 묶음은 버린다(표준 출력에는 이미 남았다) */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const batch = this.buffer;
    this.buffer = [];
    if (batch.length === 0 || !this.dataSource.isInitialized) return;
    try {
      await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(RequestLog)
        .values(batch)
        .execute();
    } catch (e) {
      this.logger.error(`요청 기록 ${batch.length}줄 저장 실패: ${String(e)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.flush();
  }

  /** 보관 기간(LOG_RETENTION_DAYS)이 지난 요청 기록을 지운다 */
  async purgeExpired(): Promise<number> {
    const days = this.config.getOrThrow<number>('LOG_RETENTION_DAYS');
    const cutoff = new Date(this.clock.now().getTime() - days * 86_400_000);
    const result = await this.dataSource.manager.delete(RequestLog, {
      createdAt: LessThan(cutoff),
    });
    return result.affected ?? 0;
  }
}
