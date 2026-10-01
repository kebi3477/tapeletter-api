import type { ShelfItem } from '../../deliveries/delivery.mapper.js';

export interface GroupResponse {
  id: string;
  name: string;
  /** 한 칸에 넣을 수 있는 테이프 수 (GROUP_CAPACITY = 10). 앱은 "items.length/cap"을 그린다 */
  cap: number;
  items: ShelfItem[];
}

export interface ShelfResponse {
  /** 서랍 보관량 = 뜯은 테이프 수 (안 뜯은 소포는 세지 않는다) */
  stored: number;
  cap: number;
  full: boolean;
  /** 분류 안 함에 있는 안 뜯은 소포 수 (탭바 레드 점) */
  unopenedCount: number;
  unsorted: ShelfItem[];
  groups: GroupResponse[];
}

export interface FriendTapeItem extends ShelfItem {
  /** 칸 이름. "분류 안 함"에 있으면 null (앱이 "분류 안 함"으로 표시) */
  groupName: string | null;
}
