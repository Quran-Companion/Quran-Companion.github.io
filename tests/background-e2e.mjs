// Screen-off playback: with the page's rendering and timers frozen (as a phone does when locked),
// only audio events still run. Recitation must continue verse after verse to the end by itself.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const [file] = process.argv.slice(2);
const FX = JSON.parse(readFileSync(new URL('./tanzil-fixture.json', import.meta.url)));
const head = (c) => ({ number: c.number, name: `سُورَةُ ${c.arname}`, englishName: c.tname, englishNameTranslation: c.enname, numberOfAyahs: c.ayahs, revelationType: c.type });
const CORS = { 'Access-Control-Allow-Origin': '*' };
const RATE = 8000; const n = RATE * 0.5; const wav = Buffer.alloc(44 + n);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + n, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(n, 40);
for (let i = 0; i < n; i++) wav[44 + i] = Math.round(128 + 60 * Math.sin(i / 3));
const res = []; const check = (name, ok, info = '') => { res.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  — ${info}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
async function run({ surah, from, to, settings, reader = false }) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true });
  await p.evaluateOnNewDocument((s) => {
    localStorage.setItem('qc:settings', JSON.stringify({ lang: 'ar', reciter: 'alafasy', ...s }));
    window.__played = [];
    // ---- "screen off": page work (renders, timers, frames) is held back; media events still fire ----
    window.__off = false; const held = [];
    const hold = (fn) => (...a) => (window.__off ? held.push(() => fn(...a)) : fn(...a));
    const PM = MessagePort.prototype.postMessage; MessagePort.prototype.postMessage = function (...a) { return window.__off ? held.push(() => PM.apply(this, a)) : PM.apply(this, a); };
    const ST = window.setTimeout; window.setTimeout = (f, ms, ...a) => ST(hold(f), ms, ...a);
    const RAF = window.requestAnimationFrame; window.requestAnimationFrame = (f) => RAF(hold(f));
    window.__wake = () => { window.__off = false; held.splice(0).forEach((f) => f()); };
    const P = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...a) { const s = String(this.src); if (!s.startsWith('data:')) window.__played.push({ file: s.split('/').pop(), off: window.__off }); return P.apply(this, a); };
  }, settings);
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    const u = r.url();
    if (u.endsWith('/v1/surah')) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 200, data: FX.chapters.map(head) }) });
    const m = u.match(/surah\/(\d+)\/quran-uthmani/);
    if (m) { const c = FX.chapters[m[1] - 1]; return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 200, data: { ...head(c), ayahs: Array.from({ length: c.ayahs }, (_, i) => ({ number: 1000 + i + 1, numberInSurah: i + 1, text: FX.verses[`${c.number}:${i + 1}`], juz: 30, page: 600, sajda: false })) } }) }); }
    if (u.includes('everyayah.com') || u.includes('islamic.network')) return r.respond({ status: 200, headers: CORS, contentType: 'audio/wav', body: wav });
    return r.continue();
  });
  await p.goto(reader ? `${file}#/quran/${surah}` : `${file}#/memorize/session?surah=${surah}&from=${from}&to=${to}`, { waitUntil: 'load' });
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.play-btn');
  await sleep(300);
  await p.click('.play-btn');
  await sleep(250);
  await p.evaluate(() => { window.__off = true; }); // lock the phone
  return p;
}
const verseNo = (p) => p.$eval('.session-meta, .verse-count, .session-head', (e) => e.textContent).catch(() => '');

// 1) Al-Ikhlas, 4 verses: lock right after it starts
let p = await run({ surah: 112, from: 1, to: 4, settings: { memMode: 'listen', repeatVerse: 1, repeatRange: 1, autoNext: true } });
await sleep(6000);
let pl = await p.evaluate(() => window.__played);
const files = pl.map((x) => x.file);
console.log('   played:', files.join(' → '));
check('Screen off: keeps reciting verse after verse to the end of the surah', ['112001.mp3', '112002.mp3', '112003.mp3', '112004.mp3'].every((f) => files.includes(f)), files.join(','));
check('…with the page not updating at all meanwhile (all started while "locked")', pl.filter((x) => /11200[234]/.test(x.file)).every((x) => x.off));
await p.evaluate(() => window.__wake());
await sleep(800);
const hdr = await p.evaluate(() => document.body.innerText);
check('Unlock: the screen catches up to the last verse', /آية\s*٤\s*من\s*٤/.test(hdr) || hdr.includes('أتممت') || hdr.includes('ما شاء'), hdr.slice(0, 80).replace(/\s+/g, ' '));

// 2) Repeat each verse 2× and the whole range 2× with the screen off
p = await run({ surah: 112, from: 1, to: 2, settings: { memMode: 'listen', repeatVerse: 2, repeatRange: 2, autoNext: true } });
await sleep(7000);
pl = await p.evaluate(() => window.__played.map((x) => x.file).filter((f) => /^11200/.test(f)));
console.log('   played:', pl.join(' → '));
const v1 = pl.filter((f) => f === '112001.mp3').length; const v2 = pl.filter((f) => f === '112002.mp3').length;
check('Screen off with repeats: verse ×2 and range ×2 all play', v1 >= 2 && v2 >= 2 && pl.filter((f) => f === '001001.mp3' || f === '112001.mp3').length >= 2, `112:1 ×${v1}, 112:2 ×${v2}`);

// 3) A long surah (Al-Mulk, 30 verses, first 12)
p = await run({ surah: 67, from: 1, to: 12, settings: { memMode: 'listen', repeatVerse: 1, repeatRange: 1, autoNext: true } });
await sleep(12000);
pl = await p.evaluate(() => window.__played.map((x) => x.file).filter((f) => /^067/.test(f)));
check('Screen off: 12 verses of Al-Mulk in a row', pl.includes('067012.mp3'), `${pl.length} verses played, last ${pl[pl.length - 1]}`);
// 4) The Quran reading page (المصحف): Al-Mulk from the start, screen off
p = await run({ surah: 67, settings: {}, reader: true });
await sleep(10000);
pl = await p.evaluate(() => window.__played.map((x) => x.file).filter((f) => /^067/.test(f)));
check('Reading page (المصحف), screen off: keeps going verse after verse', pl.length >= 10 && pl.includes('067010.mp3'), `${pl.length} verses played, last ${pl[pl.length - 1]}`);
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
await b.close();
