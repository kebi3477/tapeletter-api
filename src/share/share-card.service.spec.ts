import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cardName, ShareCardService } from './share-card.service.js';

/** PNG IHDR의 가로·세로 */
export const pngSize = (b: Buffer) => ({
  width: b.readUInt32BE(16),
  height: b.readUInt32BE(20),
});

describe('ShareCardService', () => {
  const svc = new ShareCardService();
  /** SHARE_CARD_OUT=<폴더>로 돌리면 결과 PNG를 저장한다 (디자인 비교용) */
  const out = process.env.SHARE_CARD_OUT;
  const save = (file: string, png: Buffer) => {
    if (!out) return;
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, file), png);
  };

  it('cardName: 8자까지, 넘으면 말줄임, 비면 null', () => {
    expect(cardName('지현')).toBe('지현');
    expect(cardName('가나다라마바사아')).toBe('가나다라마바사아');
    expect(cardName('가나다라마바사아자')).toBe('가나다라마바사아…');
    expect(cardName('  ')).toBeNull();
    expect(cardName(null)).toBeNull();
  });

  it('wide 800×400 · og 1200×630 PNG', async () => {
    const cases = [
      ['wide', '지현', 60, 'wide-지현-60.png'],
      ['og', '지현', 60, 'og-지현.png'],
      ['wide', cardName('가나다라마바사아자차'), 180, 'wide-long-180.png'],
      ['og', cardName('가나다라마바사아자차'), 180, 'og-long.png'],
      ['wide', null, 15, 'wide-anon-15.png'],
      ['og', null, 15, 'og-anon.png'],
    ] as const;
    for (const [format, name, len, file] of cases) {
      const t = performance.now();
      const png = await svc.render(format, name, len);
      const ms = performance.now() - t;
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(pngSize(png)).toEqual(
        format === 'og'
          ? { width: 1200, height: 630 }
          : { width: 800, height: 400 },
      );
      if (out) console.log(`${file}: ${ms.toFixed(0)}ms ${png.length}B`);
      save(file, png);
    }
  });

  it('같은 내용은 캐시에서 같은 버퍼를 준다', async () => {
    const [a, b] = await Promise.all([
      svc.render('wide', '캐시', 60),
      svc.render('wide', '캐시', 60),
    ]);
    expect(a).toBe(b);
    expect(await svc.render('wide', '캐시', 60)).toBe(a);
  });
});
