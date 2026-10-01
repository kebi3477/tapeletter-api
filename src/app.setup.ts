import { type INestApplication, RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { requestLogMiddleware } from './request-logs/request-log.middleware.js';
import { RequestLogsService } from './request-logs/request-logs.service.js';

export const API_PREFIX = 'api';

/** main.ts와 e2e 테스트가 함께 쓰는 앱 설정. 전역 가드·파이프·필터는 CommonModule에 있다 */
export function setupApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(API_PREFIX, {
    // 링크 웹 페이지와 유니버설 링크·앱 링크 파일은 /api 밖에 둔다
    exclude: [
      { path: 't/:token', method: RequestMethod.GET },
      { path: 't/:token/kakao.png', method: RequestMethod.GET },
      { path: 't/:token/og.png', method: RequestMethod.GET },
      { path: 'static/og-image.png', method: RequestMethod.GET },
      { path: 'privacy', method: RequestMethod.GET },
      { path: 'terms', method: RequestMethod.GET },
      { path: 'child-safety', method: RequestMethod.GET },
      {
        path: '.well-known/apple-app-site-association',
        method: RequestMethod.GET,
      },
      { path: '.well-known/assetlinks.json', method: RequestMethod.GET },
    ],
  });
  // Cloudflare Tunnel·edge Caddy 뒤에서 실제 클라이언트 IP를 쓰기 위해 (X-Forwarded-For의 마지막 값)
  (app as NestExpressApplication).set('trust proxy', 1);
  // 요청 기록 (X-Request-Id, request_logs). 모든 라우트보다 먼저
  app.use(requestLogMiddleware(app.get(RequestLogsService)));
  app.enableShutdownHooks();
  return app;
}
