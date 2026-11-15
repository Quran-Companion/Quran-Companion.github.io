// "Repeat after the sheikh" with recitation checking, at phone size.
// Speech recognition is replaced by a fake we control (the real one needs Google/Apple servers).
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const [base, flag] = process.argv.slice(2);
const RANGES = flag !== '--no-ranges';
console.log(RANGES ? '(server supports partial downloads, like EveryAyah)' : '(server without partial downloads)');
const FX = JSON.parse(readFileSync(new URL('./tanzil-fixture.json', import.meta.url)));
const head = (c) => ({ number: c.number, name: `سُورَةُ ${c.arname}`, englishName: c.tname, englishNameTranslation: c.enname, numberOfAyahs: c.ayahs, revelationType: c.type });
const CORS = { 'Access-Control-Allow-Origin': '*' };

import { skeleton } from '/home/claude/quran-companion/src/lib/recite.js';
const res = []; const errs = [];
const check = (name, ok, info = '') => { res.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  — ${info}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = (p) => `${base}#${p}`;
// TEST DATA ONLY: the live text has pause marks as separate tokens; this fixture doesn't, so put them
// after the same words the live 2:255 has them (ٱلْقَيُّومُ نَوْمٌ ٱلْأَرْضِ بِإِذْنِهِۦ خَلْفَهُمْ شَآءَ ٱلْأَرْضَ حِفْظُهُمَا).
const AFTER = ['لقيوم', 'نوم', 'لرض', 'بذنه', 'خلفهم', 'ش', 'ولرض', 'حفظهم'];
const tokens = []; { const want = [...AFTER]; for (const w of FX.verses['2:255'].split(' ')) { tokens.push(w); if (want.length && skeleton(w) === want[0]) { tokens.push('ۚ'); want.shift(); } } }
const V255 = tokens.join(' ');
// A recording that sounds like a reciter: voice for each stretch between marks, a 0.6 s breath at each mark.
const groups = []; { let g = []; for (const w of tokens) { if (w === 'ۚ') { groups.push(g); g = []; } else g.push(w); } groups.push(g); }
const RATE = 8000, PER_LETTER = 0.045, BREATH = 0.6;
function makeWav(stopAt) { // stopAt: after which groups he stops (others: a tiny 0.08 s gap)
  const spans = []; let tcur = 0.15; const pcm = []; const stops = [];
  const push = (sec, voiced) => { const n = Math.round(sec * RATE); for (let i = 0; i < n; i++) pcm.push(voiced ? Math.round(128 + 70 * Math.sin((2 * Math.PI * 220 * i) / RATE)) : 128); };
  push(0.15, false);
  groups.forEach((g, k) => {
    const d = g.map(skeleton).join('').length * PER_LETTER; push(d, true); const s0 = tcur; tcur += d; spans.push([s0, tcur]);
    if (k < groups.length - 1) { const gap = stopAt.includes(k) ? BREATH : 0.08; push(gap, false); if (gap === BREATH) stops.push([tcur, tcur + gap]); tcur += gap; }
  });
  push(0.2, false);
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40); Buffer.from(pcm).copy(wav, 44);
  return { wav, stops, end: tcur };
}
const ALL = makeWav([...Array(groups.length - 1).keys()]);
const SOME = makeWav([1, 4, 6]);
const silences = ALL.stops;
const wav = ALL.wav;
const short = Buffer.alloc(44 + 2400); ALL.wav.copy(short, 0, 0, 44); short.writeUInt32LE(36 + 2400, 4); short.writeUInt32LE(2400, 40); for (let i = 0; i < 2400; i++) short[44 + i] = Math.round(128 + 70 * Math.sin(i / 2));
const inSilence = (t, sil = silences) => sil.some(([a, b2]) => t >= a - 0.02 && t <= b2 + 0.02);
const plainOf = (ws) => ws.map((w) => w.replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')).filter(Boolean).join(' ');
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'], headless: true });
async function newPage({ speech = true, settings = {}, cors = true, ranges = RANGES, rec } = {}) {
  const opts = { cors, ranges, rec };
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
      // Like Chrome: results accumulate within a session; a pending (interim) result is replaced.
      const r = window.__rec; if (!r || !r.on) return false;
      r.__res ||= [];
      const item = Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: final });
      const last = r.__res[r.__res.length - 1];
      let idx;
      if (last && !last.isFinal) { idx = r.__res.length - 1; r.__res[idx] = item; } else { idx = r.__res.length; r.__res.push(item); }
      r.onresult?.({ resultIndex: idx, results: r.__res.slice() }); return true;
    };
    // Chrome on Android quirk: resultIndex 0 and every final repeats everything said before it.
    window.__androidSay = (text) => {
      const r = window.__rec; if (!r || !r.on) return false;
      r.__acc = r.__acc ? `${r.__acc} ${text}` : text;
      r.__res ||= [];
      r.__res.push(Object.assign([{ transcript: r.__acc, confidence: 0.9 }], { isFinal: true }));
      r.onresult?.({ resultIndex: 0, results: r.__res.slice() }); return true;
    };
    // The browser ends the session by itself (e.g. after silence); the app must restart and keep what was said.
    window.__endSession = () => { const r = window.__rec; if (!r) return; r.on = false; r.onend?.(); };
  }, speech, settings);

  await p.evaluateOnNewDocument(() => {
    window.__plays = [];
    const add = (el) => {
      if (el.__w) return; el.__w = 1;
      el.addEventListener('playing', () => { if (!el.currentSrc.startsWith('data:')) window.__plays.push({ src: el.currentSrc.startsWith('blob:') ? 'blob' : el.currentSrc.split('/').pop(), from: el.currentTime }); });
      el.addEventListener('pause', () => { const l = window.__plays[window.__plays.length - 1]; if (l && l.to === undefined && !el.currentSrc.startsWith('data:')) l.to = el.currentTime; });
    };
    const P = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...a) { add(this); return P.apply(this, a); };
  });
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    const u = r.url();
    if (u.endsWith('/v1/surah')) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 200, data: FX.chapters.map(head) }) });
    const m = u.match(/surah\/(\d+)\/quran-uthmani/);
    if (m) { const c = FX.chapters[m[1] - 1]; return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 200, data: { ...head(c), ayahs: Array.from({ length: c.ayahs }, (_, i) => ({ number: 6000 + i + 1, numberInSurah: i + 1, text: c.number === 2 && i === 254 ? V255 : FX.verses[`${c.number}:${i + 1}`], juz: 3, page: 42, sajda: false })) } }) }); }
    if (u.includes('everyayah.com') || u.includes('islamic.network')) {
      const body = /002255\.mp3|\/262\.mp3$/.test(u) ? (opts.rec || ALL).wav : short;
      const hdr = opts.cors === false ? {} : { ...CORS };
      const rg = opts.ranges && (r.headers().range || '').match(/bytes=(\d+)-(\d*)/);
      if (rg) { // like a real web server: serve the requested piece of the file
        const a = +rg[1]; const e = rg[2] ? Math.min(+rg[2], body.length - 1) : body.length - 1;
        return r.respond({ status: 206, headers: { ...hdr, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${a}-${e}/${body.length}` }, contentType: 'audio/wav', body: body.subarray(a, e + 1) });
      }
      return r.respond({ status: 200, headers: opts.ranges ? { ...hdr, 'Accept-Ranges': 'bytes' } : hdr, contentType: 'audio/wav', body });
    }
    return r.continue();
  });
  return p;
}
const plays = (p) => p.evaluate(() => window.__plays.filter((x) => /002255|262|blob/.test(x.src)));
const phaseIs = (p, cls, t = 8000) => p.waitForSelector(`.turn-panel.${cls}`, { timeout: t }).then(() => true).catch(() => false);
const say = (p, text) => p.evaluate((t) => window.__say(t, true), text);
const badge = (p) => p.$eval('.part-badge', (e) => e.textContent).catch(() => '');
const wordsOf = (p) => p.$$eval('.stage-card .quran-marked > span:not(.ayah-num)', (e) => e.map((x) => x.className.replace('w-', ''))).catch(() => []);

try {
  const p = await newPage({ settings: { memMode: 'talqeen', reciter: 'alafasy' } });
  await p.goto(url('/memorize/session?surah=2&from=255&to=255'), { waitUntil: 'load' });
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.turn-idle .btn-primary');
  await p.click('.turn-idle .btn-primary');
  check('Long verse → the sheikh starts with part 1', await p.waitForSelector('.turn-sheikh .part-badge', { timeout: 8000 }).then(() => true).catch(() => false));
  const nParts = Number((await badge(p)).match(/من (\S+)/)?.[1]?.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  check('Badge "الجزء ١ من …" shown', (await badge(p)).includes('الجزء ١ من'), `${await badge(p)} (${nParts} parts)`);
  let k = await wordsOf(p);
  check('Later parts are faded while he recites part 1', k.includes('dim') && k[0] !== 'dim', k.join(','));
  const inView = await p.evaluate(() => { const el = document.querySelector('.stage-card .quran-marked > span.w-todo'); const r = el.getBoundingClientRect(); const panel = document.querySelector('.turn-panel').getBoundingClientRect(); return r.top >= 0 && r.bottom <= panel.top; });
  check('The part being recited is in view (not under the panel)', inView);
  await p.screenshot({ path: 'parts-sheikh.png' });
  const sheikhParts = [];
  for (let part = 0; part < nParts; part++) {
    check(`Part ${part + 1}: mic opens after the sheikh`, await phaseIs(p, 'turn-you', 20000));
    const pl = (await plays(p)).pop();
    sheikhParts.push(pl);
    const want = await p.evaluate(() => document.querySelectorAll('.stage-card .quran-marked > span.w-todo').length);
    // the words of this part (what you have to repeat)
    const partWords = await p.$$eval('.stage-card .quran-marked > span.w-todo', (e) => e.map((x) => x.textContent));
    if (part === 2) await p.screenshot({ path: 'parts-you.png' });
    const vis = await p.evaluate(() => { const el = document.querySelector('.stage-card .quran-marked > span.w-todo'); const r = el.getBoundingClientRect(); const panel = document.querySelector('.turn-panel').getBoundingClientRect(); return r.top >= 0 && r.bottom <= panel.top; });
    if (!vis) check(`Part ${part + 1} in view on your turn`, false);
    await say(p, plainOf(partWords));
    if (part < nParts - 1) {
      check(`Part ${part + 1}: saying it → "أحسنت" then the sheikh says part ${part + 2}`, await phaseIs(p, 'turn-sheikh', 4000) && (await badge(p)).includes(`الجزء ${'٠١٢٣٤٥٦٧٨٩'[part + 2]}`), await badge(p));
    }
  }
  check('After the last part → range finished', await p.waitForSelector('.done-card', { timeout: 4000 }).then(() => true).catch(() => false));
  const fmt = (x) => `${x.from.toFixed(2)}→${(x.to ?? NaN).toFixed(2)}`;
  console.log('   sheikh played:', sheikhParts.map(fmt).join('  '), '\n   silences:', silences.map(([a, b2]) => `${a.toFixed(2)}–${b2.toFixed(2)}`).join(' '));
  check('Part 1 starts at the beginning', sheikhParts[0].from < 0.2);
  check('Plays from the local copy (no second download, jumps always work)', sheikhParts.slice(1).every((x) => x.src === 'blob'), sheikhParts.map((x) => x.src).join(','));
  check('Every cut lands inside one of his breaths (never mid-word)', sheikhParts.slice(0, -1).every((x) => inSilence(x.to)) && sheikhParts.slice(1).every((x) => inSilence(x.from)), sheikhParts.map(fmt).join(' '));
  check('Each part starts where the previous one stopped (nothing skipped or repeated)', sheikhParts.slice(1).every((x, i) => x.from >= sheikhParts[i].to - 0.05 && x.from - sheikhParts[i].to < BREATH + 0.1));
  check('Last part plays to the end', sheikhParts[nParts - 1].to === undefined || sheikhParts[nParts - 1].to > ALL.end - 0.1, fmt(sheikhParts[nParts - 1]));
  check('He stops at every mark here → one part per stop', nParts === ALL.stops.length + 1, `${nParts} parts, ${ALL.stops.length} stops`);

  // ---- a sheikh who stops at only some marks: the parts follow HIS stops ----
  const w2 = await newPage({ settings: { memMode: 'talqeen', reciter: 'husary' }, rec: SOME });
  await w2.goto(url('/memorize/session?surah=2&from=255&to=255'), { waitUntil: 'load' });
  await w2.reload({ waitUntil: 'load' });
  await w2.waitForSelector('.turn-idle .btn-primary');
  await w2.click('.turn-idle .btn-primary');
  await w2.waitForSelector('.turn-sheikh .part-badge', { timeout: 8000 }).catch(() => {});
  check('Stops at 3 places → 4 parts', (await badge(w2)).includes('من ٤'), await badge(w2));
  const lastWords = [];
  for (let part = 0; part < 4; part++) {
    await phaseIs(w2, 'turn-you', 20000);
    const pw = await w2.$$eval('.stage-card .quran-marked > span.w-todo', (e) => e.map((x) => x.textContent));
    lastWords.push(pw.filter((x) => x !== 'ۚ').pop());
    await say(w2, plainOf(pw));
    if (part < 3) await w2.waitForSelector(`.part-badge`, { timeout: 4000 }).catch(() => {});
    await sleep(900);
  }
  const want = [1, 4, 6].map((k) => groups[k][groups[k].length - 1]);
  check('Each part ends exactly where he stopped', lastWords.slice(0, 3).join() === want.join(), `${lastWords.slice(0, 3).join(' | ')}  (he stopped after: ${want.join(' | ')})`);
  const pl2 = (await plays(w2));
  check('…and every cut is inside his stop', pl2.slice(0, 3).every((x) => inSilence(x.to, SOME.stops)), pl2.map(fmt).join(' '));

  // ---- recording can't be analysed (no CORS) → estimated cuts, still works ----
  const q = await newPage({ settings: { memMode: 'talqeen', reciter: 'alafasy' }, cors: false });
  await q.goto(url('/memorize/session?surah=2&from=255&to=255'), { waitUntil: 'load' });
  await q.reload({ waitUntil: 'load' });
  await q.waitForSelector('.turn-idle .btn-primary');
  await q.click('.turn-idle .btn-primary');
  check('No analysis possible: still goes part by part', await phaseIs(q, 'turn-you', 20000) && (await badge(q)).includes('الجزء ١'));
  const est = (await plays(q)).pop();
  check('…cut estimated near the right place (within 1.5 s of his breath)', est && Math.min(...silences.map(([a, b2]) => (est.to < a ? a - est.to : est.to > b2 ? est.to - b2 : 0))) < 1.5, est && fmt(est));

  // ---- settings ----
  const r = await newPage({ settings: { memMode: 'talqeen', reciter: 'alafasy', talqeenSplit: 'off' } });
  await r.goto(url('/memorize/session?surah=2&from=255&to=255'), { waitUntil: 'load' });
  await r.reload({ waitUntil: 'load' });
  await r.waitForSelector('.turn-idle .btn-primary');
  await r.click('.turn-idle .btn-primary');
  await phaseIs(r, 'turn-sheikh'); await sleep(800);
  check('"كاملة" setting: no parts', !(await badge(r)));
  const s2 = await newPage({ settings: { memMode: 'talqeen', reciter: 'alafasy', talqeenSplit: 'short' }, rec: SOME });
  await s2.goto(url('/memorize/session?surah=2&from=255&to=255'), { waitUntil: 'load' });
  await s2.reload({ waitUntil: 'load' });
  await s2.waitForSelector('.turn-idle .btn-primary');
  await s2.click('.turn-idle .btn-primary');
  await s2.waitForSelector('.part-badge', { timeout: 8000 }).catch(() => {});
  const nShort = (await badge(s2)).match(/من (\S+)/)?.[1];
  check('"أجزاء أصغر": long stretches he reads in one go are split further (more than his 4)', nShort && '٠١٢٣٤٥٦٧٨٩'.indexOf(nShort) > 4, `${nShort} parts`);
  const t1 = await newPage({ settings: { memMode: 'talqeen', reciter: 'alafasy' } });
  await t1.goto(url('/memorize/session?surah=112&from=1&to=2'), { waitUntil: 'load' });
  await t1.reload({ waitUntil: 'load' });
  await t1.waitForSelector('.turn-idle .btn-primary');
  await t1.click('.turn-idle .btn-primary');
  await phaseIs(t1, 'turn-sheikh'); await sleep(800);
  check('Short verses are not split', !(await badge(t1)));
  await t1.click('.session-head .icon-btn:last-child');
  await sleep(300);
  check('Setting "الآيات الطويلة" is in the talqeen settings', (await t1.$$eval('.set-row span', (e) => e.map((x) => x.textContent))).includes('الآيات الطويلة'));
} catch (e) { check('Run completed', false, e.stack); }
const bad = errs.filter((e) => !/Failed to load resource|CORS|Access-Control/i.test(e));
check('No console errors', bad.length === 0, bad.slice(0, 3).join(' | '));
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
await b.close();
