import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { GoogleService } from '../src/auth/google.service.js';
import { bearer, clock, createApp, uniqueKey } from './utils.js';

const AUD = 'web-1.apps.googleusercontent.com';
const KID = 'test-kid';

describe('Google 로그인 POST /auth/google (e2e, 로컬 서명 키)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let privateKey: CryptoKey;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createApp();
    ds = app.get<DataSource>(getDataSourceToken());
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey;
    const pem = await exportSPKI(pair.publicKey);
    // 실제 검증 로직은 그대로 쓰고, Google 공개 인증서만 로컬 키로 바꾼다
    app.get(GoogleService).certs = () => Promise.resolve({ [KID]: pem });
  });
  afterAll(() => app.close());
  afterEach(() => {
    clock.offsetMs = 0;
  });

  const token = (claims: Record<string, unknown> = {}, aud = AUD) =>
    new SignJWT({ email_verified: true, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: KID, typ: 'JWT' })
      .setIssuer('https://accounts.google.com')
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
  const login = (idToken: string) =>
    request(server()).post('/api/auth/google').send({ idToken });

  it('신규 가입 → 재로그인: 같은 사용자, 이름은 suggestedName으로만, 확인된 이메일만 저장', async () => {
    const sub = `g-${uniqueKey()}`;
    const first = await login(
      await token({ sub, email: 'a@gmail.com', name: '김지현입니다아아' }),
    ).expect(200);
    expect(first.body).toMatchObject({
      isNewUser: true,
      suggestedName: '김지현입니다아아',
      user: { name: null, credits: 10, providers: ['google'] },
    });
    expect(first.body.accessToken).toBeTruthy();
    const [row] = await ds.query(
      `SELECT provider, email FROM auth_identities WHERE provider_sub = $1`,
      [sub],
    );
    expect(row).toEqual({ provider: 'google', email: 'a@gmail.com' });

    const again = await login(await token({ sub })).expect(200);
    expect(again.body.isNewUser).toBe(false);
    expect(again.body.user.id).toBe(first.body.user.id);
    expect(again.body.user.credits).toBe(10);

    // 확인되지 않은 이메일은 저장하지 않는다
    const sub2 = `g-${uniqueKey()}`;
    await login(
      await token({ sub: sub2, email: 'b@x.com', email_verified: false }),
    ).expect(200);
    const [row2] = await ds.query(
      `SELECT email FROM auth_identities WHERE provider_sub = $1`,
      [sub2],
    );
    expect(row2.email).toBeNull();
  });

  it('두 번째 클라이언트 ID도 받는다', async () => {
    await login(
      await token(
        { sub: `g-${uniqueKey()}` },
        'web-2.apps.googleusercontent.com',
      ),
    ).expect(200);
  });

  it('잘못된 토큰 · audience 불일치 · 다른 iss · 만료 · 다른 키 → 401 SOCIAL_TOKEN_INVALID', async () => {
    const sub = `g-${uniqueKey()}`;
    const bad = [
      'not-a-jwt',
      await token({ sub }, 'other.apps.googleusercontent.com'),
      await new SignJWT({ sub })
        .setProtectedHeader({ alg: 'RS256', kid: KID })
        .setIssuer('https://evil.example.com')
        .setAudience(AUD)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey),
      await new SignJWT({ sub })
        .setProtectedHeader({ alg: 'RS256', kid: KID })
        .setIssuer('accounts.google.com')
        .setAudience(AUD)
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
        .sign(privateKey),
      await new SignJWT({ sub })
        .setProtectedHeader({ alg: 'RS256', kid: KID })
        .setIssuer('accounts.google.com')
        .setAudience(AUD)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign((await generateKeyPair('RS256')).privateKey),
    ];
    for (const t of bad) {
      const res = await login(t).expect(401);
      expect(res.body.code).toBe('SOCIAL_TOKEN_INVALID');
    }
    await request(server()).post('/api/auth/google').send({}).expect(400);
    const [{ count }] = await ds.query(
      `SELECT count(*)::int AS count FROM auth_identities WHERE provider_sub = $1`,
      [sub],
    );
    expect(count).toBe(0);
  });

  it('탈퇴 후 30일 안에는 같은 Google 계정으로 재가입 403 REJOIN_RESTRICTED', async () => {
    const sub = `g-${uniqueKey()}`;
    const first = await login(await token({ sub })).expect(200);
    await request(server())
      .delete('/api/users/me')
      .set(bearer(first.body.accessToken))
      .expect(204);
    const blocked = await login(await token({ sub })).expect(403);
    expect(blocked.body.code).toBe('REJOIN_RESTRICTED');
    expect(blocked.body.availableAt).toBeTruthy();

    clock.offsetMs = 30 * 86_400_000 + 60_000;
    const again = await login(await token({ sub })).expect(200);
    expect(again.body.isNewUser).toBe(true);
    expect(again.body.user.id).not.toBe(first.body.user.id);
  });
});
