const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 링크 토큰·푸시 토큰처럼 긴 값 */
const LONG_TOKEN = /^[A-Za-z0-9_\-:.%]{16,}$/;

/**
 * 로그에 남길 경로. 쿼리스트링(서명값 등)은 버리고, 경로 조각 중
 * UUID는 앞 8자, 16자 이상 토큰은 앞 4자만 남긴다. 300자로 자른다.
 */
export function maskPath(url: string): string {
  const path = url.split('?')[0].split('#')[0];
  return path
    .split('/')
    .map((seg) => {
      if (UUID.test(seg)) return `${seg.slice(0, 8)}…`;
      if (LONG_TOKEN.test(seg)) return `${seg.slice(0, 4)}…`;
      return seg;
    })
    .join('/')
    .slice(0, 300);
}
