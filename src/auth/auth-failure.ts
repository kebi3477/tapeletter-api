import type { Logger } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import type { ErrorCode } from '../common/errors/error-codes.js';
import {
  currentRequestId,
  noteLogDetail,
} from '../common/utils/request-context.js';

/**
 * 소셜 로그인 실패를 남기고(warn + 요청 기록 detail) 응답할 예외를 만든다.
 * reason에는 내부 사유 코드·외부 응답 코드만 넣는다. 토큰·이메일·이름은 넣지 않는다.
 */
export function socialFailure(
  logger: Logger,
  provider: 'kakao' | 'apple' | 'google',
  reason: string,
  code: ErrorCode = 'SOCIAL_TOKEN_INVALID',
): AppException {
  const text = `${provider} 로그인 실패(${code}): ${reason}`;
  logger.warn(`[${currentRequestId()}] ${text}`);
  noteLogDetail(text);
  return new AppException(code);
}
