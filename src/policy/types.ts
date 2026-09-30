/**
 * 정책 문서 구조 (개인정보 처리방침 · 이용약관).
 * ⚠️ 법률 전문가 검토 전 초안이다. 확인이 필요한 항목은 docs/policy.md에 있다.
 */
export interface PolicyTable {
  headers: string[];
  rows: string[][];
}

export interface PolicySection {
  id: string;
  title: string;
  /** 문단 (목록·표보다 먼저 보여 준다) */
  paragraphs?: string[];
  /** 글머리 목록 */
  items?: string[];
  table?: PolicyTable;
  /** 표 아래 문단 */
  notes?: string[];
  /** 본문과 다른 언어로 쓴 섹션 (예: 'en') */
  lang?: string;
}

export interface PolicyDocument {
  kind: 'privacy' | 'terms' | 'child-safety';
  title: string;
  version: string;
  /** 시행일 (YYYY-MM-DD) 또는 "준비 중" */
  effectiveDate: string;
  intro: string[];
  sections: PolicySection[];
  /** 개정 이력 (최신이 앞) */
  history: { version: string; summary: string }[];
}

/** 운영자 정보 (POLICY_* 환경 변수). 비어 있으면 "준비 중" */
export interface OperatorInfo {
  operatorName: string;
  contactEmail: string;
  privacyOfficer: string;
  businessInfo: string;
  effectiveDate: string;
}

export const PENDING = '준비 중';
