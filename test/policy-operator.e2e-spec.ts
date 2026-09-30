import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

// 이 파일만 운영자 정보를 채운다 (AppModule을 불러오기 전에). 이스케이프를 보려고 특수문자를 넣는다
const saved = vi.hoisted(() => {
  const keys = [
    'POLICY_OPERATOR_NAME',
    'POLICY_CONTACT_EMAIL',
    'POLICY_PRIVACY_OFFICER',
    'POLICY_BUSINESS_INFO',
    'POLICY_EFFECTIVE_DATE',
  ];
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.POLICY_OPERATOR_NAME = `<script>테이프레터&"'`;
  process.env.POLICY_CONTACT_EMAIL = 'help@tapeletter.test';
  process.env.POLICY_PRIVACY_OFFICER = '<b>민경</b>';
  process.env.POLICY_BUSINESS_INFO = '사업자등록번호 000-00-00000';
  process.env.POLICY_EFFECTIVE_DATE = '2026-10-01';
  return before;
});

const { createApp } = await import('./utils.js');

describe('정책 페이지 (e2e, 운영자 정보 있음)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('환경 변수의 운영자 정보를 이스케이프해서 보여 준다', async () => {
    const privacy = (
      await request(app.getHttpServer()).get('/privacy').expect(200)
    ).text;
    expect(privacy).not.toContain('<script>테이프레터');
    expect(privacy).not.toContain('<b>민경</b>');
    expect(privacy).toContain('&lt;script&gt;테이프레터&amp;&quot;&#39;(이하');
    expect(privacy).toContain(
      '<td data-label="구분">개인정보 보호책임자</td><td data-label="내용">&lt;b&gt;민경&lt;/b&gt;</td>',
    );
    expect(privacy).toContain(
      '<td data-label="구분">이메일</td><td data-label="내용">help@tapeletter.test</td>',
    );
    expect(privacy).toContain('시행일 2026-10-01');
    expect(privacy).not.toContain('준비 중');

    const terms = (await request(app.getHttpServer()).get('/terms').expect(200))
      .text;
    expect(terms).toContain(
      '<td data-label="구분">사업자 정보</td><td data-label="내용">사업자등록번호 000-00-00000</td>',
    );
    expect(terms).toContain('이 약관은 2026-10-01부터 적용합니다.');
  });

  it('아동 안전 정책: 담당자 이름·이메일, 시행일', async () => {
    const html = (
      await request(app.getHttpServer()).get('/child-safety').expect(200)
    ).text;
    expect(html).toContain(
      '<td data-label="구분">담당자</td><td data-label="내용">&lt;b&gt;민경&lt;/b&gt;</td>',
    );
    expect(html).toContain(
      '<td data-label="구분">이메일</td><td data-label="내용">help@tapeletter.test</td>',
    );
    expect(html).toContain('이메일로 신고: help@tapeletter.test');
    expect(html).toContain(
      'Child safety contact: &lt;b&gt;민경&lt;/b&gt;, help@tapeletter.test',
    );
    expect(html).toContain('시행일 2026-10-01');
    expect(html).toContain('이 정책은 2026-10-01부터 적용합니다.');
    expect(html).not.toContain('<b>민경</b>');
  });
});
