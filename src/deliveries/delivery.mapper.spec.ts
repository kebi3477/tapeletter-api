import {
  sentStatus,
  shareUrl,
  toSentTape,
  toShelfItem,
} from './delivery.mapper.js';
import type { Delivery } from './entities/delivery.entity.js';

const base = (over: Partial<Delivery>): Delivery =>
  ({
    id: 'd1',
    recordingId: 'r1',
    senderId: 's1',
    senderName: '민경',
    recipientId: null,
    linkName: null,
    shareToken: null,
    shareExpiresAt: null,
    claimedAt: null,
    tag: null,
    memo: null,
    sentAt: new Date('2026-09-25T00:00:00Z'),
    openedAt: null,
    groupId: null,
    position: null,
    suppressed: false,
    deletedAt: null,
    recording: { tapeType: 60, durationMs: 34000 },
    ...over,
  }) as Delivery;

describe('보낸 테이프 상태', () => {
  const now = new Date('2026-09-26T00:00:00Z');

  it('링크 대기 / 링크 만료 / 안 뜯음 / 들음', () => {
    const link = { shareToken: 'tok', linkName: '유진' };
    expect(
      sentStatus(
        base({ ...link, shareExpiresAt: new Date('2026-10-02T00:00:00Z') }),
        now,
      ),
    ).toBe('link_pending');
    expect(
      sentStatus(
        base({ ...link, shareExpiresAt: new Date('2026-09-25T12:00:00Z') }),
        now,
      ),
    ).toBe('link_expired');
    expect(sentStatus(base({ recipientId: 'u2' }), now)).toBe('unopened');
    expect(sentStatus(base({ recipientId: 'u2', openedAt: now }), now)).toBe(
      'opened',
    );
  });

  it('보낸 테이프에는 재생 URL이 없고, 링크 대기면 공유 주소를 준다', () => {
    const t = toSentTape(
      base({
        shareToken: 'tok',
        linkName: '유진',
        shareExpiresAt: new Date('2026-10-02T00:00:00Z'),
      }),
      'https://tapeletter.app/',
      now,
    );
    expect(t.share).toEqual({
      url: 'https://tapeletter.app/t/tok',
      expiresAt: '2026-10-02T00:00:00.000Z',
    });
    expect(Object.keys(t)).not.toContain('url');
    expect(shareUrl('https://x.app', 'a')).toBe('https://x.app/t/a');
  });

  it('차단당해 숨겨진 테이프는 계속 안 뜯음', () => {
    const t = toSentTape(
      base({ recipientId: 'u2', suppressed: true, openedAt: now }),
      'https://x',
      now,
    );
    expect(t.openedAt).toBeNull();
  });

  it('받는 사람의 메모는 보낸 테이프 응답에 없다', () => {
    const d = base({ recipientId: 'u2', openedAt: now, memo: '생일 아침' });
    expect(toShelfItem(d).memo).toBe('생일 아침');
    expect(JSON.stringify(toSentTape(d, 'https://x', now))).not.toContain(
      '생일 아침',
    );
  });
});
