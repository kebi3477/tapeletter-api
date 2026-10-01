import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrorBody } from '../errors/app.exception.js';
import { currentRequestId } from '../utils/request-context.js';
import { ErrorCodes } from '../errors/error-codes.js';

const STATUS_TO_CODE: Partial<Record<number, keyof typeof ErrorCodes>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/** 모든 오류를 `{ code, message }` 형식으로 바꾼다. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toBody(exception);
    // 요청 기록(request_logs)에 오류 코드와 5xx 스택을 남긴다
    const locals = res.locals as { errorCode?: string; errorStack?: string };
    locals.errorCode = body.code;
    if (status >= 500) {
      const stack =
        exception instanceof Error
          ? (exception.stack ?? String(exception))
          : String(exception);
      locals.errorStack = stack;
      this.logger.error(`[${currentRequestId()}] ${stack}`);
    }
    res.status(status).json(body);
  }

  private toBody(exception: unknown): { status: number; body: ErrorBody } {
    if (!(exception instanceof HttpException)) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: {
          code: 'INTERNAL_ERROR',
          message: ErrorCodes.INTERNAL_ERROR.message,
        },
      };
    }
    const status = exception.getStatus();
    const raw = exception.getResponse();
    if (
      typeof raw === 'object' &&
      raw !== null &&
      'code' in raw &&
      'message' in raw &&
      typeof raw.message === 'string'
    ) {
      return { status, body: raw as ErrorBody };
    }
    const code =
      STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : undefined);
    if (code) {
      return { status, body: { code, message: ErrorCodes[code].message } };
    }
    return {
      status,
      body: { code: `HTTP_${status}`, message: exception.message },
    };
  }
}
