import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator.js';
import { Idempotent } from '../common/decorators/idempotent.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { PublicThrottlerGuard } from '../common/guards/public-throttler.guard.js';
import type {
  ClaimResponse,
  SharePreview,
  WebPreview,
} from './dto/share.response.js';
import { ShareService } from './share.service.js';

@Controller('share')
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  /** 앱에서 링크 열기 */
  @Get(':token')
  preview(
    @CurrentUser() user: AuthUser,
    @Param('token') token: string,
  ): Promise<SharePreview> {
    return this.shareService.preview(user.id, token);
  }

  /** 링크 테이프 받기 → 서로 친구 */
  @Post(':token/claim')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  claim(
    @CurrentUser() user: AuthUser,
    @Param('token') token: string,
  ): Promise<ClaimResponse> {
    return this.shareService.claim(user.id, token);
  }

  /**
   * 웹 페이지용 미리보기 (재생 URL은 주지 않는다).
   * 웹 재생 `POST /share/{token}/web/audio`는 2026-10-01에 없앴다(테이프는 앱에서만 듣는다)
   */
  @Public()
  @UseGuards(PublicThrottlerGuard)
  @Throttle({ public: { limit: 60, ttl: 60_000 } })
  @Get(':token/web')
  web(@Param('token') token: string): Promise<WebPreview> {
    return this.shareService.webPreview(token);
  }
}
