import { IsDefined, IsString, MaxLength, ValidateIf } from 'class-validator';

export class SetMemoDto {
  /**
   * 나에게만 보이는 테이프 메모 (최대 40자, 한글·이모지도 한 글자).
   * 빈 문자열이나 null이면 메모를 지운다. 규칙을 어기면 INVALID_MEMO
   */
  @IsDefined()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(400)
  memo: string | null;
}
