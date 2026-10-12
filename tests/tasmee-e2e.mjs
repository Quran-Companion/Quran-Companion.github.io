// "Recite & get corrected" (tasmee) mode, at phone size, with a fake speech recogniser.
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
    window.__playing = 0;
    const P = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...a) { if (!String(this.src).startsWith('data:')) window.__playing++; return P.apply(this, a); };
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
    if (u.includes('everyayah.com') || u.includes('islamic.network')) { (p.__audio ||= []).push(u.split('/').pop()); return r.respond({ status: 200, headers: CORS, contentType: 'audio/wav', body: wav }); }
    return r.continue();
  });
  return p;
}
const verseNo = (p) => p.$eval('.stage-meta .badge', (e) => e.textContent).catch(() => '');
const phaseIs = (p, cls, t = 6000) => p.waitForSelector(`.turn-panel.${cls}`, { timeout: t }).then(() => true).catch(() => false);
const say = (p, text, final = true) => p.evaluate((t, f) => window.__say(t, f), text, final);
const waitTurn = async (p) => { await p.waitForSelector('.turn-you .mic-orb.is-listening', { timeout: 6000 }); };



const words = (p, sel = '.stage-card .quran-marked') => p.$$eval(`${sel} > span:not(.ayah-num)`, (e) => e.map((x) => `${x.className}:${x.textContent}`)).catch(() => []);
const plain = (x) => x.replace(/[ً-ٰٟۖ-ۭ]/g, '');
async function open(path, settings = {}) {
  const p = await newPage({ settings: { memMode: 'tasmee', ...settings } });
  await p.goto(url(path), { waitUntil: 'load' });
  if (base.startsWith('file:')) await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.turn-idle .btn-primary');
  return p;
}
try {
  // ===== 1. Continuous: mistakes are marked red, it never stops =====
  const p = await open('/memorize/session?surah=112&from=1&to=4');
  check('Verse hidden before starting', Boolean(await p.$('.quran-hidden')));
  p.__audio = [];
  await p.click('.turn-idle .btn-primary');
  await waitTurn(p);
  check('Mic opens straight away (no sheikh)', p.__audio.length === 0);
  const startsBefore = await p.evaluate(() => window.__starts);
  let w = await words(p);
  check('Words covered while reciting', w.length && w.every((x) => x.startsWith('w-todo')), w.join(' '));

  await say(p, 'قل هو الله احد', false); // interim
  await sleep(150);
  check('Verse 1 said → moves to verse 2 immediately', (await verseNo(p)).includes('٢'), await verseNo(p));
  w = await words(p, '.prev-card .quran-marked');
  check('Previous verse shown above, all green', w.length && w.filter((x) => !x.startsWith('w-ok')).length === 0 && !(await p.$('.prev-card.has-bad')), w.join(' '));

  await say(p, 'قل هو الله احد الله الواحد', true); // wrong word in verse 2 (final)
  await sleep(150);
  check('A wrong word does NOT stop you (still listening on verse 2)', (await verseNo(p)).includes('٢') && Boolean(await p.$('.turn-you .mic-orb.is-listening')) && !(await p.$('.turn-wrong')));
  await say(p, 'لم يلد ولم', false); // carries on with verse 3
  await sleep(150);
  check('Starting verse 3 → follows you to verse 3', (await verseNo(p)).includes('٣'), await verseNo(p));
  w = await words(p, '.prev-card .quran-marked');
  const bad = w.filter((x) => x.startsWith('w-bad'));
  check('Verse 2 shown above with ٱلصَّمَدُ in red', bad.length === 1 && plain(bad[0]).includes('لصمد') && Boolean(await p.$('.prev-card.has-bad')), w.join(' '));
  check('Verse 3 words said so far are green, rest covered', (await words(p)).map((x) => x.split(':')[0]).join(',') === 'w-ok,w-ok,w-ok,w-todo', (await words(p)).join(' '));
  await say(p, 'لم يلد ولم يولد', true);
  await sleep(150);
  check('Verse 3 complete → verse 4', (await verseNo(p)).includes('٤'));

  // ---- show a word / show the verse ----
  await p.click('.turn-you [data-act="word"]');
  await sleep(100);
  w = await words(p);
  check('"اظهر كلمة" reveals the first word only', w[0]?.startsWith('w-hint') && w.slice(1).every((x) => x.startsWith('w-todo')), w.join(' '));
  await p.click('.turn-you [data-act="word"]');
  await sleep(100);
  w = await words(p);
  check('…pressing again reveals the next word', w.filter((x) => x.startsWith('w-hint')).length === 2, w.join(' '));
  await p.click('.turn-you [data-act="verse"]');
  await sleep(100);
  check('"اظهر الآية" shows the whole verse', !(await p.$('.stage-card .quran-marked.is-masked')));
  check('…and the button becomes "اخفِ الآية"', (await p.$eval('.turn-you [data-act="verse"]', (e) => e.textContent)).includes('اخفِ'));
  await p.click('.turn-you [data-act="verse"]');
  await sleep(100);
  check('"اخفِ الآية" hides it again', Boolean(await p.$('.stage-card .quran-marked.is-masked')));
  check('Listening never stopped/restarted during all this', (await p.evaluate(() => window.__starts)) === startsBefore);
  check('No sheikh audio playing while reciting (files only preloaded)', !(await p.$('.eq')) && (await p.evaluate(() => window.__playing || 0)) === 0);

  await say(p, 'ولم يكن له كفوا احد', false);
  await sleep(300);
  check('Last verse said → finished', Boolean(await p.$('.done-card')));
  const sum = await p.$eval('.tasmee-summary', (e) => e.textContent).catch(() => '');
  check('Summary: 3 of 4 right, 1 with a mistake', sum.includes('٣ من ٤') && sum.includes('آية واحدة فيها غلط'), sum);
  const rows = await p.$$eval('.recited-row', (e) => e.map((x) => ({ bad: x.classList.contains('has-bad'), btn: Boolean(x.querySelector('button')), cls: [...x.querySelectorAll('.quran-marked > span:not(.ayah-num)')].map((y) => y.className) })));
  check('All 4 verses listed with their marks', rows.length === 4, JSON.stringify(rows.map((r) => r.bad)));
  check('Only verse 2 is red', rows.map((r) => r.bad).join() === 'false,true,false,false');
  check('Verse 4 revealed words shown as hints (not mistakes)', rows[3].cls.filter((c) => c === 'w-hint').length === 2 && !rows[3].cls.includes('w-bad'), rows[3].cls.join(','));
  check('"اسمعها من الشيخ" on the red verse (and the helped one)', rows[1].btn && rows[3].btn && !rows[0].btn);
  p.__audio = [];
  await p.click('.recited-row.has-bad button');
  await sleep(1200);
  check('…which plays that verse (112:2)', p.__audio.includes('112002.mp3'), p.__audio.join(','));
  check('Text unchanged: verse rows show the exact verse text', (await p.$$eval('.recited-row .quran-marked', (e) => e.map((x) => [...x.querySelectorAll(':scope > span:not(.ayah-num)')].map((y) => y.textContent).join(' ')))).join('|') === [1, 2, 3, 4].map((a) => FX.verses[`112:${a}`]).join('|'));
  await p.screenshot({ path: 'tasmee-done.png', fullPage: true });

  // ===== 2. A skipped verse turns fully red =====
  const q = await open('/memorize/session?surah=112&from=1&to=4');
  await q.click('.turn-idle .btn-primary');
  await waitTurn(q);
  await say(q, 'قل هو الله احد', true);
  await sleep(100);
  await say(q, 'لم يلد ولم', false); // verse 2 skipped entirely
  await sleep(150);
  check('Skipping verse 2 → follows you to verse 3', (await verseNo(q)).includes('٣'), await verseNo(q));
  w = await words(q, '.prev-card .quran-marked');
  check('Verse 2 shown all red', w.length === 2 && w.every((x) => x.startsWith('w-bad')), w.join(' '));
  await q.screenshot({ path: 'tasmee-flow.png' });

  // ===== 3. Pausing at the end of a verse with a missed word in the middle =====
  const r = await open('/memorize/session?surah=67&from=2&to=3');
  await r.click('.turn-idle .btn-primary');
  await waitTurn(r);
  await say(r, 'الذي خلق الموت والحياه ليبلوكم احسن عملا وهو العزيز الغفور', true); // missed ايكم
  await sleep(2200);
  check('Pause after the end of a verse → moves on', (await verseNo(r)).includes('٣'), await verseNo(r));
  w = await words(r, '.prev-card .quran-marked');
  check('…with the missed word (أَيُّكُمْ) red', w.filter((x) => x.startsWith('w-bad')).length === 1 && plain(w.find((x) => x.startsWith('w-bad'))).includes('يكم'), w.filter((x) => !x.startsWith('w-ok')).join(' '));
  // Pause mid-verse (forgot): stays and waits — does not jump ahead
  await say(r, 'الذي خلق سبع', false);
  await sleep(2500);
  check('Pausing mid-verse (forgot) → stays on the verse and keeps listening', (await verseNo(r)).includes('٣') && Boolean(await r.$('.turn-you .mic-orb.is-listening')));

  // ===== 4. Mode card =====
  await p.goto(url('/memorize'), { waitUntil: 'load' });
  await sleep(400);
  const desc = await p.$eval('.mode-card[data-mode="tasmee"]', (e) => e.textContent).catch(() => '');
  check('Mode card describes non-stop recitation', desc.includes('من غير ما يوقّفك'), desc);
} catch (e) { check('Run completed', false, e.stack); }
check('No console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
await b.close();
