import type { TapeType } from '../recordings/entities/recording.entity.js';
import { TAPE_NAMES } from '../recordings/recordings.constants.js';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { Friendship } from '../friends/entities/friendship.entity.js';
import { DeviceToken } from './entities/device-token.entity.js';
import { FcmService, PushMessage } from './fcm.service.js';

export interface TapeDeliveredEvent {
  deliveryId: string;
  recipientId: string;
  senderId: string;
  senderName: string;
  tapeType: TapeType;
  /** 받는 사람 서랍이 꽉 찼는지(뜯은 테이프 수 >= cap). 꽉 찼으면 뜯을 수 없다고 알린다 */
  drawerFull?: boolean;
}

export interface LinkClaimedEvent {
  deliveryId: string;
  senderId: string;
  recipientId: string;
  recipientName: string;
}

export interface GiftReceivedEvent {
  recipientId: string;
  senderId: string;
  senderName: string;
  amount: number;
}

/**
 * 푸시 알림. 문구는 docs/api.md "푸시 모양"과 같다.
 * 받는 사람의 notificationsEnabled가 false면 보내지 않는다. 무효 토큰은 지운다.
 * 호출하는 쪽은 트랜잭션이 끝난 뒤 부르고, 실패해도 요청을 실패시키지 않는다.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly fcm: FcmService,
  ) {}

  async registerDevice(
    userId: string,
    token: string,
    platform: 'ios' | 'android',
  ) {
    await this.dataSource.manager.upsert(
      DeviceToken,
      { token, userId, platform, updatedAt: new Date() },
      ['token'],
    );
  }

  async unregisterDevice(userId: string, token: string): Promise<void> {
    await this.dataSource.manager.delete(DeviceToken, { token, userId });
  }

  async tapeDelivered(e: TapeDeliveredEvent): Promise<void> {
    const name = await this.displayName(
      e.recipientId,
      e.senderId,
      e.senderName,
    );
    return this.push(e.recipientId, {
      title: `${name}님이 테이프를 보냈어요`,
      body: e.drawerFull
        ? `${TAPE_NAMES[e.tapeType]} 테이프가 도착했어요. 서랍이 꽉 차서 뜯으려면 자리가 필요해요`
        : `${TAPE_NAMES[e.tapeType]} 테이프가 도착했어요. 뜯어서 들어보세요`,
      data: { type: 'tape', deliveryId: e.deliveryId },
    });
  }

  async linkClaimed(e: LinkClaimedEvent): Promise<void> {
    const name = await this.displayName(
      e.senderId,
      e.recipientId,
      e.recipientName,
    );
    return this.push(e.senderId, {
      title: `${name}님이 테이프를 받았어요`,
      body: '이제 서로 친구예요',
      data: { type: 'claimed', deliveryId: e.deliveryId },
    });
  }

  async giftReceived(e: GiftReceivedEvent): Promise<void> {
    const name = await this.displayName(
      e.recipientId,
      e.senderId,
      e.senderName,
    );
    return this.push(e.recipientId, {
      title: `${name}님이 크레딧을 선물했어요`,
      body: `${e.amount} 크레딧을 받았어요`,
      data: { type: 'gift' },
    });
  }

  /** 알림을 받는 사람(viewer)이 상대(subject)에게 붙인 별명이 있으면 그 별명, 없으면 원래 이름 */
  private async displayName(
    viewerId: string,
    subjectId: string,
    fallback: string,
  ): Promise<string> {
    const row = await this.dataSource.manager.findOne(Friendship, {
      where: { userId: viewerId, friendId: subjectId },
      select: { nickname: true },
    });
    return row?.nickname ?? fallback;
  }

  private async push(userId: string, message: PushMessage): Promise<void> {
    const user = await this.dataSource.manager.findOne(User, {
      where: { id: userId },
      select: { id: true, notificationsEnabled: true },
    });
    if (!user?.notificationsEnabled) return;
    const devices = await this.dataSource.manager.findBy(DeviceToken, {
      userId,
    });
    for (const d of devices) {
      try {
        const result = await this.fcm.send(d.token, message);
        if (result === 'invalid') {
          await this.dataSource.manager.delete(DeviceToken, { token: d.token });
          this.logger.log(`무효 FCM 토큰 정리: ${d.token.slice(0, 12)}…`);
        }
      } catch (e) {
        this.logger.error(`푸시 실패: ${String(e)}`);
      }
    }
  }
}
