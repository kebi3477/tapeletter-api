import { normalizeMemo, normalizeNickname } from './display-text.js';

describe('normalizeNickname', () => {
  it('앞뒤 공백을 빼고 10자까지 (한글·이모지도 한 글자)', () => {
    expect(normalizeNickname('  동민이 ')).toBe('동민이');
    expect(normalizeNickname('가나다라마바사아자차')).toBe(
      '가나다라마바사아자차',
    );
    expect(normalizeNickname('🎵🎵🎵🎵🎵🎵🎵🎵🎵🎵')).toHaveLength(20);
  });

  it('빈 값·null이면 지운다(null)', () => {
    expect(normalizeNickname('')).toBeNull();
    expect(normalizeNickname('   ')).toBeNull();
    expect(normalizeNickname(null)).toBeNull();
  });

  it('10자 초과·제어 문자는 INVALID_NICKNAME', () => {
    expect(() => normalizeNickname('가나다라마바사아자차카')).toThrow(
      expect.objectContaining({ code: 'INVALID_NICKNAME' }),
    );
    expect(() => normalizeNickname('줄\n바꿈')).toThrow(
      expect.objectContaining({ code: 'INVALID_NICKNAME' }),
    );
  });
});

describe('normalizeMemo', () => {
  it('앞뒤 공백을 빼고 40자까지 (한글·이모지도 한 글자)', () => {
    expect(normalizeMemo('  생일 아침에 받은 노래 ')).toBe(
      '생일 아침에 받은 노래',
    );
    expect(normalizeMemo('가'.repeat(40))).toBe('가'.repeat(40));
    expect(normalizeMemo('🎵'.repeat(40))).toHaveLength(80);
  });

  it('빈 값·공백만·null이면 지운다(null)', () => {
    expect(normalizeMemo('')).toBeNull();
    expect(normalizeMemo('   ')).toBeNull();
    expect(normalizeMemo(null)).toBeNull();
  });

  it('40자 초과·줄바꿈은 INVALID_MEMO', () => {
    expect(() => normalizeMemo('가'.repeat(41))).toThrow(
      expect.objectContaining({ code: 'INVALID_MEMO' }),
    );
    expect(() => normalizeMemo('줄\n바꿈')).toThrow(
      expect.objectContaining({ code: 'INVALID_MEMO' }),
    );
  });
});
