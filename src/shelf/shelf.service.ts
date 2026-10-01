import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { AppException } from '../common/errors/app.exception.js';
import { normalizeMemo } from '../common/utils/display-text.js';
import {
  RECEIVED_VIEWER_JOIN,
  type ShelfItem,
  toShelfItem,
} from '../deliveries/delivery.mapper.js';
import { Delivery } from '../deliveries/entities/delivery.entity.js';
import { Friendship } from '../friends/entities/friendship.entity.js';
import { Recording } from '../recordings/entities/recording.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { User } from '../users/entities/user.entity.js';
import { CreateGroupDto } from './dto/create-group.dto.js';
import { MoveItemDto } from './dto/move-item.dto.js';
import {
  FriendTapeItem,
  GroupResponse,
  ShelfResponse,
} from './dto/shelf.response.js';
import { UpdateGroupDto } from './dto/update-group.dto.js';
import {
  GROUP_NAME_MAX_LENGTH,
  ShelfGroup,
} from './entities/shelf-group.entity.js';
import { keyBetween, keysBetween } from './position.js';

export const DEFAULT_GROUP_NAME = '새 칸';

/** 한 칸에 넣을 수 있는 테이프 수. 분류 안 함은 칸이 아니라 제한이 없다 */
export const GROUP_CAPACITY = 10;

export function normalizeGroupName(raw: string | undefined): string {
  const name = (raw ?? '').normalize('NFC').trim();
  if (!name) return DEFAULT_GROUP_NAME;
  if ([...name].length > GROUP_NAME_MAX_LENGTH) {
    throw new AppException('INVALID_GROUP_NAME');
  }
  return name;
}

/** 받는 사람 서랍에 보이는 테이프 조건 */
const VISIBLE =
  'd.recipient_id = :userId AND d.deleted_at IS NULL AND d.suppressed = false';

@Injectable()
export class ShelfService {
  private readonly logger = new Logger(ShelfService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  /**
   * 서랍 수치. stored = 뜯은 테이프 수(서랍 보관량, cap과 비교), total = 안 뜯은 소포까지 받은 테이프 전체,
   * unopened = 안 뜯은 소포 수
   */
  async counts(
    userId: string,
  ): Promise<{ stored: number; total: number; unopened: number }> {
    const row = await this.dataSource.manager
      .createQueryBuilder(Delivery, 'd')
      .select('COUNT(*)::int', 'total')
      .addSelect('COUNT(*) FILTER (WHERE d.opened_at IS NULL)::int', 'unopened')
      .where(VISIBLE, { userId })
      .getRawOne<{ total: number; unopened: number }>();
    const total = row?.total ?? 0;
    const unopened = row?.unopened ?? 0;
    return { stored: total - unopened, total, unopened };
  }

  /** 서랍 보관량 = 뜯은 테이프 수. 뜯기(open) 판정에 쓴다 */
  async openedCount(m: EntityManager, userId: string): Promise<number> {
    return m
      .createQueryBuilder(Delivery, 'd')
      .where(VISIBLE, { userId })
      .andWhere('d.opened_at IS NOT NULL')
      .getCount();
  }

  async getShelf(userId: string): Promise<ShelfResponse> {
    const user = await this.dataSource.manager.findOneBy(User, { id: userId });
    if (!user) throw new AppException('USER_NOT_FOUND');
    const [groups, items] = await Promise.all([
      this.dataSource.manager.find(ShelfGroup, {
        where: { userId },
        order: { position: 'ASC', createdAt: 'ASC' },
      }),
      this.visibleItems(userId).getMany(),
    ]);
    const byGroup = new Map<string | null, Delivery[]>();
    for (const d of items) {
      const list = byGroup.get(d.groupId) ?? [];
      list.push(d);
      byGroup.set(d.groupId, list);
    }
    const unsorted = byGroup.get(null) ?? [];
    const stored = items.filter((d) => d.openedAt !== null).length;
    return {
      stored,
      cap: user.drawerCap,
      full: stored >= user.drawerCap,
      unopenedCount: unsorted.filter((d) => d.openedAt === null).length,
      unsorted: unsorted.map(toShelfItem),
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        cap: GROUP_CAPACITY,
        items: (byGroup.get(g.id) ?? []).map(toShelfItem),
      })),
    };
  }

  /**
   * 친구 화면: 그 친구가 나에게 보낸 테이프 중 뜯은 것.
   * 칸 순서대로, 칸 안에서는 서랍 순서대로, 분류 안 함은 마지막.
   */
  async tapesFrom(
    userId: string,
    friendId: string,
  ): Promise<{ items: FriendTapeItem[]; unopenedCount: number }> {
    const rows = await this.visibleItems(userId)
      .leftJoinAndSelect('d.group', 'g')
      .andWhere('d.sender_id = :friendId', { friendId })
      .getMany();
    const opened = rows.filter((d) => d.openedAt !== null);
    opened.sort((a, b) => {
      const ga = a.group?.position ?? null;
      const gb = b.group?.position ?? null;
      if (ga !== gb) {
        if (ga === null) return 1;
        if (gb === null) return -1;
        return ga < gb ? -1 : 1;
      }
      return 0; // 같은 칸 안에서는 visibleItems의 순서를 유지
    });
    return {
      items: opened.map((d) => ({
        ...toShelfItem(d),
        groupName: d.group?.name ?? null,
      })),
      unopenedCount: rows.length - opened.length,
    };
  }

  async createGroup(
    userId: string,
    dto: CreateGroupDto,
  ): Promise<GroupResponse> {
    const name = normalizeGroupName(dto.name);
    return this.dataSource.transaction(async (m) => {
      const last = await m.findOne(ShelfGroup, {
        where: { userId },
        order: { position: 'DESC' },
      });
      const group = await m.save(
        m.create(ShelfGroup, {
          userId,
          name,
          position: keyBetween(last?.position ?? null, null),
        }),
      );
      return { id: group.id, name: group.name, cap: GROUP_CAPACITY, items: [] };
    });
  }

  async updateGroup(
    userId: string,
    groupId: string,
    dto: UpdateGroupDto,
  ): Promise<GroupResponse> {
    await this.dataSource.transaction(async (m) => {
      const group = await this.findGroup(m, userId, groupId, true);
      if (dto.name !== undefined) group.name = normalizeGroupName(dto.name);
      if (dto.afterId !== undefined) {
        group.position = await this.groupKeyAfter(
          m,
          userId,
          group.id,
          dto.afterId,
        );
      }
      await m.save(group);
    });
    const shelf = await this.getShelf(userId);
    return shelf.groups.find((g) => g.id === groupId)!;
  }

  /** 칸 지우기. 안의 테이프는 분류 안 함의 끝으로 가고 열린 상태가 된다 */
  async deleteGroup(userId: string, groupId: string): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      await this.findGroup(m, userId, groupId, true);
      const items = await m.find(Delivery, {
        where: { recipientId: userId, groupId, deletedAt: IsNull() },
        order: { position: 'ASC', sentAt: 'DESC' },
      });
      if (items.length > 0) {
        const lastUnsorted = await this.edgeKey(m, userId, null, 'DESC');
        const keys = keysBetween(lastUnsorted, null, items.length);
        for (const [i, d] of items.entries()) {
          await m.update(Delivery, d.id, {
            groupId: null,
            position: keys[i],
            openedAt: d.openedAt ?? new Date(),
          });
        }
      }
      await m.delete(ShelfGroup, { id: groupId });
    });
  }

  /** 테이프 옮기기·정렬. 옮긴 테이프 한 줄만 바뀐다 */
  async moveItem(userId: string, itemId: string, dto: MoveItemDto) {
    await this.dataSource.transaction(async (m) => {
      const item = await m
        .createQueryBuilder(Delivery, 'd')
        .setLock('pessimistic_write')
        .where(VISIBLE, { userId })
        .andWhere('d.id = :itemId', { itemId })
        .getOne();
      if (!item) throw new AppException('TAPE_NOT_FOUND');
      if (dto.groupId) {
        // 칸 줄을 잠가 같은 칸으로 동시에 옮기는 요청을 한 줄로 세운다 (10번째 자리 경쟁)
        await this.findGroup(m, userId, dto.groupId, true);
        if (!item.openedAt) throw new AppException('TAPE_NOT_OPENED');
        if (item.groupId !== dto.groupId) {
          const inGroup = await m
            .createQueryBuilder(Delivery, 'd')
            .where(VISIBLE, { userId })
            .andWhere('d.group_id = :groupId', { groupId: dto.groupId })
            .getCount();
          // 이미 10개를 넘은 칸은 그대로 두고 더 넣는 것만 막는다
          if (inGroup >= GROUP_CAPACITY) throw new AppException('GROUP_FULL');
        }
      }

      let before: string | null = null;
      if (dto.afterId) {
        if (dto.afterId === item.id)
          throw new AppException('VALIDATION_FAILED', { fields: ['afterId'] });
        const after = await m
          .createQueryBuilder(Delivery, 'd')
          .where(VISIBLE, { userId })
          .andWhere('d.id = :afterId', { afterId: dto.afterId })
          .andWhere(
            dto.groupId ? 'd.group_id = :groupId' : 'd.group_id IS NULL',
            {
              groupId: dto.groupId,
            },
          )
          .getOne();
        if (!after) throw new AppException('TAPE_NOT_FOUND');
        before = after.position;
      }
      const nextQb = m
        .createQueryBuilder(Delivery, 'd')
        .select('d.position', 'position')
        .where(VISIBLE, { userId })
        .andWhere(
          dto.groupId ? 'd.group_id = :groupId' : 'd.group_id IS NULL',
          {
            groupId: dto.groupId,
          },
        )
        .andWhere('d.id <> :itemId', { itemId })
        .orderBy('d.position', 'ASC')
        .limit(1);
      if (before !== null) nextQb.andWhere('d.position > :before', { before });
      const next = await nextQb.getRawOne<{ position: string }>();

      await m.update(Delivery, item.id, {
        groupId: dto.groupId,
        position: keyBetween(before, next?.position ?? null),
      });
    });
    const moved = await this.visibleItems(userId)
      .andWhere('d.id = :itemId', { itemId })
      .getOneOrFail();
    return toShelfItem(moved);
  }

  /** 테이프 메모. 비우거나 null이면 지운다. 받는 사람만 바꿀 수 있고 보낸 사람에게는 보이지 않는다 */
  async setMemo(
    userId: string,
    itemId: string,
    raw: string | null,
  ): Promise<ShelfItem> {
    const memo = normalizeMemo(raw);
    const item = await this.visibleItems(userId)
      .andWhere('d.id = :itemId', { itemId })
      .getOne();
    if (!item) throw new AppException('TAPE_NOT_FOUND');
    await this.dataSource.manager.update(Delivery, item.id, { memo });
    item.memo = memo;
    return toShelfItem(item);
  }

  /**
   * 테이프 지우기. 받는 쪽에서만 사라지고(deleted_at) 파일도 지운다.
   * 보낸 사람의 보낸 테이프 목록에는 남는다(원래도 들을 수 없다).
   */
  async deleteItem(userId: string, itemId: string): Promise<void> {
    const recording = await this.dataSource.transaction(async (m) => {
      const item = await m
        .createQueryBuilder(Delivery, 'd')
        .innerJoinAndSelect('d.recording', 'r')
        .where('d.recipient_id = :userId AND d.deleted_at IS NULL', { userId })
        .andWhere('d.id = :itemId', { itemId })
        .getOne();
      if (!item) throw new AppException('TAPE_NOT_FOUND');
      await m.update(Delivery, item.id, {
        deletedAt: new Date(),
        groupId: null,
        memo: null,
      });
      await m.update(Recording, item.recordingId, { purgedAt: new Date() });
      return item.recording!;
    });
    await this.purgeFiles([recording]);
  }

  /** 받는 사람 서랍 맨 위(분류 안 함) 자리. 새로 도착한 테이프가 들어간다 */
  async topOfUnsortedKey(
    manager: EntityManager,
    userId: string,
  ): Promise<string> {
    return keyBetween(null, await this.edgeKey(manager, userId, null, 'ASC'));
  }

  /** 파일 지우기. 실패해도 요청은 실패시키지 않는다 (로그만) */
  async purgeFiles(recordings: Pick<Recording, 'rawKey' | 'processedKey'>[]) {
    const keys = recordings
      .flatMap((r) => [r.rawKey, r.processedKey])
      .filter((k): k is string => !!k);
    try {
      await this.storage.delete(keys);
    } catch (e) {
      this.logger.error(`파일 삭제 실패 (${keys.length}개): ${String(e)}`);
    }
  }

  private visibleItems(userId: string) {
    return this.dataSource.manager
      .createQueryBuilder(Delivery, 'd')
      .innerJoinAndSelect('d.recording', 'r')
      .leftJoinAndSelect('d.sender', 's')
      .leftJoinAndMapOne(
        'd.viewerFriendship',
        Friendship,
        'vf',
        RECEIVED_VIEWER_JOIN,
      )
      .where(VISIBLE, { userId })
      .orderBy('d.position', 'ASC')
      .addOrderBy('d.sent_at', 'DESC')
      .addOrderBy('d.id', 'ASC');
  }

  private async edgeKey(
    m: EntityManager,
    userId: string,
    groupId: string | null,
    dir: 'ASC' | 'DESC',
  ): Promise<string | null> {
    const row = await m
      .createQueryBuilder(Delivery, 'd')
      .select('d.position', 'position')
      .where(VISIBLE, { userId })
      .andWhere(groupId ? 'd.group_id = :groupId' : 'd.group_id IS NULL', {
        groupId,
      })
      .andWhere('d.position IS NOT NULL')
      .orderBy('d.position', dir)
      .limit(1)
      .getRawOne<{ position: string }>();
    return row?.position ?? null;
  }

  private async groupKeyAfter(
    m: EntityManager,
    userId: string,
    groupId: string,
    afterId: string | null,
  ): Promise<string> {
    let before: string | null = null;
    if (afterId) {
      if (afterId === groupId)
        throw new AppException('VALIDATION_FAILED', { fields: ['afterId'] });
      before = (await this.findGroup(m, userId, afterId, false)).position;
    }
    const qb = m
      .createQueryBuilder(ShelfGroup, 'g')
      .where('g.user_id = :userId AND g.id <> :groupId', { userId, groupId })
      .orderBy('g.position', 'ASC')
      .limit(1);
    if (before !== null) qb.andWhere('g.position > :before', { before });
    const next = await qb.getOne();
    return keyBetween(before, next?.position ?? null);
  }

  private async findGroup(
    m: EntityManager,
    userId: string,
    groupId: string,
    lock: boolean,
  ): Promise<ShelfGroup> {
    const qb = m
      .createQueryBuilder(ShelfGroup, 'g')
      .where('g.id = :groupId AND g.user_id = :userId', { groupId, userId });
    if (lock) qb.setLock('pessimistic_write');
    const group = await qb.getOne();
    if (!group) throw new AppException('GROUP_NOT_FOUND');
    return group;
  }
}
