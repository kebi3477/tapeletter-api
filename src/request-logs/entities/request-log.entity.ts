import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * API 요청 기록(서비스 이용 기록). 요청 한 줄에 한 행이며 LOG_RETENTION_DAYS(기본 30일)가 지나면
 * 정리 작업이 지운다. 요청·응답 본문, 토큰, 이메일, 이름, 메모는 넣지 않는다.
 * DB 백업(pg_dump)에서는 이 표의 데이터를 뺀다(ops/backup/pg-backup.sh).
 * user_id는 FK가 아니다(탈퇴해도 보관 기간 동안 남아 추적할 수 있게).
 */
@Entity('request_logs')
export class RequestLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index('IDX_request_logs_created_at')
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Index('IDX_request_logs_request_id')
  @Column({ name: 'request_id', type: 'varchar', length: 64 })
  requestId: string;

  @Column({ type: 'varchar', length: 8 })
  method: string;

  /** 쿼리스트링을 뺀 경로. 토큰은 앞 4자, UUID는 앞 8자만 */
  @Column({ type: 'varchar', length: 300 })
  path: string;

  @Column({ type: 'smallint' })
  status: number;

  @Column({ name: 'duration_ms', type: 'integer' })
  durationMs: number;

  @Index('IDX_request_logs_user_id')
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ name: 'app_version', type: 'varchar', length: 32, nullable: true })
  appVersion: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  platform: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 200, nullable: true })
  userAgent: string | null;

  /** 오류 응답의 code (error-codes.ts) */
  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode: string | null;

  /** 내부 사유 (소셜 로그인 실패 사유, 외부 서비스 응답 코드, 5xx 스택). 본문·토큰은 넣지 않는다 */
  @Column({ type: 'text', nullable: true })
  detail: string | null;
}
