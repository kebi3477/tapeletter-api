import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { AppleService } from './apple.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthIdentity } from './entities/auth-identity.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { KakaoService } from './kakao.service.js';
import { AppleSignInService } from './apple-sign-in.service.js';
import { RejoinService } from './rejoin.service.js';
import { GoogleService } from './google.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuthIdentity, RefreshToken]),
    // 탈퇴(UsersService)가 소셜 연결 해제(Kakao/AppleSignIn)를 쓰므로 서로 참조한다
    forwardRef(() => UsersModule),
    WalletModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    KakaoService,
    AppleService,
    AppleSignInService,
    RejoinService,
    GoogleService,
  ],
  exports: [AuthService, KakaoService, AppleSignInService, RejoinService],
})
export class AuthModule {}
