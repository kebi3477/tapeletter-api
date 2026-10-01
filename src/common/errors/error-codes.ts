import { HttpStatus } from '@nestjs/common';

/**
 * 오류 코드 목록. `docs/api.md`의 "오류 코드" 표와 같게 유지한다.
 * message는 앱이 그대로 토스트에 띄울 수 있는 디자인 톤의 한국어다.
 */
export const ErrorCodes = {
  // 공통
  VALIDATION_FAILED: {
    status: HttpStatus.BAD_REQUEST,
    message: '입력한 내용을 다시 확인해 주세요',
  },
  UNAUTHORIZED: {
    status: HttpStatus.UNAUTHORIZED,
    message: '다시 로그인해 주세요',
  },
  FORBIDDEN: {
    status: HttpStatus.FORBIDDEN,
    message: '할 수 없는 요청이에요',
  },
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: '찾을 수 없어요' },
  RATE_LIMITED: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: '잠시 후에 다시 시도해 주세요',
  },
  INTERNAL_ERROR: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: '잠시 문제가 생겼어요. 다시 시도해 주세요',
  },

  // 멱등
  IDEMPOTENCY_KEY_REQUIRED: {
    status: HttpStatus.BAD_REQUEST,
    message: '요청을 다시 보내 주세요',
  },
  IDEMPOTENCY_KEY_REUSED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: '이미 다른 요청에 쓴 키예요',
  },
  IDEMPOTENCY_IN_PROGRESS: {
    status: HttpStatus.CONFLICT,
    message: '처리하고 있어요. 잠시만 기다려 주세요',
  },

  // auth
  SOCIAL_TOKEN_INVALID: {
    status: HttpStatus.UNAUTHORIZED,
    message: '로그인하지 못했어요. 다시 시도해 주세요',
  },
  SOCIAL_PROVIDER_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: '로그인 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요',
  },
  REJOIN_RESTRICTED: {
    status: HttpStatus.FORBIDDEN,
    message: '탈퇴 후 30일 동안은 다시 가입할 수 없어요',
  },
  INVALID_REFRESH_TOKEN: {
    status: HttpStatus.UNAUTHORIZED,
    message: '다시 로그인해 주세요',
  },

  // users
  USER_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: '찾을 수 없는 사용자예요',
  },
  INVALID_NAME: {
    status: HttpStatus.BAD_REQUEST,
    message: '이름은 1~8자로 적어주세요',
  },

  // wallet
  INSUFFICIENT_CREDITS: {
    status: HttpStatus.PAYMENT_REQUIRED,
    message: '크레딧이 부족해요',
  },

  // friends
  FRIEND_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: '친구 목록에 없는 사람이에요',
  },
  INVALID_NICKNAME: {
    status: HttpStatus.BAD_REQUEST,
    message: '별명은 10자까지 적을 수 있어요',
  },
  CANNOT_BLOCK_SELF: {
    status: HttpStatus.BAD_REQUEST,
    message: '나는 차단할 수 없어요',
  },
  BLOCK_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: '차단한 친구가 아니에요',
  },
  // recordings
  RECORDING_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: '녹음을 찾을 수 없어요',
  },
  RECORDING_NOT_READY: {
    status: HttpStatus.CONFLICT,
    message: '테이프 소리로 바꾸는 중이에요',
  },
  RECORDING_TOO_LONG: {
    status: HttpStatus.BAD_REQUEST,
    message: '테이프 길이를 넘었어요',
  },
  RECORDING_TOO_LARGE: {
    status: HttpStatus.BAD_REQUEST,
    message: '녹음 파일이 너무 커요',
  },
  RECORDING_ALREADY_SENT: {
    status: HttpStatus.CONFLICT,
    message: '이미 보낸 녹음이에요',
  },
  UPLOAD_NOT_FOUND: {
    status: HttpStatus.CONFLICT,
    message: '녹음 파일을 올리지 못했어요. 다시 시도해 주세요',
  },

  // deliveries · shelf
  NO_TAPE_LEFT: {
    status: HttpStatus.CONFLICT,
    message: '테이프가 없어요. 상점에서 채워 주세요',
  },
  NOT_FRIEND: {
    status: HttpStatus.FORBIDDEN,
    message: '친구에게만 보낼 수 있어요',
  },
  TAPE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: '테이프를 찾을 수 없어요',
  },
  TAPE_NOT_OPENED: {
    status: HttpStatus.CONFLICT,
    message: '소포를 먼저 뜯어 주세요',
  },
  INVALID_MEMO: {
    status: HttpStatus.BAD_REQUEST,
    message: '메모는 40자까지 적을 수 있어요',
  },
  AUDIO_NOT_READY: {
    status: HttpStatus.CONFLICT,
    message: '테이프를 불러오지 못했어요',
  },
  GROUP_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: '칸을 찾을 수 없어요',
  },
  GROUP_FULL: {
    status: HttpStatus.CONFLICT,
    message: '한 칸에는 10개까지 넣을 수 있어요',
  },
  DRAWER_FULL: {
    status: HttpStatus.CONFLICT,
    message: '서랍이 꽉 찼어요. 테이프를 지우거나 서랍을 넓혀 주세요',
  },
  INVALID_GROUP_NAME: {
    status: HttpStatus.BAD_REQUEST,
    message: '칸 이름은 1~12자로 적어주세요',
  },

  // share
  LINK_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: '링크를 찾을 수 없어요',
  },
  LINK_TAKEN: {
    status: HttpStatus.CONFLICT,
    message: '이미 다른 분이 받은 테이프예요',
  },
  LINK_EXPIRED: {
    status: HttpStatus.GONE,
    message: '링크가 만료됐어요',
  },
  LINK_OWN: {
    status: HttpStatus.CONFLICT,
    message: '내가 보낸 테이프예요',
  },
  // reports
  REPORT_TARGET_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: '신고할 대상을 찾을 수 없어요',
  },
  CANNOT_REPORT_SELF: {
    status: HttpStatus.BAD_REQUEST,
    message: '나는 신고할 수 없어요',
  },

  // wallet · shop
  INVALID_GIFT_AMOUNT: {
    status: HttpStatus.BAD_REQUEST,
    message: '선물은 10, 30, 50, 100 크레딧만 할 수 있어요',
  },
  GIFT_NOT_ALLOWED: {
    status: HttpStatus.FORBIDDEN,
    message: '선물할 수 없는 친구예요',
  },
  AD_LIMIT_REACHED: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: '오늘은 다 받았어요',
  },
  PRODUCT_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: '없는 상품이에요',
  },

  // billing
  RECEIPT_INVALID: {
    status: HttpStatus.BAD_REQUEST,
    message: '결제를 확인하지 못했어요',
  },
  RECEIPT_PENDING: {
    status: HttpStatus.CONFLICT,
    message: '결제를 확인하고 있어요. 잠시 후 다시 시도해 주세요',
  },
  RECEIPT_ALREADY_USED: {
    status: HttpStatus.CONFLICT,
    message: '이미 다른 계정에서 쓴 결제예요',
  },
  IAP_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: '지금은 결제를 확인할 수 없어요. 잠시 후 다시 시도해 주세요',
  },
  BILLING_NOTIFICATIONS_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: '스토어 알림을 받을 수 없어요',
  },
  INVALID_SIGNATURE: {
    status: HttpStatus.FORBIDDEN,
    message: '서명이 올바르지 않아요',
  },
} as const satisfies Record<string, { status: HttpStatus; message: string }>;

export type ErrorCode = keyof typeof ErrorCodes;
