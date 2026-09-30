import { escapeHtml, LOGO, SUIT_CSS } from '../share/link-page.js';
import { PENDING, PolicyDocument, PolicySection } from './types.js';

/**
 * 정책 페이지 HTML (`/privacy`, `/terms`, `/child-safety`). 링크 웹 페이지와 같은 톤(SUIT, 디자인 토큰 색)이고,
 * 스크립트 없이 nonce가 붙은 <style> 하나만 쓴다(CSP).
 * ⚠️ 법률 전문가 검토 전 초안이다 (docs/policy.md). 이 표시는 페이지 본문에 노출하지 않는다.
 */

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{background:#FFF;color:#111;font-family:'SUIT',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.page{max-width:720px;margin:0 auto;padding:0 24px 56px}
.brand{display:flex;align-items:center;gap:8px;padding:14px 0}
.brand span{font:800 19px/1 'SUIT';letter-spacing:-.045em}
.logo{display:block}
h1{font:800 26px/1.3 'SUIT';letter-spacing:-.02em;margin-top:20px}
.meta{font:500 13px/1.6 'SUIT';color:#9A9A97;margin-top:8px}
.intro{margin-top:20px}
nav{margin-top:24px;border-radius:24px;background:#F6F6F4;padding:18px 22px}
nav ol{list-style:none;display:flex;flex-direction:column;gap:6px}
nav a{font:600 14px/1.5 'SUIT';color:#3A3A38;text-decoration:none}
section{margin-top:36px;scroll-margin-top:16px}
h2{font:800 17px/1.4 'SUIT';letter-spacing:-.01em;margin-bottom:10px}
p,li{font:500 15px/1.75 'SUIT';color:#3A3A38;word-break:keep-all;overflow-wrap:anywhere}
p+p{margin-top:8px}
ul{margin-top:8px;padding-left:18px;display:flex;flex-direction:column;gap:6px}
li::marker{color:#B5B5B2}
.table{margin-top:12px;overflow-x:auto;border-radius:14px;box-shadow:inset 0 0 0 1px #EFEFEC}
table{border-collapse:collapse;width:100%}
th,td{padding:12px 14px;text-align:left;vertical-align:top;font:500 14px/1.6 'SUIT';color:#3A3A38;word-break:keep-all;border-bottom:1px solid #F0F0EE}
th{font-weight:700;color:#111;background:#F6F6F4}
tr:last-child td{border-bottom:0}
td.pending{color:#9A9A97}
@media (max-width:600px){
.table{box-shadow:none;border-radius:0;overflow:visible}
table,tbody,tr,td{display:block;width:100%}
thead{display:none}
tr{border-radius:14px;background:#F6F6F4;padding:12px 16px;margin-top:10px}
td{padding:4px 0;border:0}
td::before{content:attr(data-label);display:block;font:700 12px/1.6 'SUIT';color:#9A9A97}
}
.note{margin-top:10px;font:500 13.5px/1.7 'SUIT';color:#6E6E6B}
.links{margin-top:48px;padding-top:20px;border-top:1px solid #F0F0EE;display:flex;gap:16px;font:600 13px 'SUIT'}
.links a{color:#9A9A97;text-decoration:none}
`;

/** 좁은 화면에서는 표를 행마다 카드로 쌓고, 칸 제목을 data-label로 보여 준다 */
function cell(value: string, label: string): string {
  const cls = value === PENDING ? ' class="pending"' : '';
  return `<td data-label="${escapeHtml(label)}"${cls}>${escapeHtml(value)}</td>`;
}

function section(s: PolicySection): string {
  const parts = [`<h2>${escapeHtml(s.title)}</h2>`];
  for (const p of s.paragraphs ?? []) parts.push(`<p>${escapeHtml(p)}</p>`);
  if (s.items?.length) {
    parts.push(
      `<ul>${s.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`,
    );
  }
  if (s.table) {
    const head = s.table.headers
      .map((h) => `<th scope="col">${escapeHtml(h)}</th>`)
      .join('');
    const headers = s.table.headers;
    const rows = s.table.rows
      .map(
        (r) =>
          `<tr>${r.map((c, i) => cell(c, headers[i] ?? '')).join('')}</tr>`,
      )
      .join('');
    parts.push(
      `<div class="table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`,
    );
  }
  for (const n of s.notes ?? [])
    parts.push(`<p class="note">${escapeHtml(n)}</p>`);
  const lang = s.lang ? ` lang="${escapeHtml(s.lang)}"` : '';
  return `<section id="${escapeHtml(s.id)}"${lang}>${parts.join('')}</section>`;
}

export function renderPolicyPage(
  doc: PolicyDocument,
  nonce: string,
  pageUrl: string,
): string {
  const other = (
    [
      ['terms', '/terms', '이용약관'],
      ['privacy', '/privacy', '개인정보 처리방침'],
      ['child-safety', '/child-safety', '아동 안전 정책'],
    ] as const
  )
    .filter(([kind]) => kind !== doc.kind)
    .map(([, href, label]) => `<a href="${href}">${label}</a>`)
    .join('');
  const toc = doc.sections
    .map(
      (s) =>
        `<li><a href="#${escapeHtml(s.id)}">${escapeHtml(s.title)}</a></li>`,
    )
    .join('');
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#FFFFFF">
<title>${escapeHtml(doc.title)} · tapeletter</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="tapeletter">
<meta property="og:title" content="${escapeHtml(doc.title)} · tapeletter">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<link rel="stylesheet" href="${SUIT_CSS}">
<style nonce="${escapeHtml(nonce)}">${CSS}</style>
</head>
<body><main class="page">
<header class="brand">${LOGO('pl-m', '#E5402B', 24)}<span>tapeletter</span></header>
<h1>${escapeHtml(doc.title)}</h1>
<p class="meta">시행일 ${escapeHtml(doc.effectiveDate)} · 버전 ${escapeHtml(doc.version)}</p>
<div class="intro">${doc.intro.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}</div>
<nav aria-label="목차"><ol>${toc}</ol></nav>
${doc.sections.map(section).join('\n')}
<section id="history"><h2>개정 이력</h2><ul>${doc.history
    .map(
      (h) => `<li>버전 ${escapeHtml(h.version)}: ${escapeHtml(h.summary)}</li>`,
    )
    .join('')}</ul></section>
<footer class="links">${other}</footer>
</main></body></html>`;
}
