import { Injectable, Logger } from '@nestjs/common';
import { renderAsync } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import satori from 'satori';
import type { TapeType } from '../recordings/entities/recording.entity.js';

/**
 * 링크 공유 이미지 (카카오 피드 · og:image).
 * 디자인 원본: design_handoff_kakao_share/template/share-card.html (저장소 바깥).
 * 헤드리스 브라우저 대신 satori(HTML/CSS 부분집합 → SVG) + resvg(SVG → PNG)로 그린다.
 */
export type ShareCardFormat = 'wide' | 'og';

export const SHARE_CARD_SIZE: Record<
  ShareCardFormat,
  { width: number; height: number }
> = {
  wide: { width: 800, height: 400 },
  og: { width: 1200, height: 630 },
};

/** 보낸 사람 이름 최대 글자 수 (핸드오프 README). 넘으면 말줄임 */
export const CARD_NAME_MAX = 8;

const LEN: Record<TapeType, [string, string]> = {
  15: ['15 SEC', '#E5402B'],
  60: ['1 MIN', '#2E6BD6'],
  180: ['3 MIN', '#111111'],
};

/** 이름이 없을 때 쓰는 대체 이름 (README 제안 "누군가 목소리를 보냈어요") */
export const ANONYMOUS_NAME = '누군가';

/** 최대 8자(코드 포인트 기준), 넘으면 "…". 비어 있으면 null */
export function cardName(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const chars = Array.from(s);
  return chars.length > CARD_NAME_MAX
    ? chars.slice(0, CARD_NAME_MAX).join('') + '…'
    : s;
}

const font = (file: string) =>
  readFileSync(new URL(`./assets/fonts/${file}`, import.meta.url));

/** SUIT (OFL, assets/fonts/OFL.txt). 템플릿이 쓰는 굵기만: 600(캡션), 800(나머지) */
const FONTS = [
  {
    name: 'SUIT',
    data: font('SUIT-SemiBold.ttf'),
    weight: 600 as const,
    style: 'normal' as const,
  },
  {
    name: 'SUIT',
    data: font('SUIT-ExtraBold.ttf'),
    weight: 800 as const,
    style: 'normal' as const,
  },
];

type Style = Record<string, string | number>;
interface Node {
  type: string;
  props: { style?: Style; children?: Node | string | (Node | string)[] };
}
const div = (style: Style, children?: Node['props']['children']): Node => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children },
});

/**
 * .box (소포) — 크기는 형식마다 다르고 구조는 같다.
 * 보낸 사람 라벨 너비는 핸드오프 PNG(디자인 원본 .dc.html, content-box)에 맞춰 width + 좌우 padding이다.
 * template/share-card.html은 border-box라 라벨이 28~36px 좁게 나오는데, 승인된 PNG 쪽을 따른다.
 * og 라벨 그림자도 PNG 원본 값(0 6px 12px .2)을 쓴다.
 */
function parcel(
  name: string,
  s: {
    w: number;
    h: number;
    r: number;
    rot: number;
    shadow: string;
    marginTop: number;
    tv: [number, number];
    th: [number, number];
    label: {
      inset: number;
      w: number;
      r: number;
      pad: string;
      gap: number;
      small: number;
      b: number;
      shadow: string;
    };
  },
): Node {
  const l = s.label;
  return div(
    {
      position: 'relative',
      width: s.w,
      height: s.h,
      flexShrink: 0,
      borderRadius: s.r,
      backgroundImage: 'linear-gradient(135deg, #D3AA6E, #BC8E56)',
      boxShadow: s.shadow,
      transform: `rotate(${s.rot}deg)`,
      marginTop: s.marginTop,
    },
    [
      div({
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: s.tv[0],
        width: s.tv[1],
        backgroundColor: '#EEE3CC',
      }),
      div({
        position: 'absolute',
        left: 0,
        right: 0,
        top: s.th[0],
        height: s.th[1],
        backgroundColor: '#EEE3CC',
      }),
      div(
        {
          position: 'absolute',
          right: l.inset,
          bottom: l.inset,
          width: l.w,
          flexDirection: 'column',
          gap: l.gap,
          padding: l.pad,
          borderRadius: l.r,
          backgroundColor: '#fff',
          boxShadow: l.shadow,
          transform: 'rotate(-3deg)',
        },
        [
          div({ fontSize: l.small, fontWeight: 600, color: '#8A8A87' }, [
            '보낸 사람',
          ]),
          div(
            {
              fontSize: l.b,
              fontWeight: 800,
              color: '#111',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
            name,
          ),
        ],
      ),
    ],
  );
}

/** format=wide (800×400): 워드마크 + 길이 라벨 + 소포 */
function wideCard(name: string | null, len: TapeType): Node {
  const [lenText, lenColor] = LEN[len] ?? LEN[60];
  return div(
    {
      position: 'relative',
      width: 800,
      height: 400,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F6F6F4',
      fontFamily: 'SUIT',
    },
    [
      div(
        {
          position: 'absolute',
          left: 36,
          top: 30,
          fontSize: 22,
          fontWeight: 800,
          color: '#E5402B',
          letterSpacing: 22 * 0.02,
        },
        'tapeletter',
      ),
      div(
        {
          position: 'absolute',
          right: 36,
          top: 28,
          fontSize: 16,
          fontWeight: 800,
          color: '#fff',
          letterSpacing: 16 * 0.04,
          borderRadius: 8,
          padding: '7px 12px',
          backgroundColor: lenColor,
        },
        lenText,
      ),
      parcel(name ?? ANONYMOUS_NAME, {
        w: 340,
        h: 240,
        r: 14,
        rot: -2,
        shadow:
          '0 30px 40px -24px rgba(80,50,10,0.45), inset 0 0 0 2px rgba(120,80,30,0.18)',
        marginTop: 12,
        tv: [156, 28],
        th: [108, 18],
        label: {
          inset: 18,
          // 128 + 좌우 padding (아래 주석)
          w: 156,
          r: 6,
          pad: '12px 14px',
          gap: 2,
          small: 11,
          b: 22,
          shadow: '0 4px 10px rgba(0,0,0,0.14)',
        },
      }),
    ],
  );
}

/** format=og (1200×630): 헤드라인에 이름, 길이 라벨 없음 */
function ogCard(name: string | null): Node {
  const h1 = {
    fontSize: 64,
    fontWeight: 800,
    lineHeight: 1.22,
    letterSpacing: 64 * -0.05,
    color: '#fff',
  };
  return div(
    {
      position: 'relative',
      width: 1200,
      height: 630,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 90px',
      backgroundColor: '#111',
      fontFamily: 'SUIT',
    },
    [
      div({ flexDirection: 'column', gap: 26 }, [
        div(
          {
            fontSize: 30,
            fontWeight: 800,
            color: '#E5402B',
            letterSpacing: 30 * 0.02,
          },
          'tapeletter',
        ),
        div({ flexDirection: 'column' }, [
          div(h1, name ? `${name}님이` : ANONYMOUS_NAME),
          // satori는 음수 letter-spacing에서 일반 공백을 넓게 잡는다. NBSP면 브라우저와 같은 폭이 된다
          div(h1, '목소리를\u00a0보냈어요'),
        ]),
        div({ fontSize: 28, fontWeight: 600, color: '#A8A8A5' }, [
          '탭해서 소포를 뜯어보세요',
        ]),
      ]),
      parcel(name ?? ANONYMOUS_NAME, {
        w: 420,
        h: 300,
        r: 18,
        rot: -3,
        shadow: '0 40px 60px -30px rgba(0,0,0,0.7)',
        marginTop: 0,
        tv: [192, 36],
        th: [134, 22],
        label: {
          inset: 22,
          w: 186,
          r: 8,
          pad: '14px 18px',
          gap: 2,
          small: 14,
          b: 28,
          shadow: '0 6px 12px rgba(0,0,0,0.2)',
        },
      }),
    ],
  );
}

/** 그린 PNG를 내용(형식·이름·길이) 기준으로 담아 두는 LRU. 이름·길이는 보낸 뒤 바뀌지 않는다 */
export const CARD_CACHE_MAX = 500;

@Injectable()
export class ShareCardService {
  private readonly logger = new Logger(ShareCardService.name);
  /** Map은 넣은 순서를 지키므로 맨 앞이 가장 오래 안 쓴 항목 */
  private readonly cache = new Map<string, Buffer>();
  /** 같은 이미지를 동시에 여러 번 그리지 않게 */
  private readonly pending = new Map<string, Promise<Buffer>>();

  /** @param name cardName()으로 자른 이름, 없으면 null(대체 문구) */
  async render(
    format: ShareCardFormat,
    name: string | null,
    len: TapeType,
  ): Promise<Buffer> {
    const key = `${format}\u0000${format === 'og' ? '' : len}\u0000${name ?? ''}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const inflight = this.pending.get(key);
    if (inflight) return inflight;

    const job = this.draw(format, name, len)
      .then((png) => {
        this.cache.set(key, png);
        if (this.cache.size > CARD_CACHE_MAX) {
          this.cache.delete(this.cache.keys().next().value!);
        }
        return png;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, job);
    return job;
  }

  private async draw(
    format: ShareCardFormat,
    name: string | null,
    len: TapeType,
  ): Promise<Buffer> {
    const started = performance.now();
    const { width, height } = SHARE_CARD_SIZE[format];
    const tree = format === 'og' ? ogCard(name) : wideCard(name, len);
    // satori 타입은 ReactNode를 받지만 { type, props } 객체면 된다
    const svg = await satori(tree as never, { width, height, fonts: FONTS });
    const laidOut = performance.now();
    // resvg 렌더는 libuv 스레드풀에서 돈다 (이벤트 루프를 막지 않음)
    // 글자는 satori가 이미 path로 바꿨으므로 시스템 폰트를 읽지 않는다
    const png = (
      await renderAsync(svg, {
        fitTo: { mode: 'original' },
        font: { loadSystemFonts: false },
      })
    ).asPng();
    this.logger.debug(
      `${format} ${width}x${height}: layout ${Math.round(laidOut - started)}ms, raster ${Math.round(performance.now() - laidOut)}ms, ${png.length}B`,
    );
    return png;
  }
}
