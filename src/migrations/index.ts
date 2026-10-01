import { Init1790317777977 } from './1790317777977-Init.js';
import { Tapes1790318849480 } from './1790318849480-Tapes.js';
import { Billing1790320326476 } from './1790320326476-Billing.js';
import { WithdrawnIdentities1790324434860 } from './1790324434860-WithdrawnIdentities.js';
import { RecordingRawDeletedAt1790350165877 } from './1790350165877-RecordingRawDeletedAt.js';
import { Reports1790402274413 } from './1790402274413-Reports.js';
import { FriendNickname1790403770039 } from './1790403770039-FriendNickname.js';
import { TapeTypeSeconds1790438049000 } from './1790438049000-TapeTypeSeconds.js';
import { RequestLogs1790839694535 } from './1790839694535-RequestLogs.js';
import { DeliveryMemo1790734522471 } from './1790734522471-DeliveryMemo.js';

/**
 * 적용할 마이그레이션 목록 (순서대로).
 * `npm run migration:generate -- src/migrations/<이름>`으로 만든 뒤 여기에 추가한다.
 */
export const migrations = [
  Init1790317777977,
  Tapes1790318849480,
  Billing1790320326476,
  WithdrawnIdentities1790324434860,
  RecordingRawDeletedAt1790350165877,
  Reports1790402274413,
  FriendNickname1790403770039,
  TapeTypeSeconds1790438049000,
  DeliveryMemo1790734522471,
  RequestLogs1790839694535,
];
