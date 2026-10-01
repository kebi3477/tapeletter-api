import {
  daysLeft,
  escapeHtml,
  formatClock,
  formatMonthDay,
  linkErrorKind,
  PageContext,
  renderErrorPage,
  renderTapePage,
  safeJson,
} from './link-page.js';

const ctx: PageContext = {
  nonce: 'bm9uY2U=',
  links: {
    appStore: 'https://apps.apple.com/app/id1',
    googlePlay: 'https://play.google.com/x',
  },
  pageUrl: 'https://tapeletter.test/t/tok',
  ogImageUrl: 'https://tapeletter.test/static/og-image.png',
  appUrl: 'tapeletter://t/tok',
  androidIntentUrl: null,
};

const preview = {
  senderName: '<b>&\'"',
  tapeType: 60 as const,
  durationMs: 34000,
  tag: null,
  sentAt: '2026-09-25T03:00:00Z',
  expiresAt: new Date(Date.now() + 7 * 86_400_000 - 60_000).toISOString(),
};

describe('링크 웹 페이지 (webOn · leOn)', () => {
  it('테이프 종류(초)별 이름: 15초 · 1분 · 3분', () => {
    for (const [tapeType, name] of [
      [15, '15초'],
      [60, '1분'],
      [180, '3분'],
    ] as const) {
      const html = renderTapePage('tok', { ...preview, tapeType }, ctx);
      expect(html).toContain(`${name} 테이프 · 09.25`);
    }
  });

  it('이름은 본문·OG·JSON 어디서든 이스케이프한다', () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;',
    );
    const html = renderTapePage('tok', preview, ctx);
    expect(html).not.toContain('<b>&');
    expect(html).toContain(
      '&lt;b&gt;&amp;&#39;&quot;님이<br>테이프를 보냈어요',
    );
    expect(html).toContain(
      '<meta property="og:title" content="&lt;b&gt;&amp;&#39;&quot;님이 테이프를 보냈어요">',
    );
    expect(safeJson({ n: '</script><b>&' })).toBe(
      '{"n":"\\u003c/script\\u003e\\u003cb\\u003e\\u0026"}',
    );
  });

  it('구성: 제목, 1분 테이프 · MM.DD, 소포·보낸 사람, 앱에서 듣기 안내, 앱에서 열기, 링크 기간 (웹 재생 없음)', () => {
    const html = renderTapePage('tok', { ...preview, senderName: '민경' }, ctx);
    expect(html).toContain('민경님이<br>테이프를 보냈어요');
    expect(html).toContain('1분 테이프 · 09.25');
    expect(html).toContain(
      '<div class="k">보낸 사람</div><div class="n">민경</div>',
    );
    expect(html).toContain('tapeletter 앱에서 들을 수 있어요');
    expect(html).toContain('>앱에서 열기</button>');
    expect(html).toContain('앱이 없다면 설치해 주세요');
    expect(html).toContain(
      '앱에서 소포를 뜯으면 민경님과 친구가 되고,<br>이 테이프는 서랍에 담겨요.',
    );
    expect(html).toContain('이 링크는 7일 동안 열 수 있어요');
    expect(html).not.toMatch(
      /탭해서 뜯기|class="tape |<audio|new Audio|web\/audio/,
    );
    // 스토어 주소가 있으면 배지에 링크를 건다
    expect(html).toContain(
      '<a class="store" id="appStore" data-store="appStore" href="https://apps.apple.com/app/id1">',
    );
    const noLinks = renderTapePage('tok', preview, {
      ...ctx,
      links: { appStore: null, googlePlay: null },
    });
    expect(noLinks).toContain(
      '<a class="store" id="googlePlay" data-store="googlePlay"><span',
    );
    expect(html).toContain(`<script nonce="${ctx.nonce}">`);
    expect(html).toContain(`<style nonce="${ctx.nonce}">`);
    expect(html).not.toMatch(/ style="/);
  });

  it('남은 기간은 expiresAt으로 계산한다 (올림, 최소 1일)', () => {
    const now = Date.parse('2026-09-25T00:00:00Z');
    expect(daysLeft('2026-10-02T00:00:00Z', now)).toBe(7);
    expect(daysLeft('2026-09-27T01:00:00Z', now)).toBe(3);
    expect(daysLeft('2026-09-25T00:10:00Z', now)).toBe(1);
    expect(daysLeft('2026-09-24T00:00:00Z', now)).toBe(1);
  });

  it('시각 표기', () => {
    expect(formatMonthDay('2026-09-24T16:00:00Z')).toBe('09.25');
    expect(formatClock(34_000)).toBe('0:34');
    expect(formatClock(185_900)).toBe('3:05');
  });

  it('오류 페이지 (leOn): taken · expired · own · not_found', () => {
    expect(linkErrorKind('LINK_TAKEN')).toBe('taken');
    expect(linkErrorKind('LINK_EXPIRED')).toBe('expired');
    expect(linkErrorKind('LINK_OWN')).toBe('own');
    expect(linkErrorKind('LINK_NOT_FOUND')).toBe('not_found');

    const taken = renderErrorPage('taken', ctx);
    expect(taken).toContain('이미 다른 분이 받은 테이프예요');
    expect(taken).toContain(
      '테이프는 한 사람만 받을 수 있어요.\n보낸 분께 다시 보내 달라고 해보세요.',
    );
    expect(taken).toContain(
      '<div class="k">받는 사람</div><div class="n">이미 받음</div>',
    );
    expect(taken).toContain('le-art dim');
    expect(taken).toContain('>확인</button>');

    const expired = renderErrorPage('expired', ctx);
    expect(expired).toContain('링크가 만료됐어요');
    expect(expired).toContain(
      '<div class="k">보관 기한</div><div class="n">지남</div>',
    );

    const own = renderErrorPage('own', ctx, '민경');
    expect(own).toContain('내가 보낸 테이프예요');
    expect(own).toContain(
      '<div class="k">보낸 사람</div><div class="n">민경</div>',
    );
    expect(own).toContain('링크 다시 공유하기');
    expect(own).toContain('>닫기</button>');
    expect(own).not.toContain('le-art dim');

    expect(renderErrorPage('not_found', ctx)).toContain(
      '테이프를 찾을 수 없어요',
    );
  });
});
