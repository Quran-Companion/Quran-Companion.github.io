// Tests "repeat after the sheikh" with a fake microphone (Chrome flag) fed from fake-voice.wav.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const [mode, base] = process.argv.slice(2);
const FX = JSON.parse(readFileSync(new URL('./tanzil-fixture.json', import.meta.url)));
const head = (c) => ({ number: c.number, name: `سُورَةُ ${c.arname}`, englishName: c.tname, englishNameTranslation: c.enname, numberOfAyahs: c.ayahs, revelationType: c.type });
const CORS = { 'Access-Control-Allow-Origin': '*' };
const rate = 8000, n = rate * 0.4, wav = Buffer.alloc(44 + n);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + n, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(n, 40); wav.fill(128, 44);
const results = []; const errs = [];
const check = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  — ${info}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = (p) => (mode === 'file' ? `${base}#${p}` : `${base}${p}`);

async function newPage(b, { denyMic = false } = {}) {
  const p = await b.newPage();
  await p.setViewport({ width: 1100, height: 900 });
  if (process.env.CSS) await p.evaluateOnNewDocument((css) => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }), process.env.CSS);
  if (process.env.SLOW) { const c = await p.createCDPSession(); await c.send('Emulation.setCPUThrottlingRate', { rate: +process.env.SLOW }); }
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  if (denyMic) await p.evaluateOnNewDocument(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })); });
  await p.evaluateOnNewDocument(() => localStorage.setItem('qc:settings', JSON.stringify({ memMode: 'talqeen', lang: 'ar' })));
  // Instrumentation: when the sheikh's audio ends, when the mic starts listening, and any page freezes.
  await p.evaluateOnNewDocument(() => {
    window.__ended = []; window.__listen = []; window.__long = [];
    const A = window.Audio;
    window.Audio = function (...a) { const el = new A(...a); el.addEventListener('ended', () => window.__ended.push(performance.now())); return el; };
    window.Audio.prototype = A.prototype;
    new MutationObserver(() => {
      const o = document.querySelector('.mic-orb');
      const st = o?.getAttribute('data-status');
      if (st === 'waiting' && o.__seen !== true) { o.__seen = true; window.__listen.push(performance.now()); }
      if (st !== 'waiting' && o) o.__seen = false;
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-status'] });
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration) + '@' + Math.round(e.startTime)))).observe({ type: 'longtask', buffered: true }); } catch {}
  });
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    const u = r.url();
    if (u.endsWith('/v1/surah')) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 200, data: FX.chapters.map(head) }) });
    const m = u.match(/surah\/(\d+)\/quran-uthmani/);
    if (m) { const c = FX.chapters[m[1] - 1]; return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 200, data: { ...head(c), ayahs: Array.from({ length: c.ayahs }, (_, i) => ({ number: 6221 + i + 1, numberInSurah: i + 1, text: FX.verses[`${c.number}:${i + 1}`], juz: 30, page: 604, sajda: false })) } }) }); }
    if (u.includes('everyayah.com') || u.includes('islamic.network')) return r.respond({ status: 200, headers: CORS, contentType: 'audio/wav', body: wav });
    return r.continue();
  });
  return p;
}
const verseNow = (p) => p.$eval('.stage-meta .badge', (e) => e.textContent).catch(() => '');

const b = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args, '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${new URL('./fake-voice.wav', import.meta.url).pathname}%noloop`],
  headless: true,
});
try {
  const p = await newPage(b);
  await p.goto(url('/memorize/session?surah=112&from=1&to=4'), { waitUntil: 'load' });
  if (mode === 'file') await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.turn-idle .btn-primary', { timeout: 8000 });
  check('Talqeen mode shows the start panel', true, await p.$eval('.mode-chip', (e) => e.textContent));
  const tStart = await p.evaluate(() => performance.now());
  let prof = null;
  if (process.env.PROFILE) { prof = await p.createCDPSession(); await prof.send('Profiler.enable'); await prof.send('Profiler.setSamplingInterval', { interval: 200 }); await prof.send('Profiler.start'); await prof.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReturnAsStream' }).catch(() => {}); }
  await p.click('.turn-idle .btn-primary');
  check('Sheikh phase shown first', await p.waitForSelector('.turn-sheikh', { timeout: 3000 }).then(() => true).catch(() => false));
  check('Then the mic opens: "your turn"', await p.waitForSelector('.mic-orb', { timeout: 5000 }).then(() => true).catch(() => false));
  check('Verse 1 while waiting for me', (await verseNow(p)).includes('١'), await verseNow(p));
  const spoke = await p.waitForSelector('.mic-orb.is-speaking', { timeout: 6000 }).then(() => true).catch(() => false);
  check('My voice is detected', spoke);
  let moved = false;
  for (let i = 0; i < 40 && !moved; i++) { await sleep(150); moved = (await verseNow(p)).includes('٢'); }
  check('After I stop talking, the sheikh moves to verse 2', moved, await verseNow(p));
  check('…and it becomes my turn again', await p.waitForSelector('.mic-orb', { timeout: 6000 }).then(() => true).catch(() => false));
  await p.click('.turn-actions .btn-ghost'); // "انتهيت"
  let m3 = false;
  for (let i = 0; i < 30 && !m3; i++) { await sleep(150); m3 = (await verseNow(p)).includes('٣'); }
  check('"انتهيت" button also moves on', m3, await verseNow(p));
  await p.click('.play-btn'); // stop
  await sleep(300);
  check('Play button stops the loop', (await p.$$('.turn-idle')).length === 1);
  if (prof) {
    const { profile } = await prof.send('Profiler.stop');
    const self = new Map(); const total = profile.samples.length;
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    for (const id of profile.samples) { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop().slice(0, 20)}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + 1); }
    console.log('TOP self time:'); [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).forEach(([k, v]) => console.log('  ', (v / total * 100).toFixed(1) + '%', k));
  }
  const m = await p.evaluate(() => ({ ended: window.__ended, listen: window.__listen, long: window.__long }));
  console.log('ended', m.ended.map(Math.round).join(','), 'listen', m.listen.map(Math.round).join(','));
  const lat = m.ended.map((e) => { const l = m.listen.find((x) => x >= e); return l ? Math.round(l - e) : null; }).filter((x) => x !== null);
  check('Mic starts listening right after the sheikh stops (< 120 ms each turn)', lat.length >= 2 && lat.every((x) => x < 120), `delays: ${lat.join(', ')} ms`);
  const during = m.long.filter((x) => +x.split('@')[1] > tStart);
  console.log('LONGSUM', during.reduce((a, x) => a + parseInt(x), 0), during.length);
  check('No freezes while memorizing (no task > 100 ms after Start)', during.every((x) => parseInt(x) < 100), `after start: ${during.join(', ') || 'none'}; page load: ${m.long.filter((x) => +x.split('@')[1] <= tStart).join(', ') || 'none'}`);
  await p.screenshot({ path: `talqeen-${mode}.png` });
  await p.close();

  // Mic blocked → manual "I recited it" fallback
  const q = await newPage(b, { denyMic: true });
  await q.goto(url('/memorize/session?surah=112&from=1&to=2'), { waitUntil: 'load' });
  if (mode === 'file') await q.reload({ waitUntil: 'load' });
  await q.waitForSelector('.turn-idle .btn-primary', { timeout: 8000 });
  await q.click('.turn-idle .btn-primary');
  const manual = await q.waitForSelector('.turn-panel .icon', { timeout: 5000 }).then(() => q.waitForFunction(() => document.querySelector('.turn-panel')?.textContent.includes('قرأتها'), { timeout: 5000 })).then(() => true).catch(() => false);
  check('Mic blocked → explains and offers "قرأتها، التالي"', manual, await q.$eval('.turn-panel', (e) => e.textContent.slice(0, 70)).catch(() => ''));
  await q.click('.turn-actions .btn-primary');
  let mv = false;
  for (let i = 0; i < 20 && !mv; i++) { await sleep(150); mv = (await verseNow(q)).includes('٢'); }
  check('Manual button moves to the next verse', mv);
  // finish last verse → celebration
  await q.waitForFunction(() => document.querySelector('.turn-panel')?.textContent.includes('قرأتها'), { timeout: 6000 }).catch(() => {});
  await q.click('.turn-actions .btn-primary');
  check('Finishing the range shows the celebration', await q.waitForSelector('.done-card .confetti', { timeout: 4000 }).then(() => true).catch(() => false));
  await q.screenshot({ path: `talqeen-done-${mode}.png` });
} catch (e) {
  check('no exceptions', false, e.stack);
}
const bad = errs.filter((e) => !/getUserMedia|NotAllowed|\[mic\]|denied/.test(e));
check('No unexpected console errors', bad.length === 0, bad.slice(0, 3).join(' | '));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await b.close();
process.exit(results.every(Boolean) ? 0 : 1);
