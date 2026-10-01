import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../common/utils/request-context.js';
import { maskPath } from './mask-path.js';
import { RequestLogsService } from './request-logs.service.js';

/** 남기지 않는 경로 (docker 헬스체크가 30초마다 부른다) */
const SKIP = new Set(['/api/health']);
const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;
const SAFE = /[^A-Za-z0-9._+\-/ ()]/g;

const header = (req: Request, name: string, max: number): string | null => {
  const v = req.headers[name];
  const s = (Array.isArray(v) ? v[0] : v)?.replace(SAFE, '').trim();
  return s ? s.slice(0, max) : null;
};

/**
 * 요청 기록 미들웨어 (app.setup.ts에서 모든 라우트 앞에 붙인다).
 * 요청 ID를 만들어 응답 헤더 X-Request-Id로 돌려주고, 응답이 끝나면 한 줄을 남긴다.
 * 본문·Authorization·쿼리스트링은 남기지 않는다.
 */
export function requestLogMiddleware(logs: RequestLogsService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.originalUrl.split('?')[0];
    if (SKIP.has(path)) return next();

    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && REQUEST_ID.test(incoming)
        ? incoming
        : randomUUID();
    res.setHeader('X-Request-Id', requestId);
    const ctx = { requestId, details: [] as string[] };
    const createdAt = new Date();
    const started = process.hrtime.bigint();

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const status = res.writableFinished ? res.statusCode : 499;
      const locals = res.locals as { errorCode?: string; errorStack?: string };
      const details = [...ctx.details];
      if (locals.errorStack) details.push(locals.errorStack);
      const cf = req.headers['cf-connecting-ip'];
      logs.record({
        createdAt,
        requestId,
        method: req.method.slice(0, 8),
        path: maskPath(req.originalUrl),
        status,
        durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
        userId: (req as Request & { user?: { id: string } }).user?.id ?? null,
        ip:
          ((typeof cf === 'string' ? cf : undefined) ?? req.ip ?? null)?.slice(
            0,
            64,
          ) ?? null,
        appVersion: header(req, 'x-app-version', 32),
        platform: header(req, 'x-app-platform', 16),
        userAgent: header(req, 'user-agent', 200),
        errorCode: locals.errorCode?.slice(0, 64) ?? null,
        detail: details.length ? details.join('\n').slice(0, 4000) : null,
      });
    };
    res.on('finish', finish);
    res.on('close', finish);
    requestContext.run(ctx, () => next());
  };
}
