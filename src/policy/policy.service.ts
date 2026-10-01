import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { childSafetyPolicy } from './child-safety.js';
import { privacyPolicy } from './privacy-policy.js';
import { termsOfService } from './terms.js';
import { OperatorInfo, PENDING, PolicyDocument } from './types.js';

const REQUIRED_IN_PRODUCTION = [
  'POLICY_OPERATOR_NAME',
  'POLICY_CONTACT_EMAIL',
  'POLICY_PRIVACY_OFFICER',
  'POLICY_EFFECTIVE_DATE',
] as const;

/**
 * 개인정보 처리방침·이용약관 문서. 운영자 정보는 POLICY_* 환경 변수에서 읽고, 비어 있으면 "준비 중"으로 보여 준다.
 * 운영에서 값이 비어 있으면 시작할 때 경고 로그만 남긴다(필수로 막지 않는다).
 */
@Injectable()
export class PolicyService implements OnModuleInit {
  private readonly logger = new Logger(PolicyService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') !== 'production') return;
    const missing = REQUIRED_IN_PRODUCTION.filter(
      (k) => !this.config.get<string>(k),
    );
    if (missing.length > 0) {
      this.logger.warn(
        `정책 페이지 운영자 정보가 비어 있어 "준비 중"으로 표시합니다: ${missing.join(', ')}`,
      );
    }
  }

  operator(): OperatorInfo {
    const get = (key: string) =>
      this.config.get<string>(key)?.trim() || PENDING;
    return {
      operatorName: get('POLICY_OPERATOR_NAME'),
      contactEmail: get('POLICY_CONTACT_EMAIL'),
      privacyOfficer: get('POLICY_PRIVACY_OFFICER'),
      businessInfo: get('POLICY_BUSINESS_INFO'),
      effectiveDate: get('POLICY_EFFECTIVE_DATE'),
    };
  }

  privacy(): PolicyDocument {
    return privacyPolicy(
      this.operator(),
      this.config.get<number>('LOG_RETENTION_DAYS') ?? 30,
    );
  }

  terms(): PolicyDocument {
    return termsOfService(this.operator());
  }

  childSafety(): PolicyDocument {
    return childSafetyPolicy(this.operator());
  }
}
