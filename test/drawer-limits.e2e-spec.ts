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
  fcm,
  idem,
  readyRecording,
} from './utils.js';

describe('서랍 용량(뜯기 제한) · 칸 10개 제한 (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const server = () => app.getHttpServer();
  const as = (u: AuthResponse) => bearer(u.accessToken);

  beforeAll(async () => {
    app = await createApp();
    ds = app.get<DataSource>(getDataSourceToken());
  });
  afterAll(() => app.close());

  const send = async (from: AuthResponse, to: AuthResponse) => {
    const rec = await readyRecording(app, from.accessToken, 15);
    const res = await request(server())
      .post('/api/deliveries')
      .set(as(from))
      .set(idem())
      .send({ recordingId: rec, recipientId: to.user.id })
      .expect(201);
    return res.body.id as string;
  };
  const open = (u: AuthResponse, id: string) =>
    request(server()).post(`/api/deliveries/${id}/open`).set(as(u));
  const shelf = (u: AuthResponse) =>
    request(server())
      .get('/api/shelf')
      .set(as(u))
      .expect(200)
      .then((r) => r.body);
  const setCap = (u: AuthResponse, cap: number) =>
    ds.query('UPDATE users SET drawer_cap = $2 WHERE id = $1', [
      u.user.id,
      cap,
    ]);

  describe('서랍: 받기는 되고 뜯기만 막는다', () => {
    it('stored = 뜯은 테이프 수, cap-1까지 뜯고 cap에서 409 DRAWER_FULL, 이미 뜯은 건 다시 불러도 200', async () => {
      const a = await devLogin(app, '보냄');
      const b = await devLogin(app, '받음');
      await befriend(app, a, b);
      await setCap(b, 2);
      const ids = [await send(a, b), await send(a, b), await send(a, b)];

      // 안 뜯은 소포는 보관량에 들어가지 않는다
      let s = await shelf(b);
      expect(s).toMatchObject({
        stored: 0,
        cap: 2,
        full: false,
        unopenedCount: 3,
      });
      const me = (
        await request(server()).get('/api/users/me').set(as(b)).expect(200)
      ).body;
      expect(me.drawer).toMatchObject({ stored: 0, full: false });
      expect(me.stats.receivedCount).toBe(3);

      await open(b, ids[0]).expect(200); // 0 → 1 (cap-1)
      await open(b, ids[1]).expect(200); // 1 → 2 (= cap)
      s = await shelf(b);
      expect(s).toMatchObject({ stored: 2, full: true, unopenedCount: 1 });

      const full = await open(b, ids[2]).expect(409);
      expect(full.body).toMatchObject({
        code: 'DRAWER_FULL',
        message: '서랍이 꽉 찼어요. 테이프를 지우거나 서랍을 넓혀 주세요',
      });
      // 이미 뜯은 테이프는 그대로
      const again = await open(b, ids[0]).expect(200);
      expect(again.body.opened).toBe(true);

      // 하나 지우면 다시 뜯을 수 있다
      await request(server())
        .delete(`/api/shelf/items/${ids[0]}`)
        .set(as(b))
        .expect(204);
      await open(b, ids[2]).expect(200);
    });

    it('이미 cap을 넘긴 계정은 그대로 두고 더 뜯는 것만 막는다', async () => {
      const a = await devLogin(app, '보냄2');
      const b = await devLogin(app, '넘침');
      await befriend(app, a, b);
      const ids = [await send(a, b), await send(a, b), await send(a, b)];
      await ds.query(
        'UPDATE deliveries SET opened_at = now() WHERE id = ANY($1)',
        [ids.slice(0, 2)],
      );
      await setCap(b, 1);
      const s = await shelf(b);
      expect(s).toMatchObject({ stored: 2, cap: 1, full: true });
      await open(b, ids[2]).expect(409);
      await open(b, ids[1]).expect(200);
    });

    it('동시에 뜯어도 cap을 넘지 않는다', async () => {
      const a = await devLogin(app, '보냄3');
      const b = await devLogin(app, '동시');
      await befriend(app, a, b);
      await setCap(b, 1);
      const ids = [await send(a, b), await send(a, b), await send(a, b)];
      const res = await Promise.all(ids.map((id) => open(b, id)));
      expect(res.map((r) => r.status).sort()).toEqual([200, 409, 409]);
      expect((await shelf(b)).stored).toBe(1);
    });

    it('링크로 받은 테이프도 open 단계에서 같은 규칙', async () => {
      const a = await devLogin(app, '링크');
      const b = await devLogin(app, '링크받음');
      await setCap(b, 1);
      // b의 서랍을 먼저 채운다
      const c = await devLogin(app, '친구');
      await befriend(app, c, b);
      await open(b, await send(c, b)).expect(200);

      const rec = await readyRecording(app, a.accessToken, 15);
      const sent = await request(server())
        .post('/api/deliveries')
        .set(as(a))
        .set(idem())
        .send({ recordingId: rec, linkName: '받을분' })
        .expect(201);
      const token = (sent.body.share.url as string).split('/t/')[1];
      const claimed = await request(server())
        .post(`/api/share/${token}/claim`)
        .set(as(b))
        .set(idem())
        .expect(200);
      expect(claimed.body.item.opened).toBe(false);
      const res = await open(b, claimed.body.item.id).expect(409);
      expect(res.body.code).toBe('DRAWER_FULL');
    });

    it('푸시: 받는 사람 서랍이 꽉 찼으면 본문이 바뀐다 (제목은 그대로)', async () => {
      const a = await devLogin(app, '하늘');
      const b = await devLogin(app, '꽉참');
      await befriend(app, a, b);
      await request(server())
        .put('/api/notifications/devices')
        .set(as(b))
        .send({ token: 'token-drawer-full-0001', platform: 'android' })
        .expect(204);
      await setCap(b, 1);
      fcm.sent = [];

      const first = await send(a, b);
      await vi.waitFor(() =>
        expect(fcm.sent).toContainEqual(
          expect.objectContaining({
            token: 'token-drawer-full-0001',
            title: '하늘님이 테이프를 보냈어요',
            body: '15초 테이프가 도착했어요. 뜯어서 들어보세요',
          }),
        ),
      );
      await open(b, first).expect(200);

      fcm.sent = [];
      const second = await send(a, b);
      await vi.waitFor(() =>
        expect(fcm.sent).toContainEqual({
          token: 'token-drawer-full-0001',
          title: '하늘님이 테이프를 보냈어요',
          body: '15초 테이프가 도착했어요. 서랍이 꽉 차서 뜯으려면 자리가 필요해요',
          data: { type: 'tape', deliveryId: second },
        }),
      );
    });
  });

  describe('칸: 한 칸에 10개까지', () => {
    let a: AuthResponse;
    let b: AuthResponse;
    let opened: string[];

    beforeAll(async () => {
      a = await devLogin(app, '칸보냄');
      b = await devLogin(app, '칸받음');
      await befriend(app, a, b);
      await setCap(b, 100);
      opened = [];
      for (let i = 0; i < 14; i++) opened.push(await send(a, b));
      await ds.query(
        'UPDATE deliveries SET opened_at = now() WHERE id = ANY($1)',
        [opened],
      );
    });

    const createGroup = async (name: string) =>
      (
        await request(server())
          .post('/api/shelf/groups')
          .set(as(b))
          .send({ name })
          .expect(201)
      ).body;
    const move = (id: string, groupId: string | null, afterId: string | null) =>
      request(server())
        .patch(`/api/shelf/items/${id}`)
        .set(as(b))
        .send({ groupId, afterId });

    it('9개 → 10번째 성공, 11번째 409 GROUP_FULL, 같은 칸 안 재정렬과 분류 안 함은 허용, cap 10 응답', async () => {
      const g = await createGroup('생일');
      expect(g.cap).toBe(10);
      for (let i = 0; i < 9; i++) await move(opened[i], g.id, null).expect(200);
      await move(opened[9], g.id, null).expect(200); // 10번째 (경계)
      const full = await move(opened[10], g.id, null).expect(409);
      expect(full.body).toMatchObject({
        code: 'GROUP_FULL',
        message: '한 칸에는 10개까지 넣을 수 있어요',
      });

      // 같은 칸 안 재정렬은 된다
      await move(opened[0], g.id, opened[5]).expect(200);
      // 분류 안 함은 제한 없음
      await move(opened[11], null, null).expect(200);

      const s = await shelf(b);
      const group = s.groups.find((x: { id: string }) => x.id === g.id);
      expect(group.cap).toBe(10);
      expect(group.items).toHaveLength(10);

      // 칸에서 하나 빼면 다시 넣을 수 있다
      await move(opened[3], null, null).expect(200);
      await move(opened[10], g.id, null).expect(200);
    });

    it('이미 10개를 넘은 칸은 그대로, 더 넣는 것만 막는다', async () => {
      const g = await createGroup('넘친 칸');
      const extra = [];
      for (let i = 0; i < 11; i++) extra.push(await send(a, b));
      await ds.query(
        `UPDATE deliveries SET opened_at = now(), group_id = $2, position = 'a' || lpad(id::text, 40, '0')
          WHERE id = ANY($1)`,
        [extra, g.id],
      );
      const s = await shelf(b);
      expect(
        s.groups.find((x: { id: string }) => x.id === g.id).items,
      ).toHaveLength(11);
      await move(opened[12], g.id, null).expect(409);
      await move(extra[0], g.id, extra[5]).expect(200);
    });

    it('동시에 10번째 자리로 옮겨도 하나만 들어간다', async () => {
      const g = await createGroup('동시 칸');
      const ids = [];
      for (let i = 0; i < 11; i++) ids.push(await send(a, b));
      await ds.query(
        'UPDATE deliveries SET opened_at = now() WHERE id = ANY($1)',
        [ids],
      );
      for (let i = 0; i < 9; i++) await move(ids[i], g.id, null).expect(200);
      const res = await Promise.all([
        move(ids[9], g.id, null),
        move(ids[10], g.id, null),
      ]);
      expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
      const [{ count }] = await ds.query(
        'SELECT count(*)::int AS count FROM deliveries WHERE group_id = $1 AND deleted_at IS NULL',
        [g.id],
      );
      expect(count).toBe(10);
    });
  });
});
