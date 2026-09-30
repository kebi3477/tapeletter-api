import { OperatorInfo, PENDING, PolicyDocument } from './types.js';

/**
 * 아동 안전 정책 (`/child-safety`). Google Play "아동 안전 표준" 정책의 공개 게시 요건용.
 *
 * ⚠️ 법률 전문가 검토 전 초안이다 (docs/policy.md). 페이지 본문에는 이 표시를 노출하지 않는다.
 * 이 저장소 코드와 운영 도구가 실제로 하는 것만 쓴다:
 * - 신고 사유: reports/entities/report.entity.ts (앱 문구: 성적인 내용 · 불법·권리 침해 · 기타 등)
 * - 신고 기록 3년 보관: 개인정보 처리방침과 같다
 * - 콘텐츠 삭제·계정 삭제는 운영 도구가 없어 운영자가 확인한 뒤 직접 처리한다 (docs/deploy.md "신고 처리")
 * - 이용 제한은 이용약관 12조(경고, 기능 이용 제한, 계정 삭제), 만 14세 미만은 이용약관 3조와 같다
 */
export function childSafetyPolicy(op: OperatorInfo): PolicyDocument {
  const operator =
    op.operatorName === PENDING ? '테이프레터 운영자' : op.operatorName;
  const email = op.contactEmail;
  return {
    kind: 'child-safety',
    title: '아동 안전 정책',
    version: '1.0',
    effectiveDate: op.effectiveDate,
    intro: [
      `${operator}(이하 '운영자')는 tapeletter(테이프레터) 앱과 웹 페이지(이하 '서비스')에서 아동 성적 학대·착취(CSAE)와 아동 성착취물(CSAM)을 어떤 경우에도 허용하지 않습니다. 이 페이지는 그 기준과 신고 방법, 운영자의 조치를 설명합니다.`,
    ],
    sections: [
      {
        id: 'zero-tolerance',
        title: '1. 무관용 원칙',
        items: [
          '운영자는 아동 성적 학대·착취(CSAE)와 아동 성착취물(CSAM)에 대해 무관용 원칙을 적용합니다.',
          '이 원칙은 음성 녹음(테이프), 이름, 링크에 적은 이름, 신고 메모 등 서비스 안에서 회원이 만들거나 보내는 모든 콘텐츠에 적용됩니다.',
          '금지하는 행위: 아동을 성적으로 묘사하거나 성적 대상으로 삼는 콘텐츠를 녹음·전송·공유하는 행위, 아동에게 성적인 접근이나 유인(그루밍)을 시도하는 행위, 아동을 성적으로 착취하거나 거래하려는 행위, 이런 콘텐츠를 얻거나 퍼뜨리려는 행위',
          '서비스는 만 14세 이상만 가입해 이용할 수 있습니다(이용약관 3조). 만 14세 미만으로 확인되면 운영자는 계정과 정보를 삭제합니다.',
        ],
      },
      {
        id: 'report',
        title: '2. 신고 방법',
        items: [
          "앱에서 신고: 받은 테이프의 ⋯ 메뉴 → 신고하기, 또는 친구 메뉴 → 신고하기에서 사유 '성적인 내용'(또는 '불법·권리 침해', '기타')을 고르고, 메모에 아동과 관련된 내용이라고 적어 주세요. 신고하면서 그 사람을 함께 차단할 수 있습니다.",
          `이메일로 신고: ${email}. 앱이 없거나 링크로 받은 테이프를 신고할 때도 이 주소로 보내 주세요. 링크 주소(https://…/t/…)를 함께 적어 주시면 빠르게 확인할 수 있습니다.`,
          '아동이 위험에 처해 있다면 먼저 경찰(112)에 신고해 주세요.',
        ],
      },
      {
        id: 'action',
        title: '3. 운영자의 조치',
        items: [
          '운영자가 확인한 뒤 해당 콘텐츠를 즉시 삭제합니다.',
          '관련 계정은 이용약관 12조에 따라 계정 삭제 등 이용을 제한합니다.',
          '관련 법령에 따라 경찰청 사이버수사, 방송통신심의위원회 등 관계 당국에 신고하며, 관계 당국이 적법한 절차로 요청하면 필요한 자료를 제공합니다.',
          '신고 기록은 개인정보 처리방침에 따라 3년 동안 보관합니다.',
        ],
      },
      {
        id: 'contact',
        title: '4. 아동 안전 담당자',
        table: {
          headers: ['구분', '내용'],
          rows: [
            ['담당자', op.privacyOfficer],
            ['이메일', op.contactEmail],
          ],
        },
        notes: [`이 정책은 ${op.effectiveDate}부터 적용합니다.`],
      },
      {
        id: 'english',
        title: 'English summary',
        lang: 'en',
        paragraphs: [
          'tapeletter has zero tolerance for child sexual abuse and exploitation (CSAE) and child sexual abuse material (CSAM). This applies to all user content on the service, including voice recordings (tapes), names and report notes.',
        ],
        items: [
          'Age: only users aged 14 or older may sign up (Terms, section 3). Accounts found to belong to users under 14 are deleted.',
          "How to report: in the app, open a received tape's ⋯ menu (or a friend's menu) → 신고하기 (Report), choose the reason '성적인 내용' (sexual content), '불법·권리 침해' (illegal) or '기타' (other) and note that it involves a child. You can also email " +
            email +
            '. If a child is in immediate danger, call the police (112 in Korea).',
          'Our actions: after reviewing a report, the operator removes the content immediately, restricts the related accounts including account deletion (Terms, section 12), reports to the relevant authorities under applicable law (such as the Korean National Police Agency cyber bureau and the Korea Communications Standards Commission), and provides necessary records to authorities upon lawful request. Report records are kept for 3 years.',
          `Child safety contact: ${op.privacyOfficer}, ${op.contactEmail}.`,
        ],
      },
    ],
    history: [{ version: '1.0', summary: '최초 작성' }],
  };
}
