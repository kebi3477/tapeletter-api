import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/app.exception.js';
import { GoogleService } from './google.service.js';

describe('GoogleService', () => {
  it('GOOGLE_CLIENT_IDS가 없으면 503 SOCIAL_PROVIDER_UNAVAILABLE', async () => {
    const svc = new GoogleService(new ConfigService({}));
    vi.spyOn(svc['logger'], 'error').mockImplementation(() => undefined);
    const err = await svc.verify('x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).code).toBe('SOCIAL_PROVIDER_UNAVAILABLE');
    expect((err as AppException).getStatus()).toBe(503);
  });

  it('Google 인증서를 받지 못하면 503', async () => {
    const svc = new GoogleService(
      new ConfigService({ GOOGLE_CLIENT_IDS: 'web' }),
    );
    vi.spyOn(svc['logger'], 'error').mockImplementation(() => undefined);
    svc.certs = () => Promise.reject(new Error('network'));
    const err = await svc.verify('x').catch((e: unknown) => e);
    expect((err as AppException).code).toBe('SOCIAL_PROVIDER_UNAVAILABLE');
  });
});
