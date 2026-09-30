import type { TapeType } from '../recordings/entities/recording.entity.js';
import type { Delivery, Tag } from './entities/delivery.entity.js';

export const SHARE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PersonRef {
  /** 탈퇴한 사람이면 null */
  userId: string | null;
  /** 상대가 정한 이름 */
  name: string;
  /** 내가 붙인 별명 (없으면 null). 앱은 `nickname ?? name`으로 표시한다 */
  nickname: string | null;
}

/** 받은 테이프 조회에 붙이는 친구 줄 조인 (받는 사람 → 보낸 사람) */
export const RECEIVED_VIEWER_JOIN =
  'vf.user_id = d.recipient_id AND vf.friend_id = d.sender_id';
/** 보낸 테이프 조회에 붙이는 친구 줄 조인 (보낸 사람 → 받는 사람) */
export const SENT_VIEWER_JOIN =
  'vf.user_id = d.sender_id AND vf.friend_id = d.recipient_id';

export interface ShelfItem {
  id: string;
  sender: PersonRef;
  tapeType: TapeType;
  durationMs: number;
  tag: Tag | null;
  sentAt: string;
  opened: boolean;
  openedAt: string | null;
  viaLink: boolean;
  groupId: string | null;
  /** 받는 사람이 남긴 메모 (없으면 null). 나에게만 보인다 */
  memo: string | null;
}

export type SentStatus =
  'link_pending' | 'link_expired' | 'unopened' | 'opened';

export interface SentTape {
  id: string;
  recipient: PersonRef | null;
  linkName: string | null;
  tapeType: TapeType;
  durationMs: number;
  tag: Tag | null;
  sentAt: string;
  status: SentStatus;
  claimedAt: string | null;
  openedAt: string | null;
  share: { url: string; expiresAt: string } | null;
}

const iso = (d: Date | null | undefined): string | null =>
  d ? new Date(d).toISOString() : null;

export function shareUrl(publicBaseUrl: string, token: string): string {
  return `${publicBaseUrl.replace(/\/+$/, '')}/t/${token}`;
}

export function isLinkExpired(d: Delivery, now = new Date()): boolean {
  return !!d.shareExpiresAt && d.shareExpiresAt.getTime() <= now.getTime();
}

/** 받은 테이프. `recording`, `sender` 관계를 불러온 Delivery */
export function toShelfItem(d: Delivery): ShelfItem {
  return {
    id: d.id,
    sender: {
      userId: d.senderId,
      name: d.sender?.name ?? d.senderName,
      nickname: d.viewerFriendship?.nickname ?? null,
    },
    tapeType: d.recording!.tapeType,
    durationMs: d.recording!.durationMs,
    tag: d.tag,
    sentAt: iso(d.sentAt)!,
    opened: d.openedAt !== null,
    openedAt: iso(d.openedAt),
    viaLink: d.claimedAt !== null,
    groupId: d.groupId,
    memo: d.memo,
  };
}

export function sentStatus(d: Delivery, now = new Date()): SentStatus {
  if (!d.recipientId)
    return isLinkExpired(d, now) ? 'link_expired' : 'link_pending';
  return d.openedAt ? 'opened' : 'unopened';
}

/**
 * 보낸 테이프. `recording`, `recipient` 관계를 불러온 Delivery.
 * 받는 사람이 차단해서 숨겨진 테이프(suppressed)는 계속 "안 뜯음"으로 보인다.
 */
export function toSentTape(
  d: Delivery,
  publicBaseUrl: string,
  now = new Date(),
): SentTape {
  const pending = !d.recipientId && !!d.shareToken;
  return {
    id: d.id,
    recipient: d.recipientId
      ? {
          userId: d.recipientId,
          name: d.recipient?.name ?? d.linkName ?? '',
          nickname: d.viewerFriendship?.nickname ?? null,
        }
      : null,
    linkName: d.linkName,
    tapeType: d.recording!.tapeType,
    durationMs: d.recording!.durationMs,
    tag: d.tag,
    sentAt: iso(d.sentAt)!,
    status: sentStatus(d, now),
    claimedAt: iso(d.claimedAt),
    openedAt: d.suppressed ? null : iso(d.openedAt),
    share: pending
      ? {
          url: shareUrl(publicBaseUrl, d.shareToken!),
          expiresAt: iso(d.shareExpiresAt)!,
        }
      : null,
  };
}
