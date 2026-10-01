import { IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleLoginDto {
  /** Google 로그인이 준 ID 토큰 (JWT, aud = 웹 클라이언트 ID) */
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  idToken: string;
}
