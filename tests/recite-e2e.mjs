// "Repeat after the sheikh" with recitation checking, at phone size.
// Speech recognition is replaced by a fake we control (the real one needs Google/Apple servers).
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const [base] = process.argv.slice(2);
const FX = JSON.parse(readFileSync(new URL('./tanzil-fixture.json', import.meta.url)));
const head = (c) => ({ number: c.number, name: `سُورَةُ ${c.arname}`, englishName: c.tname, englishNameTranslation: c.enname, numberOfAyahs: c.ayahs, revelationType: c.type });
const CORS = { 'Access-Control-Allow-Origin': '*' };
const rate = 8000, n = rate * 0.4, wav = Buffer.alloc(44 + n);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + n, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(n, 40); wav.fill(128, 44);
const res = []; const errs = [];
const check = (name, ok, info = '') => { res.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  — ${info}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = (p) => (/\.html$|^file:/.test(base) ? `${base}#${p}` : `${base.replace(/\/$/, '')}${p}`);

const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'], headless: true });
async function newPage({ speech = true, settings = {} } = {}) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.evaluateOnNewDocument((speech, settings) => {
    localStorage.setItem('qc:settings', JSON.stringify({ memMode: 'talqeen', lang: 'ar', reciter: 'alafasy', ...settings }));
    delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
    if (speech) {
      window.webkitSpeechRecognition = class {
        constructor() { window.__rec = this; }
        start() { window.__starts = (window.__starts || 0) + 1; this.on = true; setTimeout(() => this.on && this.onaudiostart?.(), 60); }
        abort() { this.on = false; }
        stop() { this.on = false; this.onend?.(); }
      };
    }
    window.__say = (text, final = true) => {
      const r = window.__rec; if (!r || !r.on) return false;
      const alt = { transcript: text, confidence: 0.9 }; const result = [alt]; result.isFinal = final;
      r.onresult?.({ resultIndex: 0, results: [result] }); return true;
    };
  }, speech, settings);
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    const u = r.url();
    if (u.endsWith('/v1/surah')) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 200, data: FX.chapters.map(head) }) });
    const m = u.match(/surah\/(\d+)\/quran-uthmani/);
    if (m) { const c = FX.chapters[m[1] - 1]; return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 200, data: { ...head(c), ayahs: Array.from({ length: c.ayahs }, (_, i) => ({ number: 6000 + i + 1, numberInSurah: i + 1, text: FX.verses[`${c.number}:${i + 1}`], juz: 30, page: 604, sajda: false })) } }) }); }
    if (u.includes('everyayah.com') || u.includes('islamic.network')) return r.respond({ status: 200, headers: CORS, contentType: 'audio/wav', body: wav });
    return r.continue();
  });
  return p;
}
const verseNo = (p) => p.$eval('.stage-meta .badge', (e) => e.textContent).catch(() => '');
const phaseIs = (p, cls, t = 6000) => p.waitForSelector(`.turn-panel.${cls}`, { timeout: t }).then(() => true).catch(() => false);
const say = (p, text, final = true) => p.evaluate((t, f) => window.__say(t, f), text, final);
const waitTurn = async (p) => { await p.waitForSelector('.turn-you .mic-orb.is-listening', { timeout: 6000 }); };

try {
  const p = await newPage();
  await p.goto(url('/memorize/session?surah=112&from=1&to=4'), { waitUntil: 'load' });
  if (base.startsWith('file:')) await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.turn-idle .btn-primary');
  // ---- layout at phone width ----
  const lay = await p.evaluate(() => {
    const vw = innerWidth; const out = [];
    document.querySelectorAll('.session-dock .dock-btn, .session-dock .play-btn, .session-dock .icon-btn').forEach((e) => { const r = e.getBoundingClientRect(); if (r.left < -1 || r.right > vw + 1) out.push(e.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); });
    const lines = [...document.querySelectorAll('.dock-btn span')].map((s) => Math.round(s.getBoundingClientRect().height));
    return { out, lines, overflow: document.documentElement.scrollWidth - vw };
  });
  check('Bottom bar fits the phone screen (nothing cut off)', lay.out.length === 0 && lay.overflow <= 0, lay.out.join(' | ') || `overflow ${lay.overflow}px`);
  check('Bottom bar labels on one line', lay.lines.every((h) => h < 22), `label heights ${lay.lines.join(', ')}px`);
  await p.screenshot({ path: 'phone-idle.png' });

  await p.click('.turn-idle .btn-primary');
  await waitTurn(p);
  const panelVisible = await p.evaluate(() => { const r = document.querySelector('.turn-panel').getBoundingClientRect(); const d = document.querySelector('.session-dock').getBoundingClientRect(); return r.bottom <= d.top + 1 && r.top >= 0; });
  check('Mic panel visible above the bottom bar', panelVisible);
  // ---- wrong words: must NOT move on ----
  await say(p, 'السلام عليكم ورحمة الله');
  await sleep(300);
  check('Saying other words does not move on', (await verseNo(p)).includes('١'));
  check('…and after the pause it asks to try again', await phaseIs(p, 'turn-retry', 5000));
  check('Still on verse 1', (await verseNo(p)).includes('١'), await verseNo(p));
  await p.screenshot({ path: 'phone-retry.png' });
  // ---- try again, say the verse ----
  await p.click('.turn-retry .btn-primary');
  await waitTurn(p);
  await say(p, 'قل هو', false);
  await sleep(150);
  const partial = await p.evaluate(() => ({ ok: document.querySelectorAll('.quran-marked .w-ok').length, todo: document.querySelectorAll('.quran-marked .w-todo').length }));
  check('Words light up as they are said', partial.ok >= 6 && partial.todo >= 1, `lit ${partial.ok}, not yet ${partial.todo} (Basmala counts as lit)`);
  await p.screenshot({ path: 'phone-partial.png' });
  check('Half the verse is not enough', (await verseNo(p)).includes('١'));
  await say(p, 'قل هو الله أحد');
  check('Saying the verse → "أحسنت"', await phaseIs(p, 'turn-passed', 2000));
  await p.screenshot({ path: 'phone-passed.png' });
  let ok2 = false; for (let i = 0; i < 30 && !ok2; i++) { await sleep(100); ok2 = (await verseNo(p)).includes('٢'); }
  check('…then the sheikh moves to verse 2', ok2, await verseNo(p));
  // ---- verse 2 ----
  await waitTurn(p);
  await say(p, 'الله الصمد');
  let ok3 = false; for (let i = 0; i < 40 && !ok3; i++) { await sleep(100); ok3 = (await verseNo(p)).includes('٣'); }
  check('Verse 2 said correctly → verse 3', ok3);
  // ---- verse 3: say the NEXT verse instead ----
  await waitTurn(p);
  await say(p, 'ولم يكن له كفوا أحد');
  check('Saying a different verse → try again', await phaseIs(p, 'turn-retry', 5000));
  // ---- skip ----
  await p.click('.turn-retry .btn-ghost');
  let ok4 = false; for (let i = 0; i < 30 && !ok4; i++) { await sleep(100); ok4 = (await verseNo(p)).includes('٤'); }
  check('"تخطّي" moves on', ok4);
  await waitTurn(p);
  await say(p, 'ولم يكن له كفوا أحد');
  check('Last verse said → celebration', await p.waitForSelector('.done-card .confetti', { timeout: 4000 }).then(() => true).catch(() => false));
  await p.close();

  // ---- hidden verse: words appear as you say them ----
  const h = await newPage({ settings: { hideOnTurn: true } });
  await h.goto(url('/memorize/session?surah=1&from=2&to=3'), { waitUntil: 'load' });
  if (base.startsWith('file:')) await h.reload({ waitUntil: 'load' });
  await h.waitForSelector('.turn-idle .btn-primary'); await h.click('.turn-idle .btn-primary'); await waitTurn(h);
  await say(h, 'الحمد لله', false); await sleep(150);
  const masked = await h.evaluate(() => [...document.querySelectorAll('.quran-marked.is-masked .w-todo')].map((e) => getComputedStyle(e).color));
  check('Hidden mode: unsaid words stay covered, said ones appear', masked.length === 2 && masked.every((c) => c === 'rgba(0, 0, 0, 0)'), `${masked.length} covered`);
  await h.screenshot({ path: 'phone-masked.png' });
  await h.close();

  // ---- browser without speech recognition ----
  const q = await newPage({ speech: false });
  await q.goto(url('/memorize/session?surah=112&from=1&to=2'), { waitUntil: 'load' });
  if (base.startsWith('file:')) await q.reload({ waitUntil: 'load' });
  await q.waitForSelector('.turn-idle .btn-primary');
  check('Unsupported browser is told up front', ((await q.$eval('.turn-idle', (e) => e.textContent)) || '').includes('Chrome أو Safari'));
  await q.click('.turn-idle .btn-primary');
  check('…turn shows the reason + manual button (no auto-advance)', await phaseIs(q, 'turn-you', 5000) && ((await q.$eval('.turn-panel', (e) => e.textContent)) || '').includes('قرأتها'));
  await sleep(2500);
  check('…does not move on by itself', (await verseNo(q)).includes('١'));
  await q.click('.turn-actions .btn-primary');
  let mv = false; for (let i = 0; i < 20 && !mv; i++) { await sleep(100); mv = (await verseNo(q)).includes('٢'); }
  check('…"قرأتها، التالي" moves on', mv);
} catch (e) { check('no exceptions', false, e.stack); }
const bad = errs.filter((e) => !/getUserMedia|NotAllowed|\[mic\]|favicon|404/.test(e));
check('No unexpected console errors', bad.length === 0, bad.slice(0, 3).join(' | '));
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
await b.close();
process.exit(res.every(Boolean) ? 0 : 1);
