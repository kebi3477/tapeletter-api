import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createApp } from './utils.js';

describe('정책 페이지 /privacy · /terms (e2e, 운영자 정보 없음)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(() => app.close());

  const nonceOf = (csp: string) => /style-src 'nonce-([^']+)'/.exec(csp)?.[1];

  it.each([
    ['/privacy', '개인정보 처리방침'],
    ['/terms', '이용약관'],
    ['/child-safety', '아동 안전 정책'],
  ])('%s: 200, CSP nonce, 스크립트 없음', async (path, title) => {
    const res = await request(app.getHttpServer()).get(path).expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain(`<h1>${title}</h1>`);
    const csp = res.headers['content-security-policy'] as string;
    const nonce = nonceOf(csp);
    expect(nonce).toBeTruthy();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'none'");
    expect(res.text).toContain(`<style nonce="${nonce}">`);
    expect(res.text).not.toMatch(/<script/);
    expect(res.text).not.toMatch(/ style="/);
    const again = await request(app.getHttpServer()).get(path).expect(200);
    expect(
      nonceOf(again.headers['content-security-policy'] as string),
    ).not.toBe(nonce);
    // 초안 표시는 본문에 노출하지 않는다
    expect(res.text).not.toContain('검토 전');
  });

  it('운영자 정보가 비어 있으면 "준비 중"으로 표시한다', async () => {
    const privacy = await request(app.getHttpServer())
      .get('/privacy')
      .expect(200);
    expect(privacy.text).toContain('시행일 준비 중');
    expect(privacy.text).toContain(
      '<td data-label="구분">개인정보 보호책임자</td><td data-label="내용" class="pending">준비 중</td>',
    );
    expect(privacy.text).toContain(
      '<td data-label="구분">이메일</td><td data-label="내용" class="pending">준비 중</td>',
    );
    const terms = await request(app.getHttpServer()).get('/terms').expect(200);
    expect(terms.text).toContain(
      '<td data-label="구분">사업자 정보</td><td data-label="내용" class="pending">준비 중</td>',
    );
  });

  it('코드의 실제 수치를 쓴다 (링크 7일, 재가입 30일, 백업 14개, 광고 하루 3번)', async () => {
    const privacy = (await request(app.getHttpServer()).get('/privacy')).text;
    expect(privacy).toContain('링크는 7일 동안 유효합니다');
    expect(privacy).toContain('30일(재가입 제한 기간)');
    expect(privacy).toContain('최근 14개(약 14일)');
    expect(privacy).toContain('HMAC-SHA256');
    const terms = (await request(app.getHttpServer()).get('/terms')).text;
    expect(terms).toContain(
      '탈퇴하고 30일 동안은 같은 카카오·Apple·Google 계정으로 다시 가입할 수 없습니다',
    );
    expect(terms).toContain('하루 3번까지');
  });

  it('정책 결정 1.1 반영: 버전·개정 이력, 만 14세, 청약철회, 유효기간, 종료 30일, 원본 삭제, AdMob, 고지 기간', async () => {
    const privacy = (await request(app.getHttpServer()).get('/privacy')).text;
    expect(privacy).toContain('버전 1.6');
    expect(privacy).toContain('Google LLC (Google 로그인)');
    expect(privacy).toContain(
      'Google 계정 식별자, 이메일(Google이 확인한 경우만)',
    );
    expect(privacy).toContain('Google 쪽 연결은 해제하지 않습니다');
    expect(privacy).toContain(
      '받은 테이프에 남긴 메모(최대 40자, 나에게만 보임)',
    );
    expect(privacy).toContain('<h2>개정 이력</h2>');
    expect(privacy).toContain('만 14세 이상만 이용할 수 있습니다');
    expect(privacy).toContain('테이프 소리로 변환이 끝나면 바로 삭제');
    expect(privacy).toContain(
      '5년이 지나면 매시간 도는 정리 작업이 삭제합니다',
    );
    expect(privacy).toContain('Google LLC (AdMob)');
    expect(privacy).toContain('iOS 광고 식별자(IDFA)를 쓰지 않으며');
    expect(privacy).toContain('리버스 프록시는 접속 로그를 남기지 않습니다');
    expect(privacy).toContain('시행 7일 전');
    expect(privacy).not.toContain(
      '연동할 때 보내는 항목을 이 방침에 추가합니다',
    );

    const terms = (await request(app.getHttpServer()).get('/terms')).text;
    expect(terms).toContain('버전 1.5');
    expect(terms).toContain(
      '15초 테이프는 무료로 제한 없이 쓸 수 있고, 1분·3분 테이프는',
    );
    expect(terms).toContain(
      '테이프 구매(1분 1개 30, 5개 120 · 3분 1개 50, 5개 200)',
    );
    expect(terms).toContain('결제일부터 7일 안에 청약철회를 할 수 있습니다');
    expect(terms).toContain('17조 2항 5호');
    expect(terms).toContain('크레딧에는 유효기간이 없습니다.');
    expect(terms).toContain('종료일 30일 전까지 공지');
    expect(terms).toContain('만 14세 이상만 가입해 이용할 수 있습니다');
    expect(terms).toContain('적용일 30일 전부터 알립니다');
  });

  it('신고(1.2): 수집 항목, 3년 보관, 앱 안 신고와 문의 이메일', async () => {
    const privacy = (await request(app.getHttpServer()).get('/privacy')).text;
    expect(privacy).toContain('신고 기록');
    expect(privacy).toContain('친구에게 붙인 별명(최대 10자, 나에게만 보임)');
    expect(privacy).toContain('3년(신고 처리 이력 보관)');
    expect(privacy).toContain('녹음 파일을 따로 복사하지 않으며');
    const terms = (await request(app.getHttpServer()).get('/terms')).text;
    expect(terms).toContain(
      '앱 안의 신고 기능이나 아래 문의 이메일로 신고할 수 있습니다',
    );
    expect(terms).not.toContain('앱 안의 신고 기능은 아직 없습니다');
  });

  it('서비스 이름: tapeletter(테이프레터), 워드마크·title·og:site_name, 개정 이력', async () => {
    for (const path of ['/privacy', '/terms']) {
      const html = (await request(app.getHttpServer()).get(path)).text;
      expect(html).toContain('tapeletter(테이프레터)');
      expect(html).toContain('<span>tapeletter</span>');
      expect(html).toContain(
        '<meta property="og:site_name" content="tapeletter">',
      );
      expect(html).toMatch(/<title>[^<]+ · tapeletter<\/title>/);
      expect(html).toContain('서비스 이름 변경(카세트 → 테이프레터)');
      expect(html).toContain('테이프레터 운영자(이하');
      expect(html).not.toMatch(/cassette|카세트\(/);
    }
  });

  it('아동 안전 정책: 무관용, 신고 방법, 조치, 영어 요약, 세 페이지 서로 링크', async () => {
    const res = await request(app.getHttpServer())
      .get('/child-safety')
      .expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    const html = res.text;
    expect(html).toContain('무관용 원칙');
    expect(html).toContain('아동 성착취물(CSAM)');
    expect(html).toContain('만 14세 이상만 가입해 이용할 수 있습니다');
    expect(html).toContain('신고 방법');
    expect(html).toContain('사유 &#39;성적인 내용&#39;');
    expect(html).toContain('해당 콘텐츠를 즉시 삭제');
    expect(html).toContain('이용약관 12조');
    expect(html).toContain('방송통신심의위원회');
    expect(html).toContain('아동 안전 담당자');
    expect(html).toContain('<section id="english" lang="en">');
    expect(html).toContain('zero tolerance');
    expect(html).toContain('<a href="/terms">이용약관</a>');
    expect(html).toContain('<a href="/privacy">개인정보 처리방침</a>');
    for (const path of ['/privacy', '/terms']) {
      const other = (await request(app.getHttpServer()).get(path)).text;
      expect(other).toContain('<a href="/child-safety">아동 안전 정책</a>');
    }
    // /api 밖에서만 연다
    await request(app.getHttpServer()).get('/api/child-safety').expect(404);
  });
});
