import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const [base] = process.argv.slice(2);
const FX = JSON.parse(readFileSync(new URL('./tanzil-fixture.json', import.meta.url)));
const head = (c) => ({ number: c.number, name: `سُورَةُ ${c.arname}`, englishName: c.tname, englishNameTranslation: c.enname, numberOfAyahs: c.ayahs, revelationType: c.type });
const CORS = { 'Access-Control-Allow-Origin': '*' };
const rate = 8000, n = rate * 0.3, wav = Buffer.alloc(44 + n);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + n, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(n, 40); wav.fill(128, 44);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = [];
const check = (name, ok, info = '') => { res.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  — ${info}` : ''}`); };
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--autoplay-policy=no-user-gesture-required'], headless: true });
async function run(surah, to, settings, failIntro = false) {
  const p = await b.newPage();
  const played = [];
  await p.evaluateOnNewDocument((s) => localStorage.setItem('qc:settings', JSON.stringify({ lang: 'ar', reciter: 'minshawi', ...s })), settings);
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    const u = r.url();
    if (u.endsWith('/v1/surah')) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 200, data: FX.chapters.map(head) }) });
    const m = u.match(/surah\/(\d+)\/quran-uthmani/);
    if (m) { const c = FX.chapters[m[1] - 1]; return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 200, data: { ...head(c), ayahs: Array.from({ length: c.ayahs }, (_, i) => ({ number: 1000 + i + 1, numberInSurah: i + 1, text: FX.verses[`${c.number}:${i + 1}`], juz: 1, page: 1, sajda: false })) } }) }); }
    if (u.includes('everyayah.com') || u.includes('islamic.network')) {
      const f = u.split('/').slice(-2).join('/');
      if (failIntro && /001001\.mp3|\/1\.mp3$/.test(u)) { played.push('FAIL:' + f); return r.respond({ status: 404, headers: CORS, body: '' }); }
      return r.respond({ status: 200, headers: CORS, contentType: 'audio/wav', body: wav });
    }
    return r.continue();
  });
  // Record which files actually start PLAYING (not just preloads).
  await p.exposeFunction('__played', (src) => played.push('PLAY:' + src.split('/').slice(-2).join('/')));
  await p.evaluateOnNewDocument(() => { const A = window.Audio; window.Audio = function (...a) { const el = new A(...a); el.addEventListener('playing', () => window.__played(el.currentSrc.startsWith('data:') ? 'x/SILENCE' : el.currentSrc)); return el; }; window.Audio.prototype = A.prototype; });
  const url = `${base}#/memorize/session?surah=${surah}&from=1&to=${to}`;
  await p.goto(url, { waitUntil: 'load' }); await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.play-btn'); await sleep(300);
  await p.click('.play-btn');
  await sleep(4500);
  await p.close();
  return played.filter((x) => x.startsWith('PLAY:') || x.startsWith('FAIL:')).map((x) => x.replace(/^PLAY:[^/]+\//, '').replace(/^FAIL:[^/]+\//, 'FAIL '));
}
let o = await run(112, 1, { memMode: 'listen', repeatVerse: 1, autoNext: true, reciter: 'alafasy' });
check('Alafasy: short silence first, then the full Basmala, then the verse', o.slice(0, 3).join(' → ') === 'SILENCE → 001001.mp3 → 112001.mp3', o.join(' → '));
o = await run(112, 3, { memMode: 'listen', repeatVerse: 1, autoNext: true });
check('Silence only at the start, not between verses', o.filter((x) => x === 'SILENCE').length === 1, o.join(' → '));
o = await run(112, 2, { memMode: 'listen', repeatVerse: 1, autoNext: true });
check('Al-Ikhlas: Basmala (001001) then verse 1, then verse 2', o.filter((x)=>x!=='SILENCE').slice(0, 3).join(' → ') === '001001.mp3 → 112001.mp3 → 112002.mp3', o.join(' → '));
o = await run(112, 1, { memMode: 'listen', repeatVerse: 3, autoNext: true });
check('Repeating verse 1 ×3: Basmala only the first time', o.filter((x)=>x!=='SILENCE').join(' → ') === '001001.mp3 → 112001.mp3 → 112001.mp3 → 112001.mp3', o.join(' → '));
o = await run(1, 2, { memMode: 'listen', repeatVerse: 1, autoNext: true });
check('Al-Fatiha: verse 1 IS the Basmala, not played twice', o.filter((x)=>x!=='SILENCE').slice(0, 2).join(' → ') === '001001.mp3 → 001002.mp3', o.join(' → '));
o = await run(9, 1, { memMode: 'listen', repeatVerse: 1, autoNext: true });
check('At-Tawbah: no Basmala', o.filter((x)=>x!=='SILENCE')[0] === '009001.mp3', o.join(' → '));
o = await run(112, 1, { memMode: 'listen', repeatVerse: 1, autoNext: true }, true);
check('If the Basmala file fails, the verse still plays', o.includes('112001.mp3'), o.join(' → '));
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
await b.close();
