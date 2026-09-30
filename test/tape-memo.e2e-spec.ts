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
} from './utils.js';

describe('테이프 메모 (e2e)', () => {
  let app: INestApplication<App>;
  const server = () => app.getHttpServer();
  const as = (u: AuthResponse) => bearer(u.accessToken);
  let me: AuthResponse;
  let jihyun: AuthResponse;
  let stranger: AuthResponse;

  beforeAll(async () => {
    app = await createApp();
    me = await devLogin(app, '민경');
    jihyun = await devLogin(app, '지현');
    stranger = await devLogin(app, '낯선이');
    await befriend(app, me, jihyun);
  });
  afterAll(() => app.close());

  /** 지현이 나에게 테이프를 보낸다 → delivery id */
  const receive = async (): Promise<string> => {
    const rec = await readyRecording(app, jihyun.accessToken);
    const sent = await request(server())
      .post('/api/deliveries')
      .set(as(jihyun))
      .set(idem())
      .send({ recordingId: rec, recipientId: me.user.id })
      .expect(201);
    return sent.body.id as string;
  };

  const setMemo = (id: string, memo: unknown, u = me) =>
    request(server())
      .put(`/api/shelf/items/${id}/memo`)
      .set(as(u))
      .send({ memo });

  it('남기기 · 고치기 · 지우기 · 규칙 (40자, 한글·이모지 한 글자)', async () => {
    const id = await receive();
    const fresh = await request(server())
      .get('/api/shelf')
      .set(as(me))
      .expect(200);
    expect(fresh.body.unsorted[0]).toMatchObject({ id, memo: null });

    const set = await setMemo(id, '  생일 아침에 받은 노래 🎂 ').expect(200);
    expect(set.body).toMatchObject({ id, memo: '생일 아침에 받은 노래 🎂' });

    const shelf = await request(server())
      .get('/api/shelf')
      .set(as(me))
      .expect(200);
    expect(shelf.body.unsorted[0].memo).toBe('생일 아침에 받은 노래 🎂');
    const one = await request(server())
      .get(`/api/deliveries/${id}`)
      .set(as(me))
      .expect(200);
    expect(one.body.memo).toBe('생일 아침에 받은 노래 🎂');

    await setMemo(id, '가'.repeat(40)).expect(200);
    const tooLong = await setMemo(id, '가'.repeat(41)).expect(400);
    expect(tooLong.body).toEqual({
      code: 'INVALID_MEMO',
      message: '메모는 40자까지 적을 수 있어요',
    });
    await setMemo(id, '줄\n바꿈').expect(400);
    expect((await setMemo(id, 123).expect(400)).body.code).toBe(
      'VALIDATION_FAILED',
    );
    await request(server())
      .put(`/api/shelf/items/${id}/memo`)
      .set(as(me))
      .send({})
      .expect(400);

    expect((await setMemo(id, '   ').expect(200)).body.memo).toBeNull();
    await setMemo(id, '다시').expect(200);
    expect((await setMemo(id, null).expect(200)).body.memo).toBeNull();
  });

  it('보낸 사람과 다른 사람에게는 보이지 않고 바꿀 수도 없다', async () => {
    const id = await receive();
    await setMemo(id, '나만 아는 메모').expect(200);

    const sent = await request(server())
      .get(`/api/deliveries/sent/${id}`)
      .set(as(jihyun))
      .expect(200);
    expect(JSON.stringify(sent.body)).not.toContain('나만 아는 메모');
    const sentList = await request(server())
      .get('/api/deliveries/sent')
      .set(as(jihyun))
      .expect(200);
    expect(JSON.stringify(sentList.body)).not.toContain('나만 아는 메모');

    const bySender = await setMemo(id, '보낸 사람', jihyun).expect(404);
    expect(bySender.body.code).toBe('TAPE_NOT_FOUND');
    await setMemo(id, '남', stranger).expect(404);
  });

  it('테이프를 지우면 메모도 지우고, 지운 테이프에는 남길 수 없다', async () => {
    const id = await receive();
    await setMemo(id, '지울 테이프').expect(200);
    await request(server())
      .delete(`/api/shelf/items/${id}`)
      .set(as(me))
      .expect(204);
    expect((await setMemo(id, '또').expect(404)).body.code).toBe(
      'TAPE_NOT_FOUND',
    );
    const ds = app.get<DataSource>(getDataSourceToken());
    const rows = await ds.query<{ memo: string | null }[]>(
      'SELECT memo FROM deliveries WHERE id = $1',
      [id],
    );
    expect(rows[0].memo).toBeNull();
  });
});
