import { NAME_MAX_LENGTH } from '../../users/entities/user.entity.js';
import { AppException } from '../errors/app.exception.js';

/** 이름 규칙: 앞뒤 공백 제거 후 1~8자(코드 포인트 기준), 제어 문자 금지 */
export function normalizeName(raw: string): string {
  const name = normalizeDisplayText(raw, NAME_MAX_LENGTH);
  if (name === null) throw new AppException('INVALID_NAME');
  return name;
}

/** 친구 별명 최대 글자 수 */
export const NICKNAME_MAX_LENGTH = 10;

/**
 * 친구 별명 규칙: 이름과 같은 규칙(앞뒤 공백 제거, 코드 포인트 기준 글자 수, 제어 문자 금지)으로 최대 10자.
 * 비우거나 null이면 별명을 지운다(null을 돌려준다).
 */
export function normalizeNickname(raw: string | null): string | null {
  if (raw === null || raw.normalize('NFC').trim() === '') return null;
  const nickname = normalizeDisplayText(raw, NICKNAME_MAX_LENGTH);
  if (nickname === null) throw new AppException('INVALID_NICKNAME');
  return nickname;
}

/** 테이프 메모 최대 글자 수 */
export const MEMO_MAX_LENGTH = 40;

/**
 * 테이프 메모 규칙: 이름과 같은 규칙(앞뒤 공백 제거, 코드 포인트 기준 글자 수, 제어 문자·줄바꿈 금지)으로 최대 40자.
 * 비우거나 null이면 메모를 지운다(null을 돌려준다).
 */
export function normalizeMemo(raw: string | null): string | null {
  if (raw === null || raw.normalize('NFC').trim() === '') return null;
  const memo = normalizeDisplayText(raw, MEMO_MAX_LENGTH);
  if (memo === null) throw new AppException('INVALID_MEMO');
  return memo;
}

/** 보여 주는 이름 공통 규칙. 1~max자(한글·이모지도 한 글자), 제어 문자 금지. 어기면 null */
function normalizeDisplayText(raw: string, max: number): string | null {
  const text = raw.normalize('NFC').trim();
  const length = [...text].length;
  const hasControlChar = [...text].some((ch) => {
    const code = ch.codePointAt(0)!;
    return code < 0x20 || code === 0x7f;
  });
  if (length < 1 || length > max || hasControlChar) return null;
  return text;
}
