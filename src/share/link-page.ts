import type { WebPreview } from './dto/share.response.js';

/**
 * 링크 웹 페이지 (`GET /t/{token}`). 앱이 없는 사람이 카톡·문자로 받은 링크를 열면 보는 첫 화면이다.
 *
 * 디자인 원본: design_handoff_cassette_app/source/TapeletterApp.template.html
 *   - `webOn` 블록 (소포 흔들림 → 앱 설치 안내). **원본의 웹 재생(탭해서 뜯기 → 테이프 재생)은
 *     사용자 결정(2026-10-01)으로 뺐다. 테이프는 앱에서만 들을 수 있다.** 대신 "앱에서 열기"를 둔다
 *   - `leOn` 블록 (이미 받은 링크 · 만료된 링크 · 내가 보낸 링크)
 *   - Tape.template.html (테이프 그래픽), keyframes.css, tokens
 * 수치·문구·타이밍은 원본 그대로 옮겼다. 프로토타입의 가짜 상태 바(9:41)와 주소창은 실제 브라우저가 대신한다.
 *
 * CSP 때문에 인라인 style 속성은 쓰지 않는다. 모든 스타일은 nonce가 붙은 <style> 하나에 있다.
 */

export const SUIT_CSS =
  'https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/static/woff2/SUIT.css';

/** 테이프 종류별 이름 (TapeletterApp.logic.js의 T). 종류 코드는 녹음 한도(초)다 */
const TAPES = {
  15: { name: '15초' },
  60: { name: '1분' },
  180: { name: '3분' },
} as const;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&'
      ? '&amp;'
      : c === '<'
        ? '&lt;'
        : c === '>'
          ? '&gt;'
          : c === '"'
            ? '&quot;'
            : '&#39;',
  );
}

/** <script type="application/json"> 안에 넣어도 안전한 JSON */
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** 한국 시간 기준 MM.DD */
export function formatMonthDay(isoDate: string): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(isoDate));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('month')}.${get('day')}`;
}

/** m:ss (프로토타입 fmt) */
export function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 링크가 남은 날 수 (올림, 최소 1). 원본 문구 "7일 동안"의 7을 이 값으로 바꾼다 */
export function daysLeft(expiresAt: string, now = Date.now()): number {
  return Math.max(
    1,
    Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000),
  );
}

/** 스토어 주소. 출시 전(STORE_LINKS_ENABLED=false)에는 null이고 배지는 링크 없이 보인다 */
export interface StoreLinks {
  appStore: string | null;
  googlePlay: string | null;
}

export interface PageContext {
  nonce: string;
  links: StoreLinks;
  /** 이 페이지의 절대 주소 (og:url) */
  pageUrl: string;
  /** 대표 이미지 절대 주소 (og:image) */
  ogImageUrl: string;
  /** 앱에서 열기: 커스텀 스킴 주소 (tapeletter://t/{token}) */
  appUrl: string;
  /** 앱에서 열기(Android): intent 주소. 패키지 이름이 없으면 null */
  androidIntentUrl: string | null;
}

/** 링크 미리보기(Open Graph) 값. 없으면 페이지 제목·설명과 600×600 대표 이미지를 쓴다 */
export interface OgMeta {
  title: string;
  description: string;
  /** 절대 주소 */
  image: string;
  width: number;
  height: number;
}

/**
 * 받을 수 있는 링크의 미리보기 문구 (design_handoff_kakao_share README "링크 미리보기 메타").
 * 이름이 없으면 README 제안 "누군가 목소리를 보냈어요"에 맞춰 "누군가 목소리 테이프를 보냈어요"
 */
export function shareOgMeta(name: string | null, image: string): OgMeta {
  return {
    title: name
      ? `${name}님이 목소리 테이프를 보냈어요`
      : '누군가 목소리 테이프를 보냈어요',
    description: '탭해서 소포를 뜯어보세요',
    image,
    width: 1200,
    height: 630,
  };
}

export const LOGO = (id: string, fill: string, size: number) =>
  `<svg viewBox="0 0 48 48" width="${size}" height="${size}" class="logo" aria-hidden="true"><mask id="${id}"><rect width="48" height="48" fill="#fff"/><circle cx="14" cy="23" r="3" fill="#000"/><circle cx="34" cy="23" r="3" fill="#000"/></mask><g fill="${fill}" mask="url(#${id})"><circle cx="14" cy="23" r="8.5"/><circle cx="34" cy="23" r="8.5"/><rect x="14" y="29" width="20" height="2.5"/></g></svg>`;

const KEYFRAMES = `
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes shake{0%,70%,100%{transform:rotate(0)}75%{transform:rotate(-3deg)}80%{transform:rotate(3deg)}85%{transform:rotate(-2deg)}90%{transform:rotate(2deg)}}
`;

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{background:#FFF;color:#111;font-family:'SUIT',system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
a{color:inherit;text-decoration:none;-webkit-tap-highlight-color:transparent}
.logo{display:block}
.page{width:100%;max-width:390px;margin:0 auto;min-height:100vh;min-height:100dvh;background:#FFF;position:relative}
.toast-wrap{position:fixed;left:0;right:0;bottom:104px;display:flex;justify-content:center;z-index:97;pointer-events:none}
.toast{height:44px;padding:0 20px;border-radius:22px;background:#111;color:#FFF;display:flex;align-items:center;font:700 14px 'SUIT';animation:fadeUp .25s}
.toast[hidden]{display:none}
/* 소포에 붙은 주소 태그 (webOn · leOn 공통) */
.tag{position:absolute;width:92px;padding:9px 10px;background:#FFF;border-radius:3px;box-shadow:0 1px 2px rgba(0,0,0,.15);transform:rotate(-3deg);text-align:left}
.tag .k{font:600 10px 'SUIT';color:#9A9A97}
.tag .n{font:800 15px 'SUIT';white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`;

/* ---- webOn ---- */
const WEB_CSS = `
.brand{display:flex;align-items:center;gap:8px;padding:14px 24px}
.brand span{font:800 19px/1 'SUIT';letter-spacing:-.045em}
.hero{padding:20px 24px 0;text-align:center}
.hero h1{font:800 26px/1.3 'SUIT';letter-spacing:-.02em}
.hero p{font:500 14px 'SUIT';color:#9A9A97;margin-top:8px}
.stage{height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
.parcel{display:flex;flex-direction:column;align-items:center;gap:18px}
.box{width:260px;height:190px;position:relative}
.box.shake{animation:shake 2.2s ease-in-out infinite}
.half{position:absolute;top:0;bottom:0;width:50%}
.half.l{left:0;border-radius:8px 0 0 8px;background:linear-gradient(135deg,#D2AB72,#C29558)}
.half.r{right:0;border-radius:0 8px 8px 0;background:linear-gradient(135deg,#C9A066,#B98B4F)}
.half .v{position:absolute;top:0;bottom:0;width:10px}
.half.l .v{right:0;background:#EFE4CF}
.half.r .v{left:0;background:#E6D9C0}
.half .h{position:absolute;left:0;right:0;top:88px;height:12px}
.half.l .h{background:#EFE4CF}
.half.r .h{background:#E6D9C0}
.half.r .tag{right:14px;bottom:16px}
.hint{font:700 15px 'SUIT';color:#9A9A97}
.listen{padding:0 24px}
.cta{height:56px;border-radius:16px;background:#111;color:#FFF;display:flex;align-items:center;justify-content:center;font:700 16px 'SUIT';width:100%}
.card{margin:14px 24px 0;border-radius:24px;background:#F6F6F4;padding:22px}
.card h2{font:800 17px 'SUIT'}
.card p{font:500 13.5px/1.55 'SUIT';color:#6E6E6B;margin-top:6px}
.stores{display:flex;gap:8px;margin-top:16px}
.store{flex:1;height:48px;border-radius:14px;background:#111;color:#FFF;display:flex;flex-direction:column;align-items:center;justify-content:center}
.store:not([href]){cursor:default}
.store .s{font:500 10px 'SUIT';opacity:.7}
.store .b{font:700 14px 'SUIT'}
.foot{padding:18px 24px 40px;text-align:center;font:500 12.5px/1.6 'SUIT';color:#A5A5A2}
`;

/* ---- leOn ---- */
const LE_CSS = `
.le{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;animation:fadeUp .3s}
.le-top{height:56px;flex:none;display:flex;align-items:center;justify-content:flex-end;padding:0 12px}
.le-x{width:44px;height:44px;display:flex;align-items:center;justify-content:center;font:400 22px/1 'SUIT'}
.le-body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;padding:0 32px;text-align:center}
.le-art.dim{opacity:.5;filter:grayscale(1)}
.le-box{width:200px;height:146px;position:relative}
.le-box .kraft{position:absolute;inset:0;border-radius:8px;background:linear-gradient(135deg,#D2AB72,#C29558);box-shadow:0 14px 30px -12px rgba(0,0,0,.35)}
.le-box .v{position:absolute;left:95px;top:0;bottom:0;width:10px;background:#EFE4CF}
.le-box .h{position:absolute;left:0;right:0;top:67px;height:12px;background:#EFE4CF}
.le-box .tag{right:14px;bottom:14px}
.le-title{font:800 24px/1.3 'SUIT';letter-spacing:-.02em}
.le-sub{font:500 15px/1.55 'SUIT';color:#8A8A87;margin-top:10px;white-space:pre-line}
.le-actions{flex:none;padding:0 24px 30px;display:flex;flex-direction:column;gap:2px}
.le-cta{height:56px;border-radius:16px;background:#111;color:#FFF;display:flex;align-items:center;justify-content:center;font:700 16px 'SUIT';width:100%}
.le-close{height:48px;display:flex;align-items:center;justify-content:center;font:600 14px 'SUIT';color:#111;width:100%}
`;

function head(opts: {
  title: string;
  description: string;
  ctx: PageContext;
  css: string;
  og?: OgMeta;
}): string {
  const { title, description, ctx } = opts;
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const og = opts.og ?? {
    title,
    description,
    image: ctx.ogImageUrl,
    width: 600,
    height: 600,
  };
  const ot = escapeHtml(og.title);
  const od = escapeHtml(og.description);
  const oi = escapeHtml(og.image);
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#FFFFFF">
<title>${t}</title>
<meta name="description" content="${d}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="tapeletter">
<meta property="og:title" content="${ot}">
<meta property="og:description" content="${od}">
<meta property="og:image" content="${oi}">
<meta property="og:image:width" content="${og.width}">
<meta property="og:image:height" content="${og.height}">
<meta property="og:url" content="${escapeHtml(ctx.pageUrl)}">
<meta name="twitter:card" content="${og.width > og.height ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${ot}">
<meta name="twitter:description" content="${od}">
<meta name="twitter:image" content="${oi}">
<link rel="icon" href="${escapeHtml(ctx.ogImageUrl)}">
<link rel="stylesheet" href="${SUIT_CSS}">
<style nonce="${escapeHtml(ctx.nonce)}">${KEYFRAMES}${BASE_CSS}${opts.css}</style>
</head>`;
}

function kraftTag(top: string, name: string): string {
  return `<div class="tag"><div class="k">${escapeHtml(top)}</div><div class="n">${escapeHtml(name)}</div></div>`;
}

/** 스토어 배지. 주소가 없으면(출시 전) href 없이 보인다 */
function storeLink(id: string, href: string | null, label: string): string {
  const h = href ? ` href="${escapeHtml(href)}"` : '';
  return `<a class="store" id="${id}" data-store="${id}"${h}><span class="s">다운로드</span><span class="b">${label}</span></a>`;
}

/**
 * 모바일 웹 페이지 (webOn). 테이프는 웹에서 재생하지 않는다(앱에서만 듣는다).
 * 소포·보낸 사람·테이프 길이를 보여 주고 "앱에서 열기"로 앱을 연다.
 */
export function renderTapePage(
  token: string,
  p: WebPreview,
  ctx: PageContext,
  og?: OgMeta,
): string {
  const tape = TAPES[p.tapeType];
  const name = escapeHtml(p.senderName);
  const date = formatMonthDay(p.sentAt);
  const days = daysLeft(p.expiresAt);
  const title = `${p.senderName}님이 테이프를 보냈어요`;
  const config = {
    links: ctx.links,
    appUrl: ctx.appUrl,
    androidIntentUrl: ctx.androidIntentUrl,
  };

  const body = `<body><main class="page">
<header class="brand">${LOGO('wb-m', '#E5402B', 24)}<span>tapeletter</span></header>
<section class="hero"><h1>${name}님이<br>테이프를 보냈어요</h1><p>${tape.name} 테이프 · ${date}</p></section>
<section class="stage">
<div class="parcel">
<div class="box shake"><div class="half l"><span class="v"></span><span class="h"></span></div><div class="half r"><span class="v"></span><span class="h"></span>${kraftTag('보낸 사람', p.senderName)}</div></div>
<div class="hint">tapeletter 앱에서 들을 수 있어요</div>
</div>
</section>
<section class="listen"><button type="button" class="cta" id="openApp">앱에서 열기</button></section>
<section class="card">
<h2>앱이 없다면 설치해 주세요</h2>
<p>앱에서 소포를 뜯으면 ${name}님과 친구가 되고,<br>이 테이프는 서랍에 담겨요.</p>
<div class="stores">${storeLink('appStore', ctx.links.appStore, 'App Store')}${storeLink('googlePlay', ctx.links.googlePlay, 'Google Play')}</div>
</section>
<p class="foot">이 링크는 ${days}일 동안 열 수 있어요</p>
</main>
<div class="toast-wrap"><div class="toast" id="toast" hidden></div></div>
<script type="application/json" id="cfg">${safeJson(config)}</script>
<script nonce="${escapeHtml(ctx.nonce)}">${TAPE_SCRIPT}</script>
</body></html>`;

  return (
    head({
      title,
      description: `${tape.name} 테이프 · tapeletter 앱에서 들을 수 있어요`,
      ctx,
      css: WEB_CSS,
      og,
    }) + body
  );
}

export type LinkErrorKind = 'taken' | 'expired' | 'own' | 'not_found';

/** leOn 문구 (TapeletterApp.logic.js의 LE). not_found는 원본에 없어서 같은 톤으로 추가했다 */
const LE: Record<
  LinkErrorKind,
  {
    top: string;
    name?: string;
    title: string;
    sub: string;
    cta: string;
    dim: boolean;
  }
> = {
  taken: {
    top: '받는 사람',
    name: '이미 받음',
    title: '이미 다른 분이 받은 테이프예요',
    sub: '테이프는 한 사람만 받을 수 있어요.\n보낸 분께 다시 보내 달라고 해보세요.',
    cta: '확인',
    dim: true,
  },
  expired: {
    top: '보관 기한',
    name: '지남',
    title: '링크가 만료됐어요',
    sub: '받지 않은 테이프는 7일이 지나면 사라져요.\n보낸 분께 다시 보내 달라고 해보세요.',
    cta: '확인',
    dim: true,
  },
  own: {
    top: '보낸 사람',
    title: '내가 보낸 테이프예요',
    sub: '테이프는 받는 사람만 들을 수 있어요.\n링크를 다시 보낼까요?',
    cta: '링크 다시 공유하기',
    dim: false,
  },
  not_found: {
    top: '링크',
    name: '없음',
    title: '테이프를 찾을 수 없어요',
    sub: '링크 주소를 다시 확인해 주세요.',
    cta: '확인',
    dim: true,
  },
};

export function linkErrorKind(code: string): LinkErrorKind {
  return code === 'LINK_TAKEN'
    ? 'taken'
    : code === 'LINK_EXPIRED'
      ? 'expired'
      : code === 'LINK_OWN'
        ? 'own'
        : 'not_found';
}

/** 링크 오류 페이지 (leOn). own일 때 senderName에 보낸 사람(나) 이름을 준다 */
export function renderErrorPage(
  kind: LinkErrorKind,
  ctx: PageContext,
  senderName = '',
): string {
  const le = LE[kind];
  const config = { kind, shareUrl: ctx.pageUrl };
  const body = `<body><main class="page le">
<div class="le-top"><button type="button" class="le-x" id="close" aria-label="닫기">✕</button></div>
<div class="le-body">
<div class="le-art${le.dim ? ' dim' : ''}"><div class="le-box"><div class="kraft"><span class="v"></span><span class="h"></span>${kraftTag(le.top, le.name ?? senderName)}</div></div></div>
<div><div class="le-title">${escapeHtml(le.title)}</div><div class="le-sub">${escapeHtml(le.sub)}</div></div>
</div>
<div class="le-actions"><button type="button" class="le-cta" id="primary">${escapeHtml(le.cta)}</button>${kind === 'own' ? '<button type="button" class="le-close" id="close2">닫기</button>' : ''}</div>
</main>
<div class="toast-wrap"><div class="toast" id="toast" hidden></div></div>
<script type="application/json" id="cfg">${safeJson(config)}</script>
<script nonce="${escapeHtml(ctx.nonce)}">${ERROR_SCRIPT}</script>
</body></html>`;
  return (
    head({
      title: le.title,
      description: le.sub.replace('\n', ' '),
      ctx,
      css: LE_CSS,
    }) + body
  );
}

/* ---- 스크립트 (nonce로만 실행된다) ---- */

const COMMON_SCRIPT = `
function $(id){return document.getElementById(id)}
var toastTimer;
function say(msg){var t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.hidden=true},1800)}
function closePage(){
  if(/KAKAOTALK/i.test(navigator.userAgent)){location.href='kakaotalk://inappbrowser/close';return}
  if(history.length>1){history.back();return}
  window.close();
}
`;

/**
 * "앱에서 열기": 커스텀 스킴(Android는 intent)으로 앱을 연다. 같은 도메인 안의 이동이라
 * 유니버설 링크·앱 링크는 이 버튼으로는 열리지 않는다. 1.6초 안에 앱으로 넘어가지 않으면
 * 스토어로 보내고, 스토어 주소가 아직 없으면(출시 전) 안내만 띄운다.
 */
const TAPE_SCRIPT = `(function(){
${COMMON_SCRIPT}
var cfg=JSON.parse($('cfg').textContent);
function isIOS(){return /iPhone|iPad|iPod/i.test(navigator.userAgent)}
function isAndroid(){return /Android/i.test(navigator.userAgent)}
$('openApp').addEventListener('click',function(){
  var target=isAndroid()&&cfg.androidIntentUrl?cfg.androidIntentUrl:cfg.appUrl;
  var started=Date.now();
  location.href=target;
  setTimeout(function(){
    if(document.hidden||Date.now()-started>2500)return;
    var store=isIOS()?cfg.links.appStore:cfg.links.googlePlay;
    if(store)location.href=store;else say('tapeletter 앱을 먼저 설치해 주세요');
  },1600);
});
})();`;

const ERROR_SCRIPT = `(function(){
${COMMON_SCRIPT}
var cfg=JSON.parse($('cfg').textContent);
$('close').addEventListener('click',closePage);
if($('close2'))$('close2').addEventListener('click',closePage);
$('primary').addEventListener('click',function(){
  if(cfg.kind!=='own'){closePage();return}
  if(navigator.share){navigator.share({url:cfg.shareUrl}).catch(function(){});return}
  (navigator.clipboard?navigator.clipboard.writeText(cfg.shareUrl):Promise.reject()).then(function(){say('링크를 복사했어요')}).catch(function(){say(cfg.shareUrl)});
});
})();`;
