import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator.js';
import { PublicThrottlerGuard } from '../common/guards/public-throttler.guard.js';
import { DevOnlyGuard } from '../common/guards/dev-only.guard.js';
import { AuthService } from './auth.service.js';
import { AppleLoginDto } from './dto/apple-login.dto.js';
import type { AuthResponse, TokenPair } from './dto/auth.response.js';
import { DevLoginDto } from './dto/dev-login.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';
import { KakaoLoginDto } from './dto/kakao-login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';

/** 로그인·갱신은 IP당 1분에 20번까지 */
@Public()
@UseGuards(PublicThrottlerGuard)
@Throttle({ public: { limit: 20, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('kakao')
  @HttpCode(HttpStatus.OK)
  kakao(@Body() dto: KakaoLoginDto): Promise<AuthResponse> {
    return this.authService.loginWithKakao(dto.accessToken);
  }

  @Post('apple')
  @HttpCode(HttpStatus.OK)
  apple(@Body() dto: AppleLoginDto): Promise<AuthResponse> {
    return this.authService.loginWithApple(
      dto.identityToken,
      dto.nonce,
      dto.authorizationCode,
    );
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  google(@Body() dto: GoogleLoginDto): Promise<AuthResponse> {
    return this.authService.loginWithGoogle(dto.idToken);
  }

  /** 개발 전용 로그인. NODE_ENV=production이면 404 */
  @Post('dev')
  @UseGuards(DevOnlyGuard)
  @HttpCode(HttpStatus.OK)
  dev(@Body() dto: DevLoginDto): Promise<AuthResponse> {
    return this.authService.loginDev(dto.key, dto.name);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }
}
