import {
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AppException } from '../errors/app.exception.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

function run(exception: unknown) {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    locals: {} as Record<string, string>,
  };
  res.status.mockReturnValue(res);
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return {
    status: res.status.mock.calls[0][0],
    body: res.json.mock.calls[0][0],
    locals: res.locals,
  };
}

describe('HttpExceptionFilter', () => {
  it('AppException은 code·message·추가 값을 그대로 보낸다', () => {
    const { locals, ...out } = run(
      new AppException('INSUFFICIENT_CREDITS', { need: 20 }),
    );
    // 요청 기록에 쓸 오류 코드
    expect(locals).toEqual({ errorCode: 'INSUFFICIENT_CREDITS' });
    expect(out).toEqual({
      status: 402,
      body: {
        code: 'INSUFFICIENT_CREDITS',
        message: '크레딧이 부족해요',
        need: 20,
      },
    });
  });

  it('Nest 기본 예외는 상태 코드로 code를 정한다', () => {
    expect(run(new NotFoundException()).body).toEqual({
      code: 'NOT_FOUND',
      message: '찾을 수 없어요',
    });
    expect(run(new BadRequestException('x')).body.code).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('알 수 없는 오류는 500 INTERNAL_ERROR (내부 메시지는 숨긴다)', () => {
    const { status, body, locals } = run(new Error('db password is ...'));
    expect(status).toBe(500);
    // 5xx는 스택을 요청 기록에 남긴다 (응답에는 숨긴다)
    expect(locals.errorCode).toBe('INTERNAL_ERROR');
    expect(locals.errorStack).toContain('Error: db password is ...');
    expect(body).toEqual({
      code: 'INTERNAL_ERROR',
      message: '잠시 문제가 생겼어요. 다시 시도해 주세요',
    });
  });
});
