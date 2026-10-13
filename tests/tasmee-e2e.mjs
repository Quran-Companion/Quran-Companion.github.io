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
const kinds = (w) => w.map((x) => x.split(':')[0].replace('w-', '')).join(',');
async function open(path, settings = {}) {
  const p = await newPage({ settings: { memMode: 'tasmee', ...settings } });
  await p.goto(url(path), { waitUntil: 'load' });
  if (base.startsWith('file:')) await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.turn-idle .btn-primary');
  return p;
}
const go = async (p) => { await p.click('.turn-idle .btn-primary'); await waitTurn(p); };
let w;
try {
  // ===== 1. The whole verse is required =====
  const p = await open('/memorize/session?surah=112&from=1&to=4');
  check('Verse hidden before starting', Boolean(await p.$('.quran-hidden')));
  p.__audio = [];
  await go(p);
  check('Mic opens straight away (no sheikh)', p.__audio.length === 0);
  const starts0 = await p.evaluate(() => window.__starts);
  await say(p, 'قل هو الله احد', false);
  await sleep(250);
  check('Whole verse 1 said → verse 2', (await verseNo(p)).includes('٢'), await verseNo(p));
  await say(p, 'قل هو الله احد الله الواحد', true);
  await say(p, 'لم يلد ولم يولد', true);
  await sleep(400);
  check('Verse 2 not fully said (wrong last word) → does NOT move on, even if you go on', (await verseNo(p)).includes('٢'), await verseNo(p));
  await p.screenshot({ path: 'tasmee-stuck.png' });
  await say(p, 'الله الصمد', true);
  await sleep(300);
  check('Saying verse 2 correctly → verse 3', (await verseNo(p)).includes('٣'), await verseNo(p));
  // skip a word in the middle: it turns red and stays until said
  await say(p, 'لم ولم يولد', false);
  await sleep(300);
  w = await words(p);
  check('Skipped word (يَلِدْ) turns red, the rest green', kinds(w) === 'ok,bad,ok,ok', w.join(' '));
  check('…and the verse is not done', (await verseNo(p)).includes('٣'));
  await say(p, 'لم ولم يولد يلد', true);
  await sleep(300);
  check('Saying the missing word → verse done → verse 4', (await verseNo(p)).includes('٤'), await verseNo(p));
  w = await words(p, '.prev-card .quran-marked');
  check('Previous-verse card keeps يَلِدْ red so you see the slip', kinds(w) === 'ok,bad,ok,ok', w.join(' '));
  // show a word / show the verse
  await p.click('.turn-you [data-act="word"]'); await sleep(100);
  w = await words(p);
  check('"اظهر كلمة" reveals the next word only', kinds(w) === 'hint,todo,todo,todo,todo', w.join(' '));
  await p.click('.turn-you [data-act="verse"]'); await sleep(100);
  check('"اظهر الآية" shows the verse', !(await p.$('.stage-card .quran-marked.is-masked')));
  await p.click('.turn-you [data-act="verse"]'); await sleep(100);
  check('"اخفِ الآية" hides it', Boolean(await p.$('.stage-card .quran-marked.is-masked')));
  await say(p, 'ولم يكن له كفوا احد', true);
  await sleep(400);
  check('Last verse said → finished', Boolean(await p.$('.done-card')));
  check('Listening never restarted during the whole range', (await p.evaluate(() => window.__starts)) === starts0);
  check('No sheikh audio played while reciting', (await p.evaluate(() => window.__playing || 0)) === 0);
  const sum = await p.$eval('.tasmee-summary', (e) => e.textContent).catch(() => '');
  check('Summary: 3 of 4 right, 1 with a mistake', sum.includes('٣ من ٤') && sum.includes('آية واحدة فيها غلط'), sum);
  const rows = await p.$$eval('.recited-row', (e) => e.map((x) => x.classList.contains('has-bad')));
  check('Only verse 3 is red in the summary', rows.join() === 'false,false,true,false', rows.join());
  check('Verse text in the summary is exactly the source text', (await p.$$eval('.recited-row .quran-marked', (e) => e.map((x) => [...x.querySelectorAll(':scope > span:not(.ayah-num)')].map((y) => y.textContent).join(' ')))).join('|') === [1, 2, 3, 4].map((a) => FX.verses[`112:${a}`]).join('|'));
  await p.screenshot({ path: 'tasmee-done.png', fullPage: true });

  // ===== 2. "تخطّي الآية" when really stuck =====
  const q = await open('/memorize/session?surah=112&from=2&to=3');
  await go(q);
  await say(q, 'الله', true);
  await sleep(200);
  await q.click('.turn-you [data-act="skip"]');
  await sleep(200);
  check('"تخطّي الآية" moves on', (await verseNo(q)).includes('٣'));
  w = await words(q, '.prev-card .quran-marked');
  check('…and marks what you did not say red', kinds(w) === 'ok,bad', w.join(' '));

  // ===== 3. Hesitate → show → hide → say it (your case) =====
  const h = await open('/memorize/session?surah=67&from=2&to=3');
  await go(h);
  await say(h, 'الذي خلق', true);
  await say(h, 'امم مش فاكر الكلمه اللي بعدها خالص يا ربي استنى كده ثانيه واحده', true);
  await sleep(1500);
  await h.click('.turn-you [data-act="verse"]'); await sleep(200);
  await h.click('.turn-you [data-act="verse"]'); await sleep(200);
  await say(h, 'الذي خلق الموت والحياه ليبلوكم ايكم احسن عملا وهو العزيز الغفور', true);
  await sleep(300);
  check('Hesitate, show, hide, say it → registers and moves on', (await verseNo(h)).includes('٣'), await verseNo(h));
  // carry on mid-verse after a long hesitation
  await say(h, 'الذي خلق سبع سماوات', true);
  await say(h, 'اه ايه بقى استنى انا كنت حافظها كويس جدا امبارح والله', true);
  await say(h, 'طباقا ما ترى في خلق الرحمن من تفاوت', false);
  await sleep(300);
  w = await words(h);
  check('Carrying on mid-verse after a long pause keeps counting', w.filter((x) => x.startsWith('w-ok')).length >= 10, kinds(w));
  await sleep(2600);
  check('Pausing (thinking) never ends the verse', (await verseNo(h)).includes('٣') && !(await h.$('.done-card')));

  // ===== 4. Mic restarted by the browser mid-verse =====
  const g = await open('/memorize/session?surah=112&from=3&to=4');
  await go(g);
  await say(g, 'لم يلد', false);
  await g.evaluate(() => window.__endSession());
  await sleep(300);
  await say(g, 'ولم يولد', true);
  await sleep(300);
  check('Browser restarts the mic mid-verse → nothing lost', (await verseNo(g)).includes('٤'), await verseNo(g));

  // ===== 5. Mic dies silently (no events at all) → restarted automatically =====
  const z = await open('/memorize/session?surah=112&from=3&to=4');
  await go(z);
  const before = await z.evaluate(() => window.__starts);
  await z.evaluate(() => { window.__rec.on = false; }); // dead: no onend, no results
  await sleep(10500);
  const after = await z.evaluate(() => window.__starts);
  check('A silently dead mic is restarted automatically (no hang)', after > before, `${before} → ${after}`);
  await say(z, 'لم يلد ولم يولد', true);
  await sleep(300);
  check('…and recitation works again', (await verseNo(z)).includes('٤'), await verseNo(z));

  // ===== 6. Android duplicate results =====
  const a = await open('/memorize/session?surah=112&from=1&to=4');
  await go(a);
  await a.evaluate(() => window.__androidSay('قل هو الله احد'));
  await sleep(200);
  await a.evaluate(() => window.__androidSay('الله الصمد'));
  await sleep(200);
  await a.evaluate(() => window.__androidSay('لم يلد ولم يولد'));
  await sleep(300);
  check('Android-style repeated results: follows to verse 4', (await verseNo(a)).includes('٤'), await verseNo(a));

  // ===== 7. Nearly identical verses (94:5 → 94:6) =====
  const k = await open('/memorize/session?surah=94&from=5&to=7');
  await go(k);
  await say(k, 'فان مع العسر يسرا', true);
  await sleep(250);
  await say(k, 'ان مع العسر يسرا', true);
  await sleep(300);
  check('94:5 then 94:6 both counted', (await verseNo(k)).includes('٧'), await verseNo(k));

  // ===== 8. Speed: a long verse with lots of talk must not freeze the page =====
  const L = await open('/memorize/session?surah=2&from=255&to=255');
  await go(L);
  const junk = 'امم مش فاكر الكلمه اللي بعدها خالص يا ربي استنى كده ثانيه واحده ';
  const plainV = FX.verses['2:255'].replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '').split(' ');
  const worst = await L.evaluate(async (half, junk) => {
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      window.__say(`${half} ${junk.repeat(1 + (i % 4))}`, false);
      worst = Math.max(worst, performance.now() - t0);
      await new Promise((r) => setTimeout(r, 30));
    }
    return worst;
  }, plainV.slice(0, 25).join(' '), junk);
  check('Each mic update is handled quickly (no freezing) on Ayat al-Kursi', worst < 16, `slowest ${worst.toFixed(1)} ms`);

  // ===== Mode card =====
  await p.goto(url('/memorize'), { waitUntil: 'load' });
  await sleep(400);
  const desc = await p.$eval('.mode-card[data-mode="tasmee"]', (e) => e.textContent).catch(() => '');
  check('Mode card says the whole verse is required', desc.includes('الآية كلها'), desc);
} catch (e) { check('Run completed', false, e.stack); }
check('No console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
await b.close();
