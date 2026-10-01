import { AsyncLocalStorage } from 'node:async_hooks';

/** 요청 하나의 로그 문맥. 요청 기록 미들웨어가 만들고, 서비스는 내부 사유를 덧붙인다 */
export interface RequestContext {
  requestId: string;
  details: string[];
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** 지금 요청의 ID (요청 밖이면 '-') */
export function currentRequestId(): string {
  return requestContext.getStore()?.requestId ?? '-';
}

/**
 * 요청 기록의 detail에 내부 사유를 남긴다(소셜 로그인 실패 사유, 외부 서비스 응답 코드 등).
 * 토큰·이메일·이름 같은 값은 넣지 않는다.
 */
export function noteLogDetail(text: string): void {
  requestContext.getStore()?.details.push(text.slice(0, 500));
}
