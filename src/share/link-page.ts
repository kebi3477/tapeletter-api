import type { WebPreview } from './dto/share.response.js';
import type { TapeType } from '../recordings/entities/recording.entity.js';

/**
 * 링크 웹 페이지 (`GET /t/{token}`). 앱이 없는 사람이 카톡·문자로 받은 링크를 열면 보는 첫 화면이다.
 *
 * 디자인 원본: design_handoff_cassette_app/source/TapeletterApp.template.html
 *   - `webOn` 블록 (소포 흔들림 → 탭해서 뜯기 → 테이프 재생 → 앱 설치 안내)
 *   - `leOn` 블록 (이미 받은 링크 · 만료된 링크 · 내가 보낸 링크)
 *   - Tape.template.html (테이프 그래픽), keyframes.css, tokens
 * 수치·문구·타이밍은 원본 그대로 옮겼다. 프로토타입의 가짜 상태 바(9:41)와 주소창은 실제 브라우저가 대신한다.
 *
 * CSP 때문에 인라인 style 속성은 쓰지 않는다. 모든 스타일은 nonce가 붙은 <style> 하나에 있다.
 */

export const SUIT_CSS =
  'https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/static/woff2/SUIT.css';

/**
 * 테이프 종류별 색·이름·릴 크기 (TapeletterApp.logic.js의 T).
 * 종류 코드는 녹음 한도(초)다. 원본의 1·3·5 자리가 15초·1분·3분으로 옮겨 왔다(색·모양은 자리 그대로)
 */
const TAPES = {
  15: {
    shell: '#1E1E1E',
    edge: '#161616',
    band: '#E5402B',
    len: '15 SEC',
    name: '15초',
    full: 50,
  },
  60: {
    shell: '#E9E5DC',
    edge: '#D9D4C9',
    band: '#2E6BD6',
    len: '1 MIN',
    name: '1분',
    full: 58,
  },
  180: {
    shell: '#76858F',
    edge: '#66747E',
    band: '#111111',
    len: '3 MIN',
    name: '3분',
    full: 66,
  },
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

export interface StoreLinks {
  appStore: string;
  googlePlay: string;
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
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes shake{0%,70%,100%{transform:rotate(0)}75%{transform:rotate(-3deg)}80%{transform:rotate(3deg)}85%{transform:rotate(-2deg)}90%{transform:rotate(2deg)}}
@keyframes tearL{to{transform:translate(-180px,60px) rotate(-24deg);opacity:0}}
@keyframes tearR{to{transform:translate(180px,60px) rotate(24deg);opacity:0}}
@keyframes insert{0%{transform:translateY(-120px) rotate(-6deg);opacity:0}60%{transform:translateY(6px) rotate(0);opacity:1}100%{transform:none}}
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
.parcel-btn{display:flex;flex-direction:column;align-items:center;gap:18px}
.parcel-btn[hidden],.player[hidden]{display:none}
.box{width:260px;height:190px;position:relative}
.box.shake{animation:shake 2.2s ease-in-out infinite}
.half{position:absolute;top:0;bottom:0;width:50%}
.half.l{left:0;border-radius:8px 0 0 8px;background:linear-gradient(135deg,#D2AB72,#C29558)}
.half.r{right:0;border-radius:0 8px 8px 0;background:linear-gradient(135deg,#C9A066,#B98B4F)}
.half.l.tear{animation:tearL .7s cubic-bezier(.5,0,.7,.4) forwards}
.half.r.tear{animation:tearR .7s cubic-bezier(.5,0,.7,.4) forwards}
.half .v{position:absolute;top:0;bottom:0;width:10px}
.half.l .v{right:0;background:#EFE4CF}
.half.r .v{left:0;background:#E6D9C0}
.half .h{position:absolute;left:0;right:0;top:88px;height:12px}
.half.l .h{background:#EFE4CF}
.half.r .h{background:#E6D9C0}
.half.r .tag{right:14px;bottom:16px}
.hint{font:700 15px 'SUIT';color:#9A9A97}
.hint.off{opacity:0}
.player{display:flex;flex-direction:column;align-items:center;gap:18px;animation:insert .7s cubic-bezier(.3,.7,.3,1)}
.controls{display:flex;align-items:center;gap:16px}
.play{width:52px;height:52px;border-radius:50%;background:#111;display:flex;align-items:center;justify-content:center;gap:4px}
.play .bar{width:4px;height:15px;background:#FFF;border-radius:1px}
.play .tri{width:0;height:0;border-left:14px solid #FFF;border-top:9px solid transparent;border-bottom:9px solid transparent;margin-left:3px}
.play .bar,.play.on .tri{display:none}
.play.on .bar{display:block}
.progress{width:190px;display:flex;align-items:center;gap:10px;font:600 12px 'SUIT';color:#9A9A97;font-variant-numeric:tabular-nums}
.track{flex:1;height:3px;border-radius:2px;background:#EEEEEC;overflow:hidden}
.fill{height:100%;width:0;background:#111}
.load-err{font:600 13px 'SUIT';color:#E5402B;min-height:0}
.load-err:empty{display:none}
.card{margin:14px 24px 0;border-radius:24px;background:#F6F6F4;padding:22px}
.card h2{font:800 17px 'SUIT'}
.card p{font:500 13.5px/1.55 'SUIT';color:#6E6E6B;margin-top:6px}
.stores{display:flex;gap:8px;margin-top:16px}
.store{flex:1;height:48px;border-radius:14px;background:#111;color:#FFF;display:flex;flex-direction:column;align-items:center;justify-content:center}
.store .s{font:500 10px 'SUIT';opacity:.7}
.store .b{font:700 14px 'SUIT'}
.open-app{margin-top:8px;height:48px;border-radius:14px;background:#FFF;box-shadow:inset 0 0 0 1px #E6E6E3;display:flex;align-items:center;justify-content:center;font:700 14px 'SUIT';width:100%}
.foot{padding:18px 24px 40px;text-align:center;font:500 12.5px/1.6 'SUIT';color:#A5A5A2}
`;

/* ---- Tape.template.html (320×204) ---- */
const TAPE_CSS = `
.tape{width:320px;height:204px;position:relative}
.tape.t15{--shell:#1E1E1E;--edge:#161616;--band:#E5402B}
.tape.t60{--shell:#E9E5DC;--edge:#D9D4C9;--band:#2E6BD6}
.tape.t180{--shell:#76858F;--edge:#66747E;--band:#111111}
.tape .shell{position:absolute;inset:0;border-radius:10px;background:var(--shell);box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -2px 0 rgba(0,0,0,.22),inset 1px 0 0 rgba(255,255,255,.08),0 1px 2px rgba(0,0,0,.25),0 16px 32px -8px rgba(0,0,0,.28)}
.tape .label{position:absolute;left:14px;right:14px;top:12px;height:134px;border-radius:6px;background:#F7F5F0;box-shadow:0 0 0 1px rgba(0,0,0,.06);overflow:hidden}
.tape .band{position:absolute;left:0;right:0;top:0;height:22px;background:var(--band);display:flex;align-items:center;justify-content:space-between;padding:0 10px}
.tape .band .a{font:800 12px/1 'SUIT';color:#FFF}
.tape .band .len{font:700 10.5px/1 'SUIT';color:#FFF;letter-spacing:.06em}
.tape .title{position:absolute;left:12px;right:12px;top:26px;height:22px;display:flex;align-items:flex-end;border-bottom:1px solid #E2DED5}
.tape .title span{font:600 13px/1 'SUIT';color:#3A3A38;padding-bottom:4px}
.tape .rule{position:absolute;left:12px;right:12px;bottom:10px;height:1px;background:#E2DED5}
.tape .fine{position:absolute;left:12px;right:12px;bottom:4px;display:flex;justify-content:space-between;font:600 7px/1 'SUIT';color:#B3AEA3;letter-spacing:.12em}
.tape .window{position:absolute;left:72px;width:176px;top:62px;height:56px;border-radius:9px;background:linear-gradient(180deg,#2B2826,#171513);box-shadow:0 0 0 5px var(--shell),inset 0 2px 6px rgba(0,0,0,.7);overflow:hidden}
.tape .pack{position:absolute;top:28px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,#6B452C 0 38%,#4A2E1D 62%,#3A2315 90%,#2A180E);box-shadow:0 0 0 1px rgba(0,0,0,.4);transition:width .3s linear,height .3s linear;width:30px;height:30px}
.tape .pack.l{left:30px}
.tape .pack.r{left:146px}
.tape.t15 .pack.l{width:50px;height:50px}
.tape.t60 .pack.l{width:58px;height:58px}
.tape.t180 .pack.l{width:66px;height:66px}
.tape .glass{position:absolute;left:56px;right:56px;top:9px;bottom:9px;border-radius:2px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.tape .glass .t{position:absolute;left:4px;right:4px;top:4px;height:5px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.45) 0 1px,transparent 1px 7px)}
.tape .glass .b{position:absolute;left:4px;right:4px;bottom:4px;height:3px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.3) 0 1px,transparent 1px 7px)}
.tape .hub{position:absolute;top:14px;width:28px;height:28px;border-radius:50%;background:#EDEBE6;box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}
.tape .hub.l{left:16px}
.tape .hub.r{left:132px}
.tape.spinning .hub{animation:spin 1.8s linear infinite}
.tape .hub i{position:absolute;inset:6px;border-radius:50%;background:#1A1816}
.tape .hub b{position:absolute;left:12.5px;top:5px;width:3px;height:5px;background:#EDEBE6;transform-origin:1.5px 9px}
.tape .hub b:nth-of-type(2){transform:rotate(60deg)}
.tape .hub b:nth-of-type(3){transform:rotate(120deg)}
.tape .hub b:nth-of-type(4){transform:rotate(180deg)}
.tape .hub b:nth-of-type(5){transform:rotate(240deg)}
.tape .hub b:nth-of-type(6){transform:rotate(300deg)}
.tape .sheen{position:absolute;inset:0;background:linear-gradient(165deg,rgba(255,255,255,.16),transparent 40%);pointer-events:none}
.tape .edge{position:absolute;left:62px;right:62px;bottom:0;height:40px;background:var(--edge);clip-path:polygon(7% 0,93% 0,100% 100%,0 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.12)}
.tape .edge .slot{position:absolute;bottom:0;background:#0E0D0C;border-radius:2px 2px 0 0}
.tape .edge .slot::after{content:'';position:absolute;left:0;right:0;bottom:2px;height:2px;background:#5A3A26}
.tape .edge .slot.c{left:50%;width:32px;height:12px;margin-left:-16px}
.tape .edge .slot.c::before{content:'';position:absolute;left:9px;right:9px;top:3px;height:4px;background:#8C7F6A;border-radius:1px}
.tape .edge .slot.m1{left:52px;width:12px;height:9px}
.tape .edge .slot.m2{right:52px;width:12px;height:9px}
.tape .edge .slot.o1{left:24px;width:10px;height:8px}
.tape .edge .slot.o2{right:24px;width:10px;height:8px}
.tape .edge .hole{position:absolute;bottom:15px;width:9px;height:9px;border-radius:50%;background:#0E0D0C}
.tape .edge .hole.a{left:53px}
.tape .edge .hole.b{right:53px}
.tape .screw{position:absolute;width:9px;height:9px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#D8D8D6,#6E6E6C);box-shadow:0 0 0 1px rgba(0,0,0,.25)}
.tape .screw.a{left:6px;top:4px}
.tape .screw.b{right:6px;top:4px}
.tape .screw.c{left:6px;bottom:6px}
.tape .screw.d{right:6px;bottom:6px}
.tape .screw.e{left:50%;bottom:26px;margin-left:-4.5px}
.tape .grip{position:absolute;top:60px;width:6px;height:56px;background:repeating-linear-gradient(180deg,rgba(255,255,255,.12) 0 2px,transparent 2px 5px);border-radius:2px}
.tape .grip.a{left:4px}
.tape .grip.b{right:4px}
.tape .note{position:absolute;right:-10px;top:-22px;min-width:104px;background:#FFF;border-radius:10px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 10px 20px -8px rgba(0,0,0,.28);padding:10px 14px;display:flex;flex-direction:column;gap:8px}
.tape .note .k{font:600 10px/1 'SUIT';color:#9A9A97}
.tape .note .n{font:800 17px/1.2 'SUIT';letter-spacing:-.02em;color:#111;margin-top:4px}
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

function tapeHtml(type: TapeType, title: string, from: string): string {
  const t = TAPES[type];
  const spokes = '<b></b>'.repeat(6);
  const hub = (side: string) =>
    `<div class="hub ${side}"><i></i>${spokes}</div>`;
  return `<div class="tape t${type}" id="tape">
<div class="shell"></div>
<div class="label"><div class="band"><span class="a">A</span><span class="len">${t.len}</span></div><div class="title"><span>${escapeHtml(title)}</span></div><div class="rule"></div><div class="fine"><span>NR</span><span>TYPE I · NORMAL</span></div></div>
<div class="window"><div class="pack l" id="packL"></div><div class="pack r" id="packR"></div><div class="glass"><div class="t"></div><div class="b"></div></div>${hub('l')}${hub('r')}<div class="sheen"></div></div>
<div class="edge"><div class="slot c"></div><div class="slot m1"></div><div class="slot m2"></div><div class="slot o1"></div><div class="slot o2"></div><span class="hole a"></span><span class="hole b"></span></div>
<span class="screw a"></span><span class="screw b"></span><span class="screw c"></span><span class="screw d"></span><span class="screw e"></span>
<div class="grip a"></div><div class="grip b"></div>
<div class="note"><div><div class="k">보낸 사람</div><div class="n">${escapeHtml(from)}</div></div></div>
</div>`;
}

/** 모바일 웹 페이지 (webOn) */
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
    token,
    durationMs: p.durationMs,
    full: tape.full,
    links: ctx.links,
    appUrl: ctx.appUrl,
    androidIntentUrl: ctx.androidIntentUrl,
  };

  const body = `<body><main class="page">
<header class="brand">${LOGO('wb-m', '#E5402B', 24)}<span>tapeletter</span></header>
<section class="hero"><h1>${name}님이<br>테이프를 보냈어요</h1><p>${tape.name} 테이프 · ${date}</p></section>
<section class="stage">
<button type="button" class="parcel-btn" id="parcel" aria-label="소포 뜯기">
<div class="box shake" id="box"><div class="half l" id="halfL"><span class="v"></span><span class="h"></span></div><div class="half r" id="halfR"><span class="v"></span><span class="h"></span>${kraftTag('보낸 사람', p.senderName)}</div></div>
<div class="hint" id="hint">탭해서 뜯기</div>
</button>
<div class="player" id="player" hidden>
${tapeHtml(p.tapeType, date, p.senderName)}
<div class="controls"><button type="button" class="play" id="play" aria-label="재생"><span class="bar"></span><span class="bar"></span><span class="tri"></span></button>
<div class="progress"><span id="pos">0:00</span><div class="track"><div class="fill" id="fill"></div></div><span>${formatClock(p.durationMs)}</span></div></div>
<p class="load-err" id="err"></p>
</div>
</section>
<section class="card">
<h2>앱에서 답장을 보낼 수 있어요</h2>
<p>앱을 설치하면 ${name}님과 친구가 되고,<br>이 테이프는 서랍에 담겨요.</p>
<div class="stores"><a class="store" id="appStore" href="${escapeHtml(ctx.links.appStore)}"><span class="s">다운로드</span><span class="b">App Store</span></a><a class="store" id="googlePlay" href="${escapeHtml(ctx.links.googlePlay)}"><span class="s">다운로드</span><span class="b">Google Play</span></a></div>
<button type="button" class="open-app" id="openApp">앱에서 열기</button>
</section>
<p class="foot">앱이 없어도 이 페이지에서 ${days}일 동안 들을 수 있어요</p>
</main>
<div class="toast-wrap"><div class="toast" id="toast" hidden></div></div>
<script type="application/json" id="cfg">${safeJson(config)}</script>
<script nonce="${escapeHtml(ctx.nonce)}">${TAPE_SCRIPT}</script>
</body></html>`;

  return (
    head({
      title,
      description: `${tape.name} 테이프 · 앱이 없어도 이 페이지에서 ${days}일 동안 들을 수 있어요`,
      ctx,
      css: WEB_CSS + TAPE_CSS,
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
 * 흐름과 타이밍은 TapeletterApp.logic.js의 webUnwrap / webPlay와 같다.
 * parcel(shake) → 탭 → tearing(tearL/tearR .7s, 750ms 뒤) → play(insert .7s, 700ms 뒤 자동 재생)
 * 릴: packL = full − (full−30)·p, packR = 30 + (full−30)·p
 */
const TAPE_SCRIPT = `(function(){
${COMMON_SCRIPT}
var cfg=JSON.parse($('cfg').textContent);
var phase='parcel',audio=new Audio(),src=null,srcExp=0,loading=null;
audio.preload='auto';
function isIOS(){return /iPhone|iPad|iPod/i.test(navigator.userAgent)}
function isAndroid(){return /Android/i.test(navigator.userAgent)}
function fmt(s){s=Math.floor(s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}
function fetchUrl(){
  if(src&&Date.now()<srcExp-30000)return Promise.resolve(src);
  if(loading)return loading;
  loading=fetch('/api/share/'+encodeURIComponent(cfg.token)+'/web/audio',{method:'POST'})
    .then(function(r){return r.json().then(function(b){if(!r.ok)throw b;return b})})
    .then(function(b){src=b.url;srcExp=Date.parse(b.expiresAt)||0;audio.src=src;loading=null;return src})
    .catch(function(e){loading=null;throw e});
  return loading;
}
function showErr(e){$('err').textContent=(e&&e.message)||'테이프를 불러오지 못했어요'}
function render(){
  var d=audio.duration&&isFinite(audio.duration)?audio.duration:cfg.durationMs/1000;
  var p=Math.min(1,(audio.currentTime||0)/d),f=cfg.full;
  $('packL').style.width=$('packL').style.height=(f-(f-30)*p).toFixed(1)+'px';
  $('packR').style.width=$('packR').style.height=(30+(f-30)*p).toFixed(1)+'px';
  $('pos').textContent=fmt(audio.currentTime||0);
  $('fill').style.width=(p*100).toFixed(1)+'%';
}
function setPlaying(on){$('play').classList.toggle('on',on);$('play').setAttribute('aria-label',on?'일시 정지':'재생');$('tape').classList.toggle('spinning',on)}
function play(){
  $('err').textContent='';
  fetchUrl().then(function(){if(audio.ended)audio.currentTime=0;return audio.play()}).catch(function(e){
    setPlaying(false);
    if(e&&e.name==='NotAllowedError')return;
    showErr(e);
  });
}
audio.addEventListener('timeupdate',render);
audio.addEventListener('playing',function(){setPlaying(true)});
audio.addEventListener('pause',function(){setPlaying(false)});
audio.addEventListener('ended',function(){setPlaying(false);render()});
audio.addEventListener('error',function(){if(phase==='play'){setPlaying(false);src=null;showErr()}});
fetchUrl().catch(function(){});
$('parcel').addEventListener('click',function(){
  if(phase!=='parcel')return;
  phase='tearing';
  // iOS: 탭 제스처 안에서 한 번 재생해 두어야 나중에 자동 재생된다
  if(src){audio.muted=true;var u=audio.play();if(u&&u.then)u.then(function(){audio.pause();audio.currentTime=0;audio.muted=false}).catch(function(){audio.muted=false})}
  $('box').classList.remove('shake');$('hint').classList.add('off');
  $('halfL').classList.add('tear');$('halfR').classList.add('tear');
  setTimeout(function(){
    phase='play';$('parcel').hidden=true;$('player').hidden=false;render();
    setTimeout(play,700);
  },750);
});
$('play').addEventListener('click',function(){if(audio.paused)play();else audio.pause()});
$('openApp').addEventListener('click',function(){
  var target=isAndroid()&&cfg.androidIntentUrl?cfg.androidIntentUrl:cfg.appUrl;
  var started=Date.now();
  location.href=target;
  setTimeout(function(){
    if(document.hidden||Date.now()-started>2500)return;
    location.href=isIOS()?cfg.links.appStore:cfg.links.googlePlay;
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
