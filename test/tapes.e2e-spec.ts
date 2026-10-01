import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import type { AuthResponse } from '../src/auth/dto/auth.response.js';
import {
  bearer,
  befriend,
  createApp,
  devLogin,
  idem,
  readyRecording,
  storage,
} from './utils.js';

describe('보내기 · 서랍 · 링크 · 친구 테이프 · 탈퇴 (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const server = () => app.getHttpServer();
  const as = (u: AuthResponse) => bearer(u.accessToken);

  beforeAll(async () => {
    app = await createApp();
    ds = app.get<DataSource>(getDataSourceToken());
  });
  afterAll(() => app.close());

  const giveTapes = (userId: string, tapeType: 60 | 180, qty: number) =>
    ds.query(
      `INSERT INTO tape_inventory (user_id, tape_type, qty) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, tape_type) DO UPDATE SET qty = EXCLUDED.qty`,
      [userId, tapeType, qty],
    );
  const qtyOf = async (userId: string, tapeType: 60 | 180) =>
    (
      (await ds.query(
        'SELECT qty FROM tape_inventory WHERE user_id = $1 AND tape_type = $2',
        [userId, tapeType],
      )) as { qty: number }[]
    )[0]?.qty ?? 0;
  const send = (
    from: AuthResponse,
    body: Record<string, unknown>,
    headers = idem(),
  ) =>
    request(server())
      .post('/api/deliveries')
      .set(as(from))
      .set(headers)
      .send(body);
  const me = (u: AuthResponse) =>
    request(server())
      .get('/api/users/me')
      .set(as(u))
      .expect(200)
      .then((r) => r.body);
  const shelf = (u: AuthResponse) =>
    request(server())
      .get('/api/shelf')
      .set(as(u))
      .expect(200)
      .then((r) => r.body);

  describe('친구에게 보내기', () => {
    let a: AuthResponse;
    let b: AuthResponse;

    beforeAll(async () => {
      a = await devLogin(app, '보냄');
      b = await devLogin(app, '받음');
      await befriend(app, a, b);
    });

    it('Idempotency-Key가 없으면 400', async () => {
      const rec = await readyRecording(app, a.accessToken);
      const res = await request(server())
        .post('/api/deliveries')
        .set(as(a))
        .send({ recordingId: rec, recipientId: b.user.id })
        .expect(400);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('친구가 아니면 NOT_FRIEND', async () => {
      const stranger = await devLogin(app, '모름');
      const rec = await readyRecording(app, a.accessToken);
      const res = await send(a, {
        recordingId: rec,
        recipientId: stranger.user.id,
      }).expect(403);
      expect(res.body.code).toBe('NOT_FRIEND');
    });

    it('3분 테이프는 1개 차감, 15초 테이프는 재고 없이 무료로 보낸다', async () => {
      const three = await readyRecording(app, a.accessToken, 180, 170_000);
      const none = await send(a, {
        recordingId: three,
        recipientId: b.user.id,
      }).expect(409);
      expect(none.body).toMatchObject({ code: 'NO_TAPE_LEFT', tapeType: 180 });
      await giveTapes(a.user.id, 180, 1);
      const sent = await send(a, {
        recordingId: three,
        recipientId: b.user.id,
      }).expect(201);
      expect(sent.body.tapeType).toBe(180);
      expect(await qtyOf(a.user.id, 180)).toBe(0);

      const before = await request(server()).get('/api/users/me').set(as(a));
      const free = await readyRecording(app, a.accessToken, 15, 15_000);
      const freeSent = await send(a, {
        recordingId: free,
        recipientId: b.user.id,
      }).expect(201);
      expect(freeSent.body.tapeType).toBe(15);
      const after = await request(server()).get('/api/users/me').set(as(a));
      expect(after.body.tapes).toEqual(before.body.tapes);
      expect(after.body.tapes[0]).toEqual({ tapeType: 15, qty: null });
      expect(after.body.credits).toBe(before.body.credits);
    });

    it('1분 테이프가 없으면 NO_TAPE_LEFT, 있으면 1개 차감 (같은 키로 재시도해도 한 번만)', async () => {
      const rec = await readyRecording(app, a.accessToken, 60, 50_000);
      const none = await send(a, {
        recordingId: rec,
        recipientId: b.user.id,
      }).expect(409);
      expect(none.body).toMatchObject({ code: 'NO_TAPE_LEFT', tapeType: 60 });

      await giveTapes(a.user.id, 60, 2);
      const headers = idem();
      const sent = await send(
        a,
        { recordingId: rec, recipientId: b.user.id, tag: 'birthday' },
        headers,
      ).expect(201);
      expect(sent.body).toMatchObject({
        recipient: { userId: b.user.id, name: '받음' },
        tapeType: 60,
        tag: 'birthday',
        status: 'unopened',
        share: null,
      });
      expect(await qtyOf(a.user.id, 60)).toBe(1);

      const replay = await send(
        a,
        { recordingId: rec, recipientId: b.user.id, tag: 'birthday' },
        headers,
      ).expect(201);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(replay.body.id).toBe(sent.body.id);
      expect(await qtyOf(a.user.id, 60)).toBe(1);

      const again = await send(a, {
        recordingId: rec,
        recipientId: b.user.id,
      }).expect(409);
      expect(again.body.code).toBe('RECORDING_ALREADY_SENT');

      // 보낸 뒤에는 미리 듣기도 없다
      const recording = await request(server())
        .get(`/api/recordings/${rec}`)
        .set(as(a))
        .expect(200);
      expect(recording.body.preview).toBeNull();
    });

    it('받는 사람: 서랍 맨 위에 소포로 들어오고, 뜯어야 재생 URL을 받는다. 보낸 사람은 못 듣는다', async () => {
      const rec = await readyRecording(app, a.accessToken);
      const sent = await send(a, {
        recordingId: rec,
        recipientId: b.user.id,
        tag: null,
      }).expect(201);
      expect(sent.body.tag).toBeNull();
      const id = sent.body.id as string;

      const s = await shelf(b);
      expect(s.unsorted[0]).toMatchObject({
        id,
        sender: { userId: a.user.id, name: '보냄' },
        opened: false,
        viaLink: false,
        groupId: null,
        durationMs: 4200,
      });
      expect(s.unopenedCount).toBeGreaterThanOrEqual(1);
      const bMe = await me(b);
      expect(bMe.drawer).toMatchObject({
        stored: s.stored,
        unopenedCount: s.unopenedCount,
      });
      // 받은 테이프 수는 안 뜯은 소포까지, drawer.stored는 뜯은 테이프만
      expect(bMe.stats.receivedCount).toBe(s.stored + s.unopenedCount);

      const early = await request(server())
        .get(`/api/deliveries/${id}/audio`)
        .set(as(b))
        .expect(409);
      expect(early.body.code).toBe('TAPE_NOT_OPENED');

      const opened = await request(server())
        .post(`/api/deliveries/${id}/open`)
        .set(as(b))
        .expect(200);
      expect(opened.body.opened).toBe(true);
      const audio = await request(server())
        .get(`/api/deliveries/${id}/audio`)
        .set(as(b))
        .expect(200);
      expect(audio.body).toMatchObject({
        url: expect.stringContaining('tape.m4a'),
        durationMs: 4200,
      });

      await request(server())
        .get(`/api/deliveries/${id}/audio`)
        .set(as(a))
        .expect(404);

      const detail = await request(server())
        .get(`/api/deliveries/sent/${id}`)
        .set(as(a))
        .expect(200);
      expect(detail.body.status).toBe('opened');
      expect(detail.body.openedAt).toMatch(/Z$/);
      expect(detail.body).not.toHaveProperty('url');

      const aMe = await me(a);
      expect(aMe.stats.sentCount).toBeGreaterThanOrEqual(2);
    });

    it('보낸 테이프 목록은 최근 순, 커서로 넘긴다', async () => {
      const page1 = await request(server())
        .get('/api/deliveries/sent?limit=1')
        .set(as(a))
        .expect(200);
      expect(page1.body.items).toHaveLength(1);
      expect(page1.body.nextCursor).toBeTruthy();
      const page2 = await request(server())
        .get(`/api/deliveries/sent?limit=1&cursor=${page1.body.nextCursor}`)
        .set(as(a))
        .expect(200);
      expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
      expect(page2.body.items[0].sentAt <= page1.body.items[0].sentAt).toBe(
        true,
      );
    });

    it('받는 사람이 나를 차단했으면 보낸 것처럼 보이지만 받는 쪽에는 들어가지 않는다', async () => {
      const c = await devLogin(app, '차단함');
      await befriend(app, a, c);
      await request(server())
        .post(`/api/friends/${a.user.id}/block`)
        .set(as(c))
        .expect(200);

      const rec = await readyRecording(app, a.accessToken);
      const sent = await send(a, {
        recordingId: rec,
        recipientId: c.user.id,
      }).expect(201);
      expect(sent.body.status).toBe('unopened');
      expect((await shelf(c)).stored).toBe(0);
      await request(server())
        .get(`/api/deliveries/${sent.body.id}`)
        .set(as(c))
        .expect(404);
      const friends = await request(server())
        .get('/api/friends')
        .set(as(c))
        .expect(200);
      expect(friends.body.items).toEqual([]);
    });

    it('친구 목록에서 뺀 사람이 다시 보내면 목록에 다시 나타난다', async () => {
      await request(server())
        .delete(`/api/friends/${a.user.id}`)
        .set(as(b))
        .expect(204);
      const rec = await readyRecording(app, a.accessToken);
      await send(a, { recordingId: rec, recipientId: b.user.id }).expect(201);
      const friends = await request(server())
        .get('/api/friends')
        .set(as(b))
        .expect(200);
      expect(
        friends.body.items.map((f: { userId: string }) => f.userId),
      ).toContain(a.user.id);
    });
  });

  describe('서랍', () => {
    it('칸 만들기·이름·순서, 옮기기·정렬, 칸 지우기, 테이프 지우기', async () => {
      const a = await devLogin(app, '보냄2');
      const b = await devLogin(app, '서랍');
      await befriend(app, a, b);
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const rec = await readyRecording(app, a.accessToken);
        ids.push(
          (
            await send(a, { recordingId: rec, recipientId: b.user.id }).expect(
              201,
            )
          ).body.id,
        );
      }
      // 새 테이프가 맨 위: [2, 1, 0]
      expect(
        (await shelf(b)).unsorted.map((x: { id: string }) => x.id),
      ).toEqual([ids[2], ids[1], ids[0]]);

      const g1 = (
        await request(server())
          .post('/api/shelf/groups')
          .set(as(b))
          .send({ name: '2026 생일' })
          .expect(201)
      ).body;
      const g2 = (
        await request(server())
          .post('/api/shelf/groups')
          .set(as(b))
          .send({})
          .expect(201)
      ).body;
      expect(g2.name).toBe('새 칸');
      const long = await request(server())
        .post('/api/shelf/groups')
        .set(as(b))
        .send({ name: '가'.repeat(13) })
        .expect(400);
      expect(long.body.code).toBe('INVALID_GROUP_NAME');

      // 안 뜯은 소포는 칸으로 못 옮긴다
      const notOpened = await request(server())
        .patch(`/api/shelf/items/${ids[0]}`)
        .set(as(b))
        .send({ groupId: g1.id, afterId: null })
        .expect(409);
      expect(notOpened.body.code).toBe('TAPE_NOT_OPENED');

      for (const id of ids)
        await request(server())
          .post(`/api/deliveries/${id}/open`)
          .set(as(b))
          .expect(200);
      await request(server())
        .patch(`/api/shelf/items/${ids[0]}`)
        .set(as(b))
        .send({ groupId: g1.id, afterId: null })
        .expect(200);
      await request(server())
        .patch(`/api/shelf/items/${ids[1]}`)
        .set(as(b))
        .send({ groupId: g1.id, afterId: ids[0] })
        .expect(200);
      const moved = await request(server())
        .patch(`/api/shelf/items/${ids[2]}`)
        .set(as(b))
        .send({ groupId: g1.id, afterId: ids[0] })
        .expect(200);
      expect(moved.body.groupId).toBe(g1.id);

      let s = await shelf(b);
      expect(s.unsorted).toEqual([]);
      expect(s.groups.map((g: { name: string }) => g.name)).toEqual([
        '2026 생일',
        '새 칸',
      ]);
      expect(s.groups[0].items.map((x: { id: string }) => x.id)).toEqual([
        ids[0],
        ids[2],
        ids[1],
      ]);

      // 칸 순서 바꾸기 + 이름 바꾸기
      await request(server())
        .patch(`/api/shelf/groups/${g2.id}`)
        .set(as(b))
        .send({ name: '엄마 목소리', afterId: null })
        .expect(200);
      s = await shelf(b);
      expect(s.groups.map((g: { name: string }) => g.name)).toEqual([
        '엄마 목소리',
        '2026 생일',
      ]);

      // 친구 화면
      const ft = await request(server())
        .get(`/api/friends/${a.user.id}/tapes`)
        .set(as(b))
        .expect(200);
      expect(ft.body.friend.userId).toBe(a.user.id);
      expect(ft.body.items).toHaveLength(3);
      expect(ft.body.items[0].groupName).toBe('2026 생일');
      expect(ft.body.unopenedCount).toBe(0);

      // 칸 지우기 → 분류 안 함으로
      await request(server())
        .delete(`/api/shelf/groups/${g1.id}`)
        .set(as(b))
        .expect(204);
      s = await shelf(b);
      expect(s.groups.map((g: { name: string }) => g.name)).toEqual([
        '엄마 목소리',
      ]);
      expect(s.unsorted.map((x: { id: string }) => x.id)).toEqual([
        ids[0],
        ids[2],
        ids[1],
      ]);
      expect(s.unsorted.every((x: { opened: boolean }) => x.opened)).toBe(true);

      // 친구 화면 "모두 재생" 순서: 칸 순서 → 칸 안 순서 → 분류 안 함(groupName null)
      const g3 = (
        await request(server())
          .post('/api/shelf/groups')
          .set(as(b))
          .send({ name: '맨뒤칸' })
          .expect(201)
      ).body;
      await request(server())
        .patch(`/api/shelf/items/${ids[1]}`)
        .set(as(b))
        .send({ groupId: g3.id, afterId: null })
        .expect(200);
      const ft2 = await request(server())
        .get(`/api/friends/${a.user.id}/tapes`)
        .set(as(b))
        .expect(200);
      expect(
        ft2.body.items.map((x: { id: string; groupName: string | null }) => [
          x.id,
          x.groupName,
        ]),
      ).toEqual([
        [ids[1], '맨뒤칸'],
        [ids[0], null],
        [ids[2], null],
      ]);
      await request(server())
        .patch(`/api/shelf/items/${ids[1]}`)
        .set(as(b))
        .send({ groupId: null, afterId: ids[2] })
        .expect(200);
      await request(server())
        .delete(`/api/shelf/groups/${g3.id}`)
        .set(as(b))
        .expect(204);

      // 테이프 지우기 → 서랍에서 사라지고 파일도 지워진다. 보낸 사람 목록에는 남는다
      const before = storage.objects.size;
      await request(server())
        .delete(`/api/shelf/items/${ids[2]}`)
        .set(as(b))
        .expect(204);
      expect(storage.objects.size).toBe(before - 1); // 원본은 변환 뒤 이미 지워져 변환본 1개
      s = await shelf(b);
      expect(s.stored).toBe(2);
      await request(server())
        .get(`/api/deliveries/sent/${ids[2]}`)
        .set(as(a))
        .expect(200);
      await request(server())
        .delete(`/api/shelf/items/${ids[2]}`)
        .set(as(b))
        .expect(404);
    });

    it('서랍이 꽉 차도 받는다 (보관량은 뜯은 테이프만)', async () => {
      const a = await devLogin(app, '보냄3');
      const b = await devLogin(app, '꽉참');
      await befriend(app, a, b);
      await ds.query('UPDATE users SET drawer_cap = 1 WHERE id = $1', [
        b.user.id,
      ]);
      for (let i = 0; i < 2; i++) {
        const rec = await readyRecording(app, a.accessToken);
        await send(a, { recordingId: rec, recipientId: b.user.id }).expect(201);
      }
      const s = await shelf(b);
      expect(s).toMatchObject({
        stored: 0,
        cap: 1,
        full: false,
        unopenedCount: 2,
      });
    });
  });

  describe('링크로 보내기', () => {
    it('링크 발급 → 미리보기(own/available) → 받기(서로 친구) → taken → 만료·다시 공유', async () => {
      const a = await devLogin(app, '링크');
      const b = await devLogin(app, '유진');
      const c = await devLogin(app, '늦음');

      const rec = await readyRecording(app, a.accessToken);
      const sent = await send(a, {
        recordingId: rec,
        linkName: '유진',
        tag: 'thinking',
      }).expect(201);
      expect(sent.body).toMatchObject({
        recipient: null,
        linkName: '유진',
        status: 'link_pending',
      });
      const url: string = sent.body.share.url;
      expect(url).toMatch(/^https:\/\/tapeletter\.test\/t\/[A-Za-z0-9_-]+$/);
      const token = url.split('/t/')[1];

      const own = await request(server())
        .get(`/api/share/${token}`)
        .set(as(a))
        .expect(409);
      expect(own.body).toMatchObject({
        code: 'LINK_OWN',
        deliveryId: sent.body.id,
        url,
      });

      const preview = await request(server())
        .get(`/api/share/${token}`)
        .set(as(b))
        .expect(200);
      expect(preview.body).toMatchObject({
        state: 'available',
        sender: { name: '링크' },
        tag: 'thinking',
      });

      // 웹 페이지 (앱 없는 사람)
      const web = await request(server())
        .get(`/api/share/${token}/web`)
        .expect(200);
      expect(web.body.senderName).toBe('링크');
      await request(server()).post(`/api/share/${token}/web/audio`).expect(200);
      const html = await request(server()).get(`/t/${token}`).expect(200);
      expect(html.text).toContain('링크님이<br>테이프를 보냈어요');

      const claimed = await request(server())
        .post(`/api/share/${token}/claim`)
        .set(as(b))
        .set(idem())
        .expect(200);
      expect(claimed.body.item).toMatchObject({
        id: sent.body.id,
        viaLink: true,
        opened: false,
      });
      expect(claimed.body.friend).toMatchObject({
        userId: a.user.id,
        name: '링크',
      });
      const aFriends = await request(server())
        .get('/api/friends')
        .set(as(a))
        .expect(200);
      expect(
        aFriends.body.items.map((f: { userId: string }) => f.userId),
      ).toContain(b.user.id);

      // 내가 이미 받았으면 claimed
      const mine = await request(server())
        .get(`/api/share/${token}`)
        .set(as(b))
        .expect(200);
      expect(mine.body).toMatchObject({
        state: 'claimed',
        deliveryId: sent.body.id,
      });

      const taken = await request(server())
        .get(`/api/share/${token}`)
        .set(as(c))
        .expect(409);
      expect(taken.body.code).toBe('LINK_TAKEN');
      await request(server())
        .post(`/api/share/${token}/claim`)
        .set(as(c))
        .set(idem())
        .expect(409);
      await request(server()).get(`/api/share/${token}/web`).expect(409);
      const takenHtml = await request(server()).get(`/t/${token}`).expect(409);
      expect(takenHtml.text).toContain('이미 다른 분이 받은 테이프예요');

      const detail = await request(server())
        .get(`/api/deliveries/sent/${sent.body.id}`)
        .set(as(a))
        .expect(200);
      expect(detail.body).toMatchObject({
        status: 'unopened',
        recipient: { userId: b.user.id },
        share: null,
      });
      await request(server())
        .post(`/api/deliveries/sent/${sent.body.id}/share`)
        .set(as(a))
        .expect(409);
    });

    it('링크 이름은 선택 입력: 생략·null·빈 문자열은 null, 받으면 recipient가 채워진다', async () => {
      const a = await devLogin(app, '무명링크');
      const b = await devLogin(app, '진짜이름');

      for (const body of [{}, { linkName: null }, { linkName: '  ' }]) {
        const rec = await readyRecording(app, a.accessToken);
        const sent = await send(a, { recordingId: rec, ...body }).expect(201);
        expect(sent.body).toMatchObject({
          recipient: null,
          linkName: null,
          status: 'link_pending',
        });
        expect(sent.body.share.url).toMatch(/\/t\/[A-Za-z0-9_-]+$/);
      }

      const rec = await readyRecording(app, a.accessToken);
      const tooLong = await send(a, {
        recordingId: rec,
        linkName: '가'.repeat(9),
      }).expect(400);
      expect(tooLong.body.code).toBe('INVALID_NAME');
      const both = await send(a, {
        recordingId: rec,
        recipientId: b.user.id,
        linkName: '유진',
      }).expect(400);
      expect(both.body.code).toBe('VALIDATION_FAILED');

      const sent = await send(a, { recordingId: rec, linkName: '' }).expect(
        201,
      );
      expect(sent.body.linkName).toBeNull();
      const token = (sent.body.share.url as string).split('/t/')[1];
      await request(server())
        .post(`/api/share/${token}/claim`)
        .set(as(b))
        .set(idem())
        .expect(200);
      const detail = await request(server())
        .get(`/api/deliveries/sent/${sent.body.id}`)
        .set(as(a))
        .expect(200);
      expect(detail.body).toMatchObject({
        linkName: null,
        recipient: { userId: b.user.id, name: '진짜이름', nickname: null },
      });
      expect(detail.body.share).toBeNull();
    });

    it('만료된 링크는 LINK_EXPIRED, 다시 공유하면 새 링크(7일)', async () => {
      const a = await devLogin(app, '만료');
      const b = await devLogin(app, '받을');
      const rec = await readyRecording(app, a.accessToken);
      const sent = await send(a, { recordingId: rec, linkName: '친구' }).expect(
        201,
      );
      const token = (sent.body.share.url as string).split('/t/')[1];

      const same = await request(server())
        .post(`/api/deliveries/sent/${sent.body.id}/share`)
        .set(as(a))
        .expect(200);
      expect(same.body.url).toBe(sent.body.share.url);

      await ds.query(
        `UPDATE deliveries SET share_expires_at = now() - interval '1 minute' WHERE id = $1`,
        [sent.body.id],
      );
      const expired = await request(server())
        .get(`/api/share/${token}`)
        .set(as(b))
        .expect(410);
      expect(expired.body.code).toBe('LINK_EXPIRED');
      const list = await request(server())
        .get(`/api/deliveries/sent/${sent.body.id}`)
        .set(as(a))
        .expect(200);
      expect(list.body.status).toBe('link_expired');

      const renewed = await request(server())
        .post(`/api/deliveries/sent/${sent.body.id}/share`)
        .set(as(a))
        .expect(200);
      expect(renewed.body.url).not.toBe(sent.body.share.url);
      expect(
        new Date(renewed.body.expiresAt).getTime() - Date.now(),
      ).toBeGreaterThan(6.9 * 24 * 3600 * 1000);
      await request(server()).get(`/api/share/${token}`).set(as(b)).expect(404);
      const newToken = (renewed.body.url as string).split('/t/')[1];
      await request(server())
        .get(`/api/share/${newToken}`)
        .set(as(b))
        .expect(200);
    });

    it('없는 링크는 LINK_NOT_FOUND', async () => {
      const u = await devLogin(app, '아무개');
      const res = await request(server())
        .get('/api/share/AAAAAAAAAAAAAAAAAAAAAAAA')
        .set(as(u))
        .expect(404);
      expect(res.body.code).toBe('LINK_NOT_FOUND');
      const html = await request(server()).get('/t/nope').expect(404);
      expect(html.text).toContain('테이프를 찾을 수 없어요');
    });
  });

  describe('회원 탈퇴', () => {
    it('보낸 사람이 탈퇴해도 받은 테이프는 남고, 받은 사람이 탈퇴하면 파일까지 지운다', async () => {
      const a = await devLogin(app, '떠남');
      const b = await devLogin(app, '남음');
      await befriend(app, a, b);
      const rec1 = await readyRecording(app, a.accessToken);
      const kept = await send(a, {
        recordingId: rec1,
        recipientId: b.user.id,
      }).expect(201);
      const rec2 = await readyRecording(app, a.accessToken);
      await send(a, { recordingId: rec2, linkName: '누군가' }).expect(201);
      await readyRecording(app, a.accessToken); // 보내지 않은 녹음

      const keysOf = async (userId: string) =>
        [...storage.objects.keys()].filter((k) =>
          k.startsWith(`recordings/${userId}/`),
        );
      expect(await keysOf(a.user.id)).toHaveLength(3); // 변환이 끝나면 원본은 지우고 변환본만 남는다

      await request(server()).delete('/api/users/me').set(as(a)).expect(204);

      // 받은 사람 서랍에는 남는다 (보낸 사람 이름은 보낼 때 이름)
      const s = await shelf(b);
      expect(s.unsorted[0]).toMatchObject({
        id: kept.body.id,
        sender: { userId: null, name: '떠남' },
      });
      await request(server())
        .post(`/api/deliveries/${kept.body.id}/open`)
        .set(as(b))
        .expect(200);
      await request(server())
        .get(`/api/deliveries/${kept.body.id}/audio`)
        .set(as(b))
        .expect(200);
      // 링크 테이프와 보내지 않은 녹음의 파일은 지워지고, 받은 테이프 파일(2개)만 남는다
      expect(await keysOf(a.user.id)).toHaveLength(1);

      await request(server()).delete('/api/users/me').set(as(b)).expect(204);
      expect(await keysOf(a.user.id)).toHaveLength(0);
      const [{ count }] = await ds.query(
        'SELECT count(*)::int AS count FROM deliveries WHERE id = $1',
        [kept.body.id],
      );
      expect(count).toBe(0);
    });
  });
});
