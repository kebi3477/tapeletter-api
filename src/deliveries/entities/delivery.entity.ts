import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import type { Friendship } from '../../friends/entities/friendship.entity.js';
import { Recording } from '../../recordings/entities/recording.entity.js';
import { ShelfGroup } from '../../shelf/entities/shelf-group.entity.js';
import { User } from '../../users/entities/user.entity.js';

export const TAGS = ['birthday', 'congrats', 'thinking'] as const;
export type Tag = (typeof TAGS)[number];

/**
 * 보낸 테이프 한 개 = 받는 사람 서랍의 테이프 한 개.
 * - 친구에게: recipient_id가 처음부터 있다
 * - 링크로: recipient_id NULL + share_token. claim하면 recipient_id가 채워진다
 * - 서랍 위치: group_id(NULL = 분류 안 함) + position(fractional index)
 * - 받는 사람이 지우면 deleted_at (보낸 사람의 보낸 테이프 목록에는 남는다)
 */
@Entity('deliveries')
@Index('IDX_deliveries_recipient_shelf', ['recipientId', 'groupId', 'position'])
@Index('IDX_deliveries_sender_sent', ['senderId', 'sentAt'])
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 녹음 하나는 한 번만 보낼 수 있다 (OneToOne → UNIQUE) */
  @Column({ name: 'recording_id', type: 'uuid' })
  recordingId: string;

  @Column({ name: 'sender_id', type: 'uuid', nullable: true })
  senderId: string | null;

  /** 보낼 때의 보낸 사람 이름. 보낸 사람이 탈퇴해도 받은 테이프에 이름이 남는다 */
  @Column({ name: 'sender_name', type: 'varchar', length: 8 })
  senderName: string;

  @Column({ name: 'recipient_id', type: 'uuid', nullable: true })
  recipientId: string | null;

  /** 링크로 보낼 때 라벨에 적은 이름 */
  @Column({ name: 'link_name', type: 'varchar', length: 8, nullable: true })
  linkName: string | null;

  @Index('UQ_deliveries_share_token', { unique: true })
  @Column({ name: 'share_token', type: 'varchar', length: 64, nullable: true })
  shareToken: string | null;

  @Column({ name: 'share_expires_at', type: 'timestamptz', nullable: true })
  shareExpiresAt: Date | null;

  @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  tag: Tag | null;

  /** 받는 사람이 남긴 메모 (최대 40자). 받는 사람에게만 보이고 보낸 사람 응답에는 넣지 않는다 */
  @Column({ type: 'varchar', length: 40, nullable: true })
  memo: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', default: () => 'now()' })
  sentAt: Date;

  /** 소포를 뜯은 시각 = 보낸 사람에게 "들었어요" */
  @Column({ name: 'opened_at', type: 'timestamptz', nullable: true })
  openedAt: Date | null;

  @Column({ name: 'group_id', type: 'uuid', nullable: true })
  groupId: string | null;

  @Column({ type: 'varchar', length: 64, collation: 'C', nullable: true })
  position: string | null;

  /** 받는 사람이 보낸 사람을 차단해서 받는 쪽에 보이지 않는 테이프 */
  @Column({ type: 'boolean', default: false })
  suppressed: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  /**
   * 조회할 때만 채운다(컬럼 아님): 보는 사람의 친구 줄. 받은 테이프면 받는 사람→보낸 사람,
   * 보낸 테이프면 보낸 사람→받는 사람. 별명(nickname)을 응답에 넣으려고 쓴다
   */
  viewerFriendship?: Friendship | null;

  @OneToOne(() => Recording, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recording_id' })
  recording?: Relation<Recording>;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sender_id' })
  sender?: Relation<User>;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_id' })
  recipient?: Relation<User>;

  @ManyToOne(() => ShelfGroup, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'group_id' })
  group?: Relation<ShelfGroup>;
}
