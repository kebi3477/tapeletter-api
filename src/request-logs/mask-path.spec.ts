import { maskPath } from './mask-path.js';

describe('maskPath', () => {
  it('쿼리스트링을 버리고 토큰은 앞 4자, UUID는 앞 8자만', () => {
    expect(maskPath('/t/AbCdEfGhIjKlMnOpQrSt?x=1')).toBe('/t/AbCd…');
    expect(maskPath('/api/share/AbCdEfGhIjKlMnOpQrSt/web/audio')).toBe(
      '/api/share/AbCd…/web/audio',
    );
    expect(
      maskPath('/api/deliveries/d3d62aa5-39ec-41ac-b771-f642d4ac4b87/open'),
    ).toBe('/api/deliveries/d3d62aa5…/open');
    expect(maskPath('/api/dev-storage/rec/x.m4a?op=get&exp=1&sig=abcdef')).toBe(
      '/api/dev-storage/rec/x.m4a',
    );
    expect(maskPath('/api/auth/google')).toBe('/api/auth/google');
  });
});
