/** 소셜 토큰을 검증하고 얻은 정보 */
export interface SocialProfile {
  /** 카카오 회원번호 / Apple sub / Google sub */
  sub: string;
  email: string | null;
  /** 이름 정하기 화면에 미리 채울 이름 (없으면 null) */
  nickname: string | null;
}
