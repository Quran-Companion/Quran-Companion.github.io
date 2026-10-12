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


const visibleWords = (p) => p.$$eval('.quran-marked > span:not(.ayah-num)', (e) => e.map((x) => `${x.className}:${x.textContent}`));
try {
  const p = await newPage({ settings: { memMode: 'tasmee', reciteStrict: 'normal' } });
  await p.goto(url('/memorize/session?surah=112&from=1&to=3'), { waitUntil: 'load' });
  if (base.startsWith('file:')) await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.turn-idle .btn-primary');
  check('Mode chip says تسميع وتصحيح', (await p.$eval('.mode-chip', (e) => e.textContent)).includes('تسميع'));
  check('Start button says ابدأ التسميع', (await p.$eval('.turn-idle .btn-primary', (e) => e.textContent)).includes('ابدأ التسميع'));
  check('Verse is hidden before starting (recite from memory)', Boolean(await p.$('.quran-hidden')));
  p.__audio = [];
  await p.click('.turn-idle .btn-primary');
  await waitTurn(p);
  check('Mic opens straight away — no sheikh first', p.__audio.length === 0, p.__audio.join(','));
  let w = await visibleWords(p);
  check('Words are covered while reciting', w.length > 0 && w.every((x) => x.startsWith('w-todo')), w.slice(0, 3).join(' '));
  check('Masked mode is on', Boolean(await p.$('.quran-marked.is-masked')));

  // ---- a correct verse 1 → next verse, still no sheikh ----
  await say(p, 'قل هو الله احد');
  await sleep(1000);
  check('Correct verse → moves to verse 2', (await verseNo(p)).includes('٢'), await verseNo(p));
  await waitTurn(p);
  check('Verse 2: mic opens directly (sheikh did not read)', p.__audio.filter((x) => /112002/.test(x)).length <= 1 && !(await p.$('.turn-sheikh')));

  // ---- wrong word on verse 2 (الله الصمد → الله الواحد ... ) — use verse 3 with more words instead ----
  await say(p, 'الله الصمد');
  await sleep(1000);
  await waitTurn(p);
  check('Verse 3 reached', (await verseNo(p)).includes('٣'), await verseNo(p));
  // Verse 3: لَمْ يَلِدْ وَلَمْ يُولَدْ — say a wrong word in place of يلد and carry on
  await say(p, 'لم يقل ولم يولد');
  check('Wrong word → stops and shows "mistake" panel', await phaseIs(p, 'turn-wrong', 3000));
  const wrongWord = await p.$eval('.wrong-word', (e) => e.textContent).catch(() => '');
  await p.screenshot({ path: 'tasmee-wrong.png' });
  check('Panel shows the correct word (يَلِدْ)', wrongWord.replace(/[ً-ٰٟ]/g, '') === 'يلد', wrongWord);
  w = await visibleWords(p);
  const bad = w.filter((x) => x.startsWith('w-bad'));
  check('That word is marked red in the verse', bad.length === 1 && bad[0].includes('يَلِدْ'), bad.join(' '));
  check('Words said right are green', w.some((x) => x.startsWith('w-ok') && x.includes('لَمْ')), w.join(' '));
  check('Verse stays on 3 (no moving on after a mistake)', (await verseNo(p)).includes('٣'));
  check('The mistake is shown in the verse text exactly as received (no altered text)', (await p.$$eval('.quran-marked > span:not(.ayah-num)', (e) => e.map((x) => x.textContent).join(' '))) === FX.verses['112:3']);
  p.__audio = [];
  check('Then the sheikh reads the verse ("hear it right")', await phaseIs(p, 'turn-sheikh', 4000));
  await sleep(300);
  check('…the audio of verse 3 is requested', p.__audio.some((x) => x === '112003.mp3'), p.__audio.join(','));
  w = await visibleWords(p);
  check('…and the whole verse is visible while he reads', !(await p.$('.quran-marked.is-masked')));
  await waitTurn(p);
  check('After the sheikh, the mic opens again for the same verse', (await verseNo(p)).includes('٣'));
  w = await visibleWords(p);
  check('Retry starts covered again', w.every((x) => x.startsWith('w-todo')), w.join(' '));

  // ---- forgetting: stop mid-verse ----
  await say(p, 'لم يلد');
  check('Stopping before the end (forgot) → shows the next word', await phaseIs(p, 'turn-wrong', 6000));
  const forgot = await p.$eval('.wrong-word', (e) => e.textContent).catch(() => '');
  check('…which is وَلَمْ', forgot.replace(/[ً-ٰٟ]/g, '') === 'ولم', forgot);
  await phaseIs(p, 'turn-sheikh', 4000);
  await waitTurn(p);

  // ---- hint button ----
  await p.click('.turn-you .btn-soft');
  await sleep(200);
  w = await visibleWords(p);
  check('"ذكّرني بالكلمة" reveals just the next word', w.filter((x) => x.startsWith('w-hint')).length === 1 && w.find((x) => x.startsWith('w-hint')).includes('لَمْ'), w.join(' '));
  await say(p, 'لم يلد ولم يولد');
  await sleep(1000);
  check('Correct recitation after correction → finishes the range', Boolean(await p.$('.done-card')));
  const sum = await p.$eval('.tasmee-summary', (e) => e.textContent).catch(() => '');
  check('Summary: 2 of 3 without mistakes, 1 corrected', sum.includes('٢') && sum.includes('٣') && sum.includes('آية واحدة'), sum);
  check('Button to mark only the correct ones as memorized', (await p.$$eval('.done-actions .btn', (e) => e.map((x) => x.textContent))).some((t) => t.includes('علّم اللي سمّعته صح')));
  await p.screenshot({ path: 'tasmee-done.png' });

  // ---- strict: one word after the slip is enough; easy needs 3 ----
  const q = await newPage({ settings: { memMode: 'tasmee', reciteStrict: 'easy' } });
  await q.goto(url('/memorize/session?surah=67&from=2&to=2'), { waitUntil: 'load' });
  if (base.startsWith('file:')) await q.reload({ waitUntil: 'load' });
  await q.waitForSelector('.turn-idle .btn-primary');
  await q.click('.turn-idle .btn-primary');
  await waitTurn(q);
  await say(q, 'الذي خلق الحياه والحياه', false);
  await sleep(300);
  check('Easy: one word after a slip is NOT enough to stop you (could be mis-hearing)', !(await q.$('.turn-wrong')));
  await say(q, 'الذي خلق الحياه والحياه ليبلوكم ايكم احسن', false);
  check('Easy: after 3 more words it stops at الموت', await phaseIs(q, 'turn-wrong', 2000));
  check('…shows ٱلْمَوْتَ', ((await q.$eval('.wrong-word', (e) => e.textContent).catch(() => '')) === 'ٱلْمَوْتَ'));

  // ---- settings sheet shows the 3 modes ----
  await p.goto(url('/memorize'), { waitUntil: 'load' });
  await sleep(500);
  const modes = await p.$$eval('.mode-card', (e) => e.map((x) => x.dataset.mode));
  check('Mode chooser has 3 modes incl. tasmee', modes.join(',').includes('tasmee') && modes.length === 3, modes.join(','));
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('Mode cards fit the phone screen', ov <= 0, `overflow ${ov}`);
  await p.screenshot({ path: 'tasmee-modes.png', fullPage: false });
} catch (e) { check('Run completed', false, e.stack); }
check('No console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
await b.close();
