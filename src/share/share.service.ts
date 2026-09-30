import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AppException } from '../common/errors/app.exception.js';
import { touchFriendship } from '../deliveries/deliveries.service.js';
import {
  RECEIVED_VIEWER_JOIN,
  isLinkExpired,
  shareUrl,
  toShelfItem,
} from '../deliveries/delivery.mapper.js';
import { Delivery } from '../deliveries/entities/delivery.entity.js';
import { Block } from '../friends/entities/block.entity.js';
import { Friendship } from '../friends/entities/friendship.entity.js';
import { FriendsService, UNNAMED } from '../friends/friends.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AUDIO_URL_TTL_SEC } from '../recordings/recordings.constants.js';
import { ShelfService } from '../shelf/shelf.service.js';
import { StorageService } from '../storage/storage.service.js';
import { User } from '../users/entities/user.entity.js';
import { cardName } from './share-card.service.js';
import {
  ClaimResponse,
  ShareCard,
  SharePreview,
  WebPreview,
} from './dto/share.response.js';

/** 링크 토큰 모양 (base64url). 모양이 틀리면 DB를 보지 않고 LINK_NOT_FOUND */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly shelf: ShelfService,
    private readonly friends: FriendsService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  /** 앱에서 링크 열기 */
  async preview(userId: string, token: string): Promise<SharePreview> {
    const d = await this.find(this.dataSource.manager, token, false);
    const claimedByMe = this.check(d, userId);
    return {
      state: claimedByMe ? 'claimed' : 'available',
      deliveryId: claimedByMe ? d.id : null,
      sender: {
        userId: d.senderId,
        name: d.sender?.name ?? d.senderName,
        // 보낸 사람이 이미 내 친구면 내가 붙인 별명
        nickname: d.senderId
          ? await this.friends.nicknameOf(userId, d.senderId)
          : null,
      },
      tapeType: d.recording!.tapeType,
      durationMs: d.recording!.durationMs,
      tag: d.tag,
      sentAt: d.sentAt.toISOString(),
      expiresAt: d.shareExpiresAt!.toISOString(),
    };
  }

  /**
   * 링크 테이프 받기. 받는 사람의 "분류 안 함" 맨 위에 넣고 서로 친구가 된다.
   * 어느 쪽이든 차단 관계면 친구는 맺지 않는다. 내가 이미 받았으면 그대로 돌려준다.
   */
  async claim(userId: string, token: string): Promise<ClaimResponse> {
    const { delivery, claimedNow, befriended } =
      await this.dataSource.transaction(async (m) => {
        const d = await this.find(m, token, true);
        if (this.check(d, userId)) {
          return { delivery: d, claimedNow: false, befriended: false };
        }
        const now = new Date();
        d.recipientId = userId;
        d.claimedAt = now;
        d.groupId = null;
        d.position = await this.shelf.topOfUnsortedKey(m, userId);
        await m.save(d);

        let befriended = false;
        if (d.senderId) {
          const blocked = await m
            .createQueryBuilder(Block, 'b')
            .where(
              '(b.user_id = :a AND b.blocked_id = :b) OR (b.user_id = :b AND b.blocked_id = :a)',
              { a: userId, b: d.senderId },
            )
            .getExists();
          if (!blocked) {
            await touchFriendship(m, userId, d.senderId, now);
            await touchFriendship(m, d.senderId, userId, now);
            befriended = true;
          }
        }
        return { delivery: d, claimedNow: true, befriended };
      });

    if (claimedNow && delivery.senderId) {
      const me = await this.dataSource.manager.findOneBy(User, { id: userId });
      this.notifications
        .linkClaimed({
          deliveryId: delivery.id,
          senderId: delivery.senderId,
          recipientId: userId,
          recipientName: me?.name ?? UNNAMED,
        })
        .catch((e: unknown) => this.logger.error(`푸시 실패: ${String(e)}`));
    }

    const item = await this.dataSource.manager
      .createQueryBuilder(Delivery, 'd')
      .innerJoinAndSelect('d.recording', 'r')
      .leftJoinAndSelect('d.sender', 's')
      .leftJoinAndMapOne(
        'd.viewerFriendship',
        Friendship,
        'vf',
        RECEIVED_VIEWER_JOIN,
      )
      .where('d.id = :id', { id: delivery.id })
      .getOneOrFail();
    let friend: ClaimResponse['friend'] = null;
    if (delivery.senderId && (befriended || !claimedNow)) {
      friend = await this.friends
        .get(userId, delivery.senderId)
        .catch(() => null);
    }
    return { item: toShelfItem(item), friend };
  }

  /** 앱이 없는 사람의 웹 페이지용 미리보기 (로그인 없음) */
  async webPreview(token: string): Promise<WebPreview> {
    return (await this.webPage(token)).preview;
  }

  /** 링크 웹 페이지(`/t/{token}`): 미리보기 + 공유 이미지·og 문구에 쓰는 이름 */
  async webPage(
    token: string,
  ): Promise<{ preview: WebPreview; card: ShareCard }> {
    const d = await this.find(this.dataSource.manager, token, false);
    this.checkForWeb(d);
    return {
      preview: {
        senderName: d.sender?.name ?? d.senderName,
        tapeType: d.recording!.tapeType,
        durationMs: d.recording!.durationMs,
        tag: d.tag,
        sentAt: d.sentAt.toISOString(),
        expiresAt: d.shareExpiresAt!.toISOString(),
      },
      card: this.toCard(d),
    };
  }

  /**
   * 공유 이미지(`/t/{token}/kakao.png`·`og.png`)에 넣는 값. 받았거나 만료된 링크도 준다(이름·길이는 바뀌지 않는다).
   * 없는 토큰이면 LINK_NOT_FOUND
   */
  async card(token: string): Promise<ShareCard> {
    return this.toCard(await this.find(this.dataSource.manager, token, false));
  }

  /** 보낼 때 저장한 이름(sender_name)을 쓴다. 나중에 이름을 바꿔도 이미지 캐시가 어긋나지 않게 */
  private toCard(d: Delivery): ShareCard {
    return {
      name: d.senderName === UNNAMED ? null : cardName(d.senderName),
      tapeType: d.recording!.tapeType,
    };
  }

  /** 웹 재생 URL (로그인 없음). 들어도 받은 것으로 치지 않는다 */
  async webAudio(
    token: string,
  ): Promise<{ url: string; expiresAt: string; durationMs: number }> {
    const d = await this.find(this.dataSource.manager, token, false);
    this.checkForWeb(d);
    const key = d.recording!.processedKey;
    if (!key || d.recording!.purgedAt)
      throw new AppException('AUDIO_NOT_READY');
    const signed = await this.storage.presignGet(key, AUDIO_URL_TTL_SEC);
    return { ...signed, durationMs: d.recording!.durationMs };
  }

  /** @returns 내가 이미 받은 링크면 true */
  private check(d: Delivery, userId: string): boolean {
    if (d.senderId === userId) {
      throw new AppException('LINK_OWN', {
        deliveryId: d.id,
        url: shareUrl(
          this.config.getOrThrow<string>('PUBLIC_BASE_URL'),
          d.shareToken!,
        ),
      });
    }
    if (d.recipientId) {
      if (d.recipientId === userId && !d.deletedAt) return true;
      throw new AppException('LINK_TAKEN');
    }
    if (isLinkExpired(d)) throw new AppException('LINK_EXPIRED');
    return false;
  }

  private checkForWeb(d: Delivery): void {
    if (d.recipientId) throw new AppException('LINK_TAKEN');
    if (isLinkExpired(d)) throw new AppException('LINK_EXPIRED');
  }

  private async find(
    m: EntityManager,
    token: string,
    lock: boolean,
  ): Promise<Delivery> {
    if (!TOKEN_PATTERN.test(token)) throw new AppException('LINK_NOT_FOUND');
    const qb = m
      .createQueryBuilder(Delivery, 'd')
      .innerJoinAndSelect('d.recording', 'r')
      .leftJoinAndSelect('d.sender', 's')
      .where('d.share_token = :token', { token });
    if (lock) qb.setLock('pessimistic_write', undefined, ['d']);
    const d = await qb.getOne();
    if (!d) throw new AppException('LINK_NOT_FOUND');
    return d;
  }
}
