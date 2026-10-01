import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { GoogleService } from '../src/auth/google.service.js';
import { RequestLogsService } from '../src/request-logs/request-logs.service.js';
import { bearer, clock, createApp, devLogin } from './utils.js';

interface Row {
  request_id: string;
  method: string;
  path: string;
  status: number;
  user_id: string | null;
  ip: string | null;
  app_version: string | null;
  platform: string | null;
  error_code: string | null;
  detail: string | null;
}

describe('요청 기록 request_logs (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let logs: RequestLogsService;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createApp();
    ds = app.get<DataSource>(getDataSourceToken());
    logs = app.get(RequestLogsService);
  });
  afterAll(() => app.close());
  afterEach(() => {
    clock.offsetMs = 0;
  });

  const rowOf = async (requestId: string): Promise<Row | undefined> => {
    await logs.flush();
    const rows: Row[] = await ds.query(
      'SELECT * FROM request_logs WHERE request_id = $1',
      [requestId],
    );
    return rows[0];
  };

  it('요청마다 X-Request-Id를 돌려주고 한 줄을 남긴다 (사용자, 상태, IP, 앱 버전, 마스킹한 경로)', async () => {
    const u = await devLogin(app, '기록');
    const res = await request(server())
      .get('/api/users/me?x=secret')
      .set(bearer(u.accessToken))
      .set('X-App-Version', '1.2.3')
      .set('X-App-Platform', 'android')
      .set('X-Forwarded-For', '203.0.113.7')
      .expect(200);
    const id = res.headers['x-request-id'] as string;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const row = await rowOf(id);
    expect(row).toMatchObject({
      method: 'GET',
      path: '/api/users/me',
      status: 200,
      user_id: u.user.id,
      ip: '203.0.113.7',
      app_version: '1.2.3',
      platform: 'android',
      error_code: null,
      detail: null,
    });
    // 토큰은 어디에도 남지 않는다
    const all = JSON.stringify(row);
    expect(all).not.toContain(u.accessToken);
    expect(all).not.toContain('secret');
  });

  it('오류 응답은 오류 코드를, 링크 토큰은 앞 4자만, 헬스체크는 남기지 않는다', async () => {
    const res = await request(server())
      .get('/api/deliveries/00000000-0000-4000-8000-000000000000')
      .expect(401);
    expect(
      (await rowOf(res.headers['x-request-id'] as string))?.error_code,
    ).toBe('UNAUTHORIZED');

    const t = await request(server())
      .get('/t/AbCdEfGhIjKlMnOpQrSt')
      .expect(404);
    expect(await rowOf(t.headers['x-request-id'] as string)).toMatchObject({
      path: '/t/AbCd…',
      status: 404,
    });

    const h = await request(server()).get('/api/health').expect(200);
    expect(h.headers['x-request-id']).toBeUndefined();
  });

  it('소셜 로그인 실패: provider와 내부 사유를 detail에 남긴다 (Google aud 불일치)', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const pem = await exportSPKI(publicKey);
    app.get(GoogleService).certs = () => Promise.resolve({ k1: pem });
    const idToken = await new SignJWT({ sub: 'g-1', email_verified: true })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://accounts.google.com')
      .setAudience('someone-else.apps.googleusercontent.com')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const res = await request(server())
      .post('/api/auth/google')
      .send({ idToken })
      .expect(401);
    const row = await rowOf(res.headers['x-request-id'] as string);
    expect(row).toMatchObject({
      path: '/api/auth/google',
      status: 401,
      error_code: 'SOCIAL_TOKEN_INVALID',
      user_id: null,
    });
    expect(row!.detail).toBe(
      'google 로그인 실패(SOCIAL_TOKEN_INVALID): AUD_MISMATCH',
    );
    expect(row!.detail).not.toContain(idToken);
  });

  it(`보관 기간(LOG_RETENTION_DAYS=30)이 지난 기록은 정리 작업이 지운다`, async () => {
    await ds.query(
      `INSERT INTO request_logs (created_at, request_id, method, path, status, duration_ms)
       VALUES (now() - interval '31 days', 'old-req-0001', 'GET', '/x', 200, 1),
              (now() - interval '29 days', 'new-req-0001', 'GET', '/x', 200, 1)`,
    );
    expect(await logs.purgeExpired()).toBeGreaterThanOrEqual(1);
    const left: { request_id: string }[] = await ds.query(
      `SELECT request_id FROM request_logs WHERE request_id IN ('old-req-0001', 'new-req-0001')`,
    );
    expect(left.map((r) => r.request_id)).toEqual(['new-req-0001']);

    // 시계를 2일 옮기면 29일 된 줄도 지워진다
    clock.offsetMs = 2 * 86_400_000;
    await logs.purgeExpired();
    const gone = await ds.query(
      `SELECT 1 FROM request_logs WHERE request_id = 'new-req-0001'`,
    );
    expect(gone).toHaveLength(0);
  });
});
