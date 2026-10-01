import { Delivery } from '../deliveries/entities/delivery.entity.js';
import { Recording } from '../recordings/entities/recording.entity.js';
import { ShelfGroup } from '../shelf/entities/shelf-group.entity.js';
import { BillingEvent } from '../billing/entities/billing-event.entity.js';
import { IapPurchase } from '../billing/entities/iap-purchase.entity.js';
import { DeviceToken } from '../notifications/entities/device-token.entity.js';
import { AdReward } from '../wallet/entities/ad-reward.entity.js';
import { WithdrawnIdentity } from '../auth/entities/withdrawn-identity.entity.js';
import { Report } from '../reports/entities/report.entity.js';
import { RequestLog } from '../request-logs/entities/request-log.entity.js';
import { AuthIdentity } from '../auth/entities/auth-identity.entity.js';
import { RefreshToken } from '../auth/entities/refresh-token.entity.js';
import { IdempotencyKey } from '../common/entities/idempotency-key.entity.js';
import { Block } from '../friends/entities/block.entity.js';
import { Friendship } from '../friends/entities/friendship.entity.js';
import { TapeInventory } from '../users/entities/tape-inventory.entity.js';
import { User } from '../users/entities/user.entity.js';
import { CreditLedger } from '../wallet/entities/credit-ledger.entity.js';

/**
 * 모든 엔티티. 앱(TypeOrmModule)과 마이그레이션 CLI(data-source.ts)가 함께 쓴다.
 * 엔티티를 추가하면 여기에도 넣는다.
 */
export const entities = [
  User,
  TapeInventory,
  AuthIdentity,
  RefreshToken,
  Friendship,
  Block,
  CreditLedger,
  IdempotencyKey,
  Recording,
  ShelfGroup,
  Delivery,
  IapPurchase,
  BillingEvent,
  AdReward,
  DeviceToken,
  WithdrawnIdentity,
  Report,
  RequestLog,
];
