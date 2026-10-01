import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Public } from '../common/decorators/public.decorator.js';
import { AppException } from '../common/errors/app.exception.js';
import { PublicThrottlerGuard } from '../common/guards/public-throttler.guard.js';
import {
  linkErrorKind,
  PageContext,
  renderErrorPage,
  renderTapePage,
  shareOgMeta,
  StoreLinks,
  SUIT_CSS,
} from './link-page.js';
import { ShareCardFormat, ShareCardService } from './share-card.service.js';
import { ShareService } from './share.service.js';

/** 앱의 커스텀 URL 스킴. "앱에서 열기"가 tapeletter://t/{token}을 연다 (앱에 등록 필요) */
export const APP_SCHEME = 'tapeletter';
export const OG_IMAGE_PATH = '/static/og-image.png';

/** 핸드오프 assets/app-icon.svg를 600×600 PNG로 바꾼 대표 이미지 (빌드 때 dist로 복사된다) */
const OG_IMAGE = readFileSync(
  new URL('./assets/og-image.png', import.meta.url),
);

const origin = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/**
 * `/api` 밖의 공개 경로: 링크 웹 페이지(`/t/{token}`), 대표 이미지, 유니버설 링크·앱 링크 파일.
 * app.setup.ts에서 전역 prefix 제외로 등록한다.
 */
@Public()
@UseGuards(PublicThrottlerGuard)
@Throttle({ public: { limit: 60, ttl: 60_000 } })
@Controller()
export class LinkPageController {
  constructor(
    private readonly shareService: ShareService,
    private readonly shareCard: ShareCardService,
    private readonly config: ConfigService,
  ) {}

  @Get('t/:token')
  async page(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const nonce = randomBytes(16).toString('base64');
    const ctx = this.context(token, nonce);
    res.setHeader('Content-Security-Policy', this.csp(nonce));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const { preview, card } = await this.shareService.webPage(token);
      const og = shareOgMeta(card.name, `${ctx.pageUrl}/og.png`);
      res.type('html').send(renderTapePage(token, preview, ctx, og));
    } catch (e) {
      if (!(e instanceof AppException)) throw e;
      res
        .status(e.getStatus())
        .type('html')
        .send(renderErrorPage(linkErrorKind(e.code), ctx));
    }
  }

  /** 카카오 피드 공유 이미지 800×400 (보낸 사람 이름 + 길이 라벨) */
  @Get('t/:token/kakao.png')
  kakaoCard(@Param('token') token: string, @Res() res: Response) {
    return this.sendCard(token, 'wide', res);
  }

  /** 링크 미리보기(og:image) 1200×630 (헤드라인에 이름, 길이 라벨 없음) */
  @Get('t/:token/og.png')
  ogCard(@Param('token') token: string, @Res() res: Response) {
    return this.sendCard(token, 'og', res);
  }

  /**
   * 받았거나 만료된 링크도 그린다(이름·길이는 보낸 뒤 바뀌지 않는다). 없는 토큰은 404 LINK_NOT_FOUND.
   * 내용이 바뀌지 않으므로 immutable로 1년 캐시한다
   */
  private async sendCard(
    token: string,
    format: ShareCardFormat,
    res: Response,
  ): Promise<void> {
    const card = await this.shareService.card(token);
    const png = await this.shareCard.render(format, card.name, card.tapeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type('png').send(png);
  }

  /** 카카오톡·문자 미리보기용 대표 이미지 (옛 앱 빌드와 없는 링크 페이지가 쓴다) */
  @Get('static/og-image.png')
  ogImage(@Res() res: Response): void {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type('png').send(OG_IMAGE);
  }

  /** iOS 유니버설 링크 */
  @Get('.well-known/apple-app-site-association')
  appleAppSiteAssociation(@Res() res: Response): void {
    const appId = this.config.get<string>('APPLE_APP_ID');
    if (!appId) throw new AppException('NOT_FOUND');
    res.type('application/json').send({
      applinks: {
        details: [{ appIDs: [appId], components: [{ '/': '/t/*' }] }],
      },
    });
  }

  /** Android 앱 링크 */
  @Get('.well-known/assetlinks.json')
  assetLinks(@Res() res: Response): void {
    const pkg = this.config.get<string>('ANDROID_PACKAGE_NAME');
    const prints = (
      this.config.get<string>('ANDROID_SHA256_FINGERPRINTS') ?? ''
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!pkg || prints.length === 0) throw new AppException('NOT_FOUND');
    res.type('application/json').send([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: pkg,
          sha256_cert_fingerprints: prints,
        },
      },
    ]);
  }

  private context(token: string, nonce: string): PageContext {
    const base = this.config
      .getOrThrow<string>('PUBLIC_BASE_URL')
      .replace(/\/+$/, '');
    // 출시 전에는 스토어 배지를 링크 없이 둔다 (STORE_LINKS_ENABLED=true로 켠다)
    const enabled = this.config.get<boolean>('STORE_LINKS_ENABLED') === true;
    const links: StoreLinks = {
      appStore: enabled
        ? this.config.getOrThrow<string>('APP_STORE_URL_IOS')
        : null,
      googlePlay: enabled
        ? this.config.getOrThrow<string>('APP_STORE_URL_ANDROID')
        : null,
    };
    const fallback = links.googlePlay
      ? `S.browser_fallback_url=${encodeURIComponent(links.googlePlay)};`
      : '';
    const pkg = this.config.get<string>('ANDROID_PACKAGE_NAME');
    const safeToken = encodeURIComponent(token);
    return {
      nonce,
      links,
      pageUrl: `${base}/t/${safeToken}`,
      ogImageUrl: `${base}${OG_IMAGE_PATH}`,
      appUrl: `${APP_SCHEME}://t/${safeToken}`,
      androidIntentUrl: pkg
        ? `intent://t/${safeToken}#Intent;scheme=${APP_SCHEME};package=${pkg};${fallback}end`
        : null,
    };
  }

  /**
   * 인라인 스크립트·스타일은 요청마다 만든 nonce로만 실행된다.
   * 웹 재생을 뺐으므로 오디오(media-src)·API 호출(connect-src)은 허용하지 않는다(default-src 'none')
   */
  private csp(nonce: string): string {
    const suit = new URL(SUIT_CSS).origin;
    const self = origin(this.config.get<string>('PUBLIC_BASE_URL'));
    return [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}' ${suit}`,
      `font-src ${suit}`,
      `img-src 'self' ${self ?? ''} data:`.trim(),
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; ');
  }
}
