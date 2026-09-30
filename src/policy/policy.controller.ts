import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { Public } from '../common/decorators/public.decorator.js';
import { PublicThrottlerGuard } from '../common/guards/public-throttler.guard.js';
import { SUIT_CSS } from '../share/link-page.js';
import { renderPolicyPage } from './policy.html.js';
import { PolicyService } from './policy.service.js';
import type { PolicyDocument } from './types.js';

/**
 * 개인정보 처리방침(`/privacy`), 이용약관(`/terms`), 아동 안전 정책(`/child-safety`). `/api` 밖의 공개 HTML이다(app.setup.ts에서 prefix 제외).
 * 앱의 설정 → 정보에서 열고, 스토어 등록 URL로도 쓴다.
 */
@Public()
@UseGuards(PublicThrottlerGuard)
@Throttle({ public: { limit: 60, ttl: 60_000 } })
@Controller()
export class PolicyController {
  constructor(
    private readonly policyService: PolicyService,
    private readonly config: ConfigService,
  ) {}

  @Get('privacy')
  privacy(@Res() res: Response): void {
    this.send(res, this.policyService.privacy(), '/privacy');
  }

  @Get('terms')
  terms(@Res() res: Response): void {
    this.send(res, this.policyService.terms(), '/terms');
  }

  /** 아동 안전 정책 (Google Play 아동 안전 표준 게시 요건) */
  @Get('child-safety')
  childSafety(@Res() res: Response): void {
    this.send(res, this.policyService.childSafety(), '/child-safety');
  }

  private send(res: Response, doc: PolicyDocument, path: string): void {
    const nonce = randomBytes(16).toString('base64');
    const suit = new URL(SUIT_CSS).origin;
    const base = this.config
      .getOrThrow<string>('PUBLIC_BASE_URL')
      .replace(/\/+$/, '');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'none'",
        "script-src 'none'",
        `style-src 'nonce-${nonce}' ${suit}`,
        `font-src ${suit}`,
        "img-src 'self' data:",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
    );
    // nonce가 요청마다 바뀌므로 공유 캐시는 쓰지 않는다
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type('html').send(renderPolicyPage(doc, nonce, `${base}${path}`));
  }
}
