import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AppException } from '../common/errors/app.exception.js';
import { decodeCursor, encodeCursor } from '../common/utils/cursor.js';
import { Block } from '../friends/entities/block.entity.js';
import { Friendship } from '../friends/entities/friendship.entity.js';
import { UNNAMED } from '../friends/friends.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  FREE_TAPE_TYPE,
  Recording,
} from '../recordings/entities/recording.entity.js';
import { AUDIO_URL_TTL_SEC } from '../recordings/recordings.constants.js';
import { ShelfService } from '../shelf/shelf.service.js';
import { StorageService } from '../storage/storage.service.js';
import { TapeInventory } from '../users/entities/tape-inventory.entity.js';
import { User } from '../users/entities/user.entity.js';
import { normalizeName } from '../users/users.service.js';
import {
  RECEIVED_VIEWER_JOIN,
  SENT_VIEWER_JOIN,
  SHARE_LINK_TTL_MS,
  SentTape,
  ShelfItem,
  isLinkExpired,
  shareUrl,
  toSentTape,
  toShelfItem,
} from './delivery.mapper.js';
import { CreateDeliveryDto } from './dto/create-delivery.dto.js';
import { Delivery } from './entities/delivery.entity.js';

export function newShareToken(): string {
  return randomBytes(24).toString('base64url');
}

/** 친구 관계를 만들거나 lastAt을 갱신한다 (즐겨찾기는 그대로) */
export async function touchFriendship(
  m: EntityManager,
  userId: string,
  friendId: string,
  at: Date,
): Promise<void> {
  await m.query(
    `INSERT INTO friendships (user_id, friend_id, last_at) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, friend_id) DO UPDATE SET last_at = EXCLUDED.last_at`,
    [userId, friendId, at],
  );
}

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly shelf: ShelfService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  private get baseUrl(): string {
    return this.config.getOrThrow<string>('PUBLIC_BASE_URL');
  }

  /**
   * 테이프 보내기. 한 트랜잭션에서
   * 녹음 확인 → (친구면) 친구·차단 확인 → 1분·3분 테이프 1개 차감(15초는 무료) → 테이프 생성 → 친구 lastAt 갱신.
   */
  async send(senderId: string, dto: CreateDeliveryDto): Promise<SentTape> {
    // 새 친구 링크의 이름은 선택 입력이다. 생략·null·빈 문자열(공백만)은 null로 저장하고,
    // 값이 있을 때만 이름 규칙(1~8자)을 적용한다. 친구에게 보낼 때는 이름을 받지 않는다.
    const rawLinkName = dto.linkName?.trim() ? dto.linkName : null;
    if (dto.recipientId && rawLinkName !== null) {
      throw new AppException('VALIDATION_FAILED', {
        fields: ['recipientId', 'linkName'],
      });
    }
    const isLink = !dto.recipientId;
    const linkName = rawLinkName !== null ? normalizeName(rawLinkName) : null;

    const result = await this.dataSource.transaction(async (m) => {
      const recording = await m
        .createQueryBuilder(Recording, 'r')
        .setLock('pessimistic_write')
        .where('r.id = :id AND r.owner_id = :senderId', {
          id: dto.recordingId,
          senderId,
        })
        .getOne();
      if (!recording || recording.purgedAt)
        throw new AppException('RECORDING_NOT_FOUND');
      if (recording.status !== 'ready') {
        throw new AppException('RECORDING_NOT_READY', {
          status: recording.status,
        });
      }
      if (await m.existsBy(Delivery, { recordingId: recording.id })) {
        throw new AppException('RECORDING_ALREADY_SENT');
      }
      const sender = await m.findOneByOrFail(User, { id: senderId });
      const now = new Date();

      let suppressed = false;
      let position: string | null = null;
      if (dto.recipientId) {
        const friendship = await m.findOneBy(Friendship, {
          userId: senderId,
          friendId: dto.recipientId,
        });
        if (!friendship) throw new AppException('NOT_FRIEND');
        // 받는 사람이 나를 차단했으면 보낸 것처럼 보이되 받는 쪽에는 넣지 않는다
        suppressed = await m.existsBy(Block, {
          userId: dto.recipientId,
          blockedId: senderId,
        });
        if (!suppressed) {
          position = await this.shelf.topOfUnsortedKey(m, dto.recipientId);
        }
      }

      if (recording.tapeType !== FREE_TAPE_TYPE) {
        const taken = await m
          .createQueryBuilder()
          .update(TapeInventory)
          .set({ qty: () => 'qty - 1' })
          .where('user_id = :senderId AND tape_type = :tapeType AND qty >= 1', {
            senderId,
            tapeType: recording.tapeType,
          })
          .execute();
        if (!taken.affected) {
          throw new AppException('NO_TAPE_LEFT', {
            tapeType: recording.tapeType,
          });
        }
      }

      const delivery = await m.save(
        m.create(Delivery, {
          recordingId: recording.id,
          senderId,
          senderName: sender.name ?? UNNAMED,
          recipientId: dto.recipientId ?? null,
          linkName,
          shareToken: isLink ? newShareToken() : null,
          shareExpiresAt: isLink
            ? new Date(now.getTime() + SHARE_LINK_TTL_MS)
            : null,
          tag: dto.tag ?? null,
          sentAt: now,
          groupId: null,
          position,
          suppressed,
        }),
      );

      if (dto.recipientId) {
        await touchFriendship(m, senderId, dto.recipientId, now);
        // 받는 사람이 나를 목록에서 뺐더라도 테이프가 오면 다시 나타난다 (차단은 제외)
        if (!suppressed)
          await touchFriendship(m, dto.recipientId, senderId, now);
      }
      return { delivery, sender, recording, suppressed };
    });

    const { delivery, sender, recording, suppressed } = result;
    if (delivery.recipientId && !suppressed) {
      const recipientId = delivery.recipientId;
      this.notify(async () => {
        // 받는 사람 서랍이 꽉 찼으면(뜯은 수 >= cap) 알림 본문으로 알려 준다
        const [counts, recipient] = await Promise.all([
          this.shelf.counts(recipientId),
          this.dataSource.manager.findOne(User, {
            where: { id: recipientId },
            select: { id: true, drawerCap: true },
          }),
        ]);
        await this.notifications.tapeDelivered({
          deliveryId: delivery.id,
          recipientId,
          senderId,
          senderName: sender.name ?? UNNAMED,
          tapeType: recording.tapeType,
          drawerFull: !!recipient && counts.stored >= recipient.drawerCap,
        });
      });
    }
    return this.getSent(senderId, delivery.id);
  }

  async listSent(
    senderId: string,
    cursor: string | undefined,
    limit = 30,
  ): Promise<{ items: SentTape[]; nextCursor: string | null }> {
    const qb = this.sentQuery(senderId).take(limit + 1);
    if (cursor) {
      const c = decodeCursor(cursor);
      qb.andWhere('(d.sent_at, d.id) < (:sentAt, :id)', {
        sentAt: new Date(c.at),
        id: c.id,
      });
    }
    const rows = await qb.getMany();
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((d) => toSentTape(d, this.baseUrl)),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ at: last.sentAt.toISOString(), id: last.id })
          : null,
    };
  }

  async getSent(senderId: string, id: string): Promise<SentTape> {
    const d = await this.sentQuery(senderId)
      .andWhere('d.id = :id', { id })
      .getOne();
    if (!d) throw new AppException('TAPE_NOT_FOUND');
    return toSentTape(d, this.baseUrl);
  }

  /** 링크 다시 공유하기. 만료됐으면 새 링크(7일)를 만든다 */
  async reshare(
    senderId: string,
    id: string,
  ): Promise<{ url: string; expiresAt: string }> {
    return this.dataSource.transaction(async (m) => {
      const d = await m
        .createQueryBuilder(Delivery, 'd')
        .setLock('pessimistic_write')
        .where('d.id = :id AND d.sender_id = :senderId', { id, senderId })
        .getOne();
      if (!d) throw new AppException('TAPE_NOT_FOUND');
      if (d.recipientId || !d.shareToken) throw new AppException('LINK_TAKEN');
      if (isLinkExpired(d)) {
        d.shareToken = newShareToken();
        d.shareExpiresAt = new Date(Date.now() + SHARE_LINK_TTL_MS);
        await m.save(d);
      }
      return {
        url: shareUrl(this.baseUrl, d.shareToken),
        expiresAt: d.shareExpiresAt!.toISOString(),
      };
    });
  }

  async getReceived(userId: string, id: string): Promise<ShelfItem> {
    return toShelfItem(await this.findReceived(userId, id));
  }

  /**
   * 소포 뜯기. 처음 한 번만 openedAt을 채운다. 이미 뜯은 테이프는 그대로 돌려준다.
   * 서랍 보관량(뜯은 테이프 수)이 cap 이상이면 409 DRAWER_FULL (받기는 늘 되고, 뜯기만 막는다).
   * 사용자 줄을 잠가 같은 사람의 동시 뜯기가 cap을 넘지 않게 한다.
   */
  async open(userId: string, id: string): Promise<ShelfItem> {
    const d = await this.findReceived(userId, id);
    if (!d.openedAt) {
      await this.dataSource.transaction(async (m) => {
        const user = await m
          .createQueryBuilder(User, 'u')
          .setLock('pessimistic_write')
          .where('u.id = :userId', { userId })
          .getOne();
        if (!user) throw new AppException('USER_NOT_FOUND');
        const row = await m.findOne(Delivery, {
          where: { id },
          select: { id: true, openedAt: true },
        });
        if (row?.openedAt) return; // 다른 요청이 먼저 뜯었다
        const opened = await this.shelf.openedCount(m, userId);
        if (opened >= user.drawerCap) throw new AppException('DRAWER_FULL');
        await m
          .createQueryBuilder()
          .update(Delivery)
          .set({ openedAt: () => 'COALESCE(opened_at, now())' })
          .where('id = :id', { id })
          .execute();
      });
    }
    return this.getReceived(userId, id);
  }

  /** 재생 URL. 받는 사람만, 뜯은 테이프만 */
  async audio(
    userId: string,
    id: string,
  ): Promise<{ url: string; expiresAt: string; durationMs: number }> {
    const d = await this.findReceived(userId, id);
    if (!d.openedAt) throw new AppException('TAPE_NOT_OPENED');
    const key = d.recording!.processedKey;
    if (!key || d.recording!.purgedAt)
      throw new AppException('AUDIO_NOT_READY');
    const signed = await this.storage.presignGet(key, AUDIO_URL_TTL_SEC);
    return { ...signed, durationMs: d.recording!.durationMs };
  }

  private async findReceived(userId: string, id: string): Promise<Delivery> {
    const d = await this.dataSource.manager
      .createQueryBuilder(Delivery, 'd')
      .innerJoinAndSelect('d.recording', 'r')
      .leftJoinAndSelect('d.sender', 's')
      .leftJoinAndMapOne(
        'd.viewerFriendship',
        Friendship,
        'vf',
        RECEIVED_VIEWER_JOIN,
      )
      .where('d.id = :id AND d.recipient_id = :userId', { id, userId })
      .andWhere('d.deleted_at IS NULL AND d.suppressed = false')
      .getOne();
    if (!d) throw new AppException('TAPE_NOT_FOUND');
    return d;
  }

  private sentQuery(senderId: string) {
    return this.dataSource.manager
      .createQueryBuilder(Delivery, 'd')
      .innerJoinAndSelect('d.recording', 'r')
      .leftJoinAndSelect('d.recipient', 'u')
      .leftJoinAndMapOne(
        'd.viewerFriendship',
        Friendship,
        'vf',
        SENT_VIEWER_JOIN,
      )
      .where('d.sender_id = :senderId', { senderId })
      .orderBy('d.sent_at', 'DESC')
      .addOrderBy('d.id', 'DESC');
  }

  /** 푸시는 응답을 늦추거나 실패시키지 않는다 */
  private notify(fn: () => Promise<void>): void {
    fn().catch((e: unknown) => this.logger.error(`푸시 실패: ${String(e)}`));
  }
}
