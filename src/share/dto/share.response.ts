import type { PersonRef, ShelfItem } from '../../deliveries/delivery.mapper.js';
import type { Tag } from '../../deliveries/entities/delivery.entity.js';
import type { FriendResponse } from '../../friends/dto/friend.response.js';
import type { TapeType } from '../../recordings/entities/recording.entity.js';

export interface SharePreview {
  /** available: 받을 수 있음 · claimed: 내가 이미 받음(deliveryId로 열기) */
  state: 'available' | 'claimed';
  deliveryId: string | null;
  sender: PersonRef;
  tapeType: TapeType;
  durationMs: number;
  tag: Tag | null;
  sentAt: string;
  expiresAt: string;
}

export interface ClaimResponse {
  item: ShelfItem;
  /** 서로 친구가 된 보낸 사람. 차단 관계거나 보낸 사람이 탈퇴했으면 null */
  friend: FriendResponse | null;
}

export interface WebPreview {
  senderName: string;
  tapeType: TapeType;
  durationMs: number;
  tag: Tag | null;
  sentAt: string;
  expiresAt: string;
}

/** 공유 이미지·링크 미리보기(og)에 넣는 값 */
export interface ShareCard {
  /** 최대 8자 + "…". 이름이 없으면 null (대체 문구 "누군가") */
  name: string | null;
  tapeType: TapeType;
}
