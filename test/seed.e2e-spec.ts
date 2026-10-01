import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { bearer, createApp, devLogin } from './utils.js';

describe('개발 시드 POST /dev/seed (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(() => app.close());

  it('프로토타입 초기 데이터를 만든다 (두 번 해도 같은 상태)', async () => {
    const me = await devLogin(app, '민경');
    const auth = bearer(me.accessToken);
    const server = app.getHttpServer();

    for (let round = 0; round < 2; round++) {
      const seeded = await request(server)
        .post('/api/dev/seed')
        .set(auth)
        .expect(200);
      expect(seeded.body).toEqual({
        friends: 6,
        stored: 8,
        groups: 3,
        sent: 4,
        credits: 120,
      });

      const my = (
        await request(server).get('/api/users/me').set(auth).expect(200)
      ).body;
      expect(my).toMatchObject({
        name: '민경',
        credits: 120,
        drawer: { stored: 8, cap: 12, full: false, unopenedCount: 2 },
        tapes: [
          { tapeType: 15, qty: null },
          { tapeType: 60, qty: 2 },
          { tapeType: 180, qty: 0 },
        ],
        stats: { receivedCount: 10, sentCount: 4, friendCount: 6 },
      });

      const friends = (
        await request(server).get('/api/friends').set(auth).expect(200)
      ).body.items;
      expect(friends.map((f: { name: string }) => f.name)).toEqual([
        '지현',
        '엄마',
        '하늘',
        '민수',
        '은비',
        '박과장님',
      ]);
      expect(
        friends.slice(0, 2).every((f: { starred: boolean }) => f.starred),
      ).toBe(true);

      const shelf = (
        await request(server).get('/api/shelf').set(auth).expect(200)
      ).body;
      expect(
        shelf.unsorted.map(
          (x: {
            sender: { name: string };
            opened: boolean;
            viaLink: boolean;
            tapeType: number;
          }) => [x.sender.name, x.opened, x.viaLink, x.tapeType],
        ),
      ).toEqual([
        ['지현', false, false, 60],
        ['하늘', false, true, 15],
      ]);
      expect(
        shelf.groups.map((g: { name: string; items: unknown[] }) => [
          g.name,
          g.items.length,
        ]),
      ).toEqual([
        ['2026 생일', 4],
        ['승진 축하', 2],
        ['엄마 목소리', 2],
      ]);

      const sent = (
        await request(server).get('/api/deliveries/sent').set(auth).expect(200)
      ).body.items;
      expect(
        sent.map(
          (s: {
            linkName: string | null;
            recipient: { name: string } | null;
            status: string;
          }) => [s.recipient?.name ?? s.linkName, s.status],
        ),
      ).toEqual([
        ['유진', 'link_pending'],
        ['엄마', 'opened'],
        ['민수', 'unopened'],
        ['박과장님', 'opened'],
      ]);

      const ledger = (
        await request(server).get('/api/wallet/ledger').set(auth).expect(200)
      ).body.items;
      expect(
        ledger.map((l: { reason: string; delta: number }) => [
          l.reason,
          l.delta,
        ]),
      ).toEqual([
        ['광고 보상', 10],
        ['1분 테이프 구매', -30],
        ['크레딧 충전 · ₩1,100', 100],
        ['지현님이 선물', 30],
        ['가입 선물', 10],
      ]);
    }

    // 칸에 있는 테이프는 바로 재생된다 (생성한 톤 WAV)
    const shelf = (
      await request(server).get('/api/shelf').set(auth).expect(200)
    ).body;
    const item = shelf.groups[2].items[0];
    expect(item.sender.name).toBe('엄마');
    const audio = await request(server)
      .get(`/api/deliveries/${item.id}/audio`)
      .set(auth)
      .expect(200);
    expect(audio.body.durationMs).toBeGreaterThanOrEqual(3000);
  });
});
