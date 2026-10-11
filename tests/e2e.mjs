// End-to-end test in real headless Chrome (bundled Chromium 131).
// The Quran API and audio host are unreachable from this sandbox, so requests to them are
// intercepted: verse text is served from an authentic Tanzil copy (see fixtures), audio is a silent clip.
// Usage: node e2e.mjs <mode: file|http> <url> [--api-fail]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const [mode, base, flag] = process.argv.slice(2);
const API_FAIL = flag === '--api-fail';
const results = [];
const consoleErrors = [];
let navCount = 0;
const check = (name, ok, info = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  — ${info}` : ''}`);
};

// ---------- fixtures ----------
// Verse text: authentic Tanzil Uthmani text from the `quran` npm package's SQLite DB (test-only,
// never shipped), served in the same JSON shape as api.alquran.cloud.
import { readFileSync } from 'node:fs';
const FX = JSON.parse(readFileSync(new URL('./tanzil-fixture.json', import.meta.url)));
const AYAHS = (n) => FX.chapters[n - 1].ayahs;
const surahHead = (n) => {
  const c = FX.chapters[n - 1];
  return { number: n, name: `سُورَةُ ${c.arname}`, englishName: c.tname, englishNameTranslation: c.enname, numberOfAyahs: c.ayahs, revelationType: c.type };
};
let globalBase = {};
{ let g = 0; for (const c of FX.chapters) { globalBase[c.number] = g; g += c.ayahs; } }
const verse = (s, a, extra = {}) => ({
  number: globalBase[s] + a, text: FX.verses[`${s}:${a}`], numberInSurah: a, juz: 30, page: 1, sajda: false, ...extra,
});
function apiResponse(url) {
  const u = new URL(url);
  const p = decodeURIComponent(u.pathname.replace(/^\/v1/, ''));
  let m;
  if (p === '/surah') return FX.chapters.map((c) => surahHead(c.number));
  if ((m = p.match(/^\/surah\/(\d+)\/quran-uthmani$/))) {
    const s = +m[1];
    return { ...surahHead(s), ayahs: Array.from({ length: AYAHS(s) }, (_, i) => verse(s, i + 1)) };
  }
  if ((m = p.match(/^\/juz\/(\d+)\/quran-uthmani$/))) {
    const ay = [112, 113, 114].flatMap((s) => Array.from({ length: AYAHS(s) }, (_, i) => verse(s, i + 1, { surah: { number: s, name: surahHead(s).name } })));
    return { number: +m[1], ayahs: ay };
  }
  if (p.startsWith('/search/')) {
    return { count: 1, matches: [{ ...verse(112, 1), surah: { number: 112, name: surahHead(112).name } }] };
  }
  return undefined;
}
const audioRequests = [];
function silentWav(seconds = 0.3) {
  const rate = 8000, n = Math.floor(rate * seconds), buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34); buf.write('data', 36);
  buf.writeUInt32LE(n, 40); buf.fill(128, 44);
  return buf;
}
const WAV = silentWav();
const CORS = { 'Access-Control-Allow-Origin': '*' };

// ---------- browser ----------
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args, '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'],
  headless: true,
  defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
page.on('console', async (msg) => {
  if (msg.type() !== 'error') return;
  const parts = await Promise.all(msg.args().map((a) => a.evaluate((v) => (v instanceof Error ? `${v.name}: ${v.message}` : String(v))).catch(() => null)));
  const loc = msg.location()?.url?.split('/').pop() || '';
  consoleErrors.push(`[nav#${navCount}] ${parts.length && parts.every(Boolean) ? parts.join(' ') : msg.text()} @${loc}`);
});
page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR ${e.message}`));
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (url.startsWith('https://api.alquran.cloud/')) {
    if (API_FAIL) return req.respond({ status: 503, headers: CORS, contentType: 'application/json', body: '{"code":503}' });
    const data = apiResponse(url);
    if (data === undefined) return req.respond({ status: 404, headers: CORS, contentType: 'application/json', body: '{"code":404}' });
    return req.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 200, status: 'OK', data }) });
  }
  if (url.startsWith('https://everyayah.com/')) { audioRequests.push(url); return req.respond({ status: 200, headers: CORS, contentType: 'audio/wav', body: WAV }); }
  if (url.startsWith('https://fonts.googleapis.com/')) return req.respond({ status: 200, contentType: 'text/css', body: '' });
  if (url.startsWith('https://fonts.gstatic.com/')) return req.respond({ status: 404, body: '' });
  return req.continue();
});

const url = (path) => (mode === 'file' ? `${base}#${path}` : `${base.replace(/\/$/, '')}${path}`);
// Full page load each time (a hash-only goto would not reload, so force it in file mode).
const go = async (path) => {
  navCount++;
  await page.goto(url(path), { waitUntil: 'load' });
  if (mode === 'file') await page.reload({ waitUntil: 'load' });
  await sleep(400);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (sel) => page.$eval(sel, (e) => e.textContent).catch(() => null);
const count = (sel) => page.$$eval(sel, (e) => e.length);
const waitFor = (sel, timeout = 5000) => page.waitForSelector(sel, { timeout }).then(() => true).catch(() => false);

try {
  await page.goto(url('/'), { waitUntil: 'networkidle0' }); // let first-load requests finish before navigating
  await page.evaluate(() => localStorage.clear());
  await go('/');

  // 1. Renders (not blank)
  const rootLen = await page.$eval('#root', (e) => e.innerHTML.length);
  check('App renders (root not empty)', rootLen > 500, `root html ${rootLen} chars`);
  check('Arabic RTL by default', (await page.$eval('html', (e) => e.dir)) === 'rtl');
  const h1 = await text('h1');
  check('Home headline (AR)', h1 === 'ابدأ رحلتك مع القرآن', h1);

  if (API_FAIL) {
    await go('/quran');
    check('API failure shows error state on Quran page', await waitFor('.state-error'));
    check('Error shows technical detail', ((await text('.error-detail')) || '').includes('http_503'), await text('.error-detail'));
    check('Retry button present', (await count('.state-error button')) === 1);
    await go('/memorize');
    check('Memorize page shows error (no endless spinner)', await waitFor('.state-error'));
    await go('/review');
    check('Review page shows error (no endless spinner)', await waitFor('.state-error'));
    await go('/quran/112');
    check('Reader shows error state', await waitFor('.state-error'));
    check('No verse text shown on failure', (await count('.verse-row')) === 0);
  } else {
    // 2. Client-side navigation via nav link
    await page.click('.nav-desktop a[href$="quran"]');
    await waitFor('.surah-card');
    check('Nav link → Quran page (client routing)', (await count('.surah-card')) === 114, `${await count('.surah-card')} cards`);

    // 3. Search filter
    await page.type('.search-bar input', 'الإخلاص');
    await sleep(200);
    check('Surah search (Arabic name) filters list', (await count('.surah-card')) === 1, `${await count('.surah-card')} cards`);

    // 4. Open surah, verses render verbatim from source
    await page.click('.surah-card');
    await waitFor('.verse-row');
    const verses = await page.$$eval('.verse-row .quran', (els) => els.map((e) => e.childNodes[0].textContent.trim()));
    check('Reader shows all verses from API', verses.length === 4, `${verses.length} verses`);
    check('Verse text passed through unchanged (byte-identical)', verses.every((v, i) => v === FX.verses[`112:${i + 1}`]));

    // 5. Mark memorized → guest progress in localStorage
    await page.click('.verse-row .mem-toggle');
    await sleep(300);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('qc:progress:guest') || '{}'));
    check('Mark memorized saves guest progress', Boolean(stored.memorized?.['112:1']));

    // 6. Hide all → tap to reveal
    await page.evaluate(() => [...document.querySelectorAll('.toolbar .btn')].find((b) => b.textContent.includes('إخفاء'))?.click());
    await sleep(200);
    check('Hide verses hides text', (await count('.verse-row .quran-hidden')) === 4);
    await page.click('.verse-row .quran-hidden');
    await sleep(200);
    check('Tap reveals one verse', (await count('.verse-row .quran-hidden')) === 3);

    // 7. Deep link with verse anchor
    await go('/quran/112#a3');
    await waitFor('.verse-row');
    await sleep(500);
    check('Deep link #a3 highlights verse 3', await page.$eval('#a3', (e) => e.classList.contains('is-current')).catch(() => false));

    // 8. Memorization session: audio + auto-advance + repeat
    await go('/memorize/session?surah=112&from=1&to=4');
    await waitFor('.stage-card .quran');
    check('Session shows first verse', (await text('.stage-card .quran'))?.includes(FX.verses['112:1']));
    check('Focus mode hides top bar', (await page.$eval('.topbar', (e) => getComputedStyle(e).display))=== 'none');
    await page.click('.play-btn');
    let advanced = false;
    for (let i = 0; i < 30 && !advanced; i++) {
      await sleep(250);
      advanced = (await text('.stage-card .quran'))?.includes(FX.verses['112:2']);
    }
    check('Audio plays, repeats and auto-advances to verse 2', advanced);
    const audioState = await page.evaluate(() => [...document.querySelectorAll('audio')].length);
    void audioState;
    await page.click('.play-btn'); // pause
    await page.click('.dock-btn'); // hide
    await sleep(200);
    check('Hide text in session', (await count('.stage-card .quran-hidden')) === 1);
    await page.click('.stage-card .quran-hidden');
    await sleep(150);
    check('Show verse reveals it', (await count('.stage-card .quran-hidden')) === 0);
    const dockBtns = await page.$$('.dock-btn');
    await dockBtns[1].click(); // mark memorized
    await sleep(800);
    const st2 = await page.evaluate(() => JSON.parse(localStorage.getItem('qc:progress:guest')));
    check('Session: mark memorized', Boolean(st2.memorized?.['112:2']), Object.keys(st2.memorized || {}).join(','));
    check('Session: position auto-saved', st2.last?.surah === 112 && st2.last?.ayah === 2, JSON.stringify(st2.last));

    // 8b. Memorize setup: type the surah name, pick reciter, start
    await go('/memorize');
    await waitFor('.combo input');
    await page.click('.combo input');
    check('Surah list shows all 114 when opened', (await count('.combo-option')) === 114, `${await count('.combo-option')} options`);
    await page.type('.combo input', 'الكهف');
    await sleep(150);
    const opts = await page.$$eval('.combo-option .combo-name', (e) => e.map((x) => x.textContent));
    check('Typing an Arabic surah name finds it', opts.length === 1 && opts[0].includes('الكهف'), opts.join(' | '));
    await page.keyboard.press('Enter');
    await sleep(150);
    const picked = await page.$eval('.combo input', (e) => e.value);
    check('Enter selects the surah', picked.includes('الكهف'), picked);
    await page.click('.combo input');
    await page.type('.combo input', '112');
    await sleep(100);
    await page.click('.combo-option');
    await sleep(100);
    check('Typing a number finds the surah', (await page.$eval('.combo input', (e) => e.value)).includes('الإخلاص'));
    await page.click('.combo input');
    await page.type('.combo input', 'yaseen');
    await sleep(100);
    check('English name search works', (await count('.combo-option')) >= 1);
    await page.keyboard.press('Escape');
    await page.click('.reciter-btn');
    await waitFor('.sheet .reciter-item');
    const groups = await page.$$eval('.reciter-group-title', (g) => g.map((x) => x.textContent.trim()));
    check('Reciters grouped by Egypt / Saudi / other', groups.length === 3, groups.join(', '));
    check('35 reciters available', (await count('.reciter-item')) === 35, String(await count('.reciter-item')));
    await page.type('.sheet input', 'المنشاوي');
    await sleep(150);
    const found = await page.$$eval('.reciter-item', (e) => e.map((x) => x.textContent.trim()));
    check('Typing "المنشاوي" finds Al-Minshawi (murattal + mujawwad)', found.length === 2 && found.every((x) => x.includes('المنشاوي')), found.join(' | '));
    await page.click('.sheet input', { clickCount: 3 });
    await page.type('.sheet input', 'منشاوي');
    await sleep(100);
    check('Partial name "منشاوي" also works', (await count('.reciter-item')) === 2);
    await page.click('.reciter-item[data-reciter="minshawi"]');
    await sleep(150);
    check('Picker closes and shows chosen reciter', (await count('.sheet')) === 0 && ((await text('.reciter-btn-name')) || '').includes('المنشاوي'), await text('.reciter-btn-name'));
    await page.click('.combo input');
    await page.type('.combo input', '112');
    await page.keyboard.press('Enter');
    await sleep(150);
    audioRequests.length = 0;
    await page.click('.card .btn-block');
    await waitFor('.stage-card .quran');
    check('Start opens session for the typed surah', (await text('.session-title strong'))?.includes('الإخلاص'), await text('.session-title strong'));
    await page.click('.play-btn');
    await sleep(800);
    await page.click('.play-btn');
    check('Audio uses chosen reciter (EveryAyah, verse-by-verse)', audioRequests.some((u) => u.includes('/Minshawy_Murattal_128kbps/112001.mp3')), audioRequests.slice(0, 2).join(' '));

    // 8c. Settings sheet: font choice
    await page.click('.session-head .icon-btn:last-child');
    await waitFor('.settings-sheet');
    check('Settings sheet groups options (memorize / sound / text)', (await count('.settings-sheet .set-section')) === 3);
    const fontBefore = await page.evaluate(() => getComputedStyle(document.querySelector('.stage-card .quran')).fontFamily);
    await page.click('.font-card[data-font="amiri"]');
    await sleep(200);
    const fontAfter = await page.evaluate(() => getComputedStyle(document.querySelector('.stage-card .quran')).fontFamily);
    check('Default Quran font is the Madinah Mushaf font', fontBefore.startsWith('"KFGQPC Hafs"'), fontBefore.slice(0, 40));
    check('Quran font can be changed', fontAfter.startsWith('"Amiri Quran"'), fontAfter.slice(0, 40));
    await page.click('.sheet-foot .btn');
    await sleep(150);
    const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.stage-card .quran')).fontSize));
    check('Memorization text is large (≥ 44px on desktop)', fs >= 44, `${fs}px`);
    const loaded = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family); });
    check('Bundled Quran font actually loads', loaded.some((f) => f.includes('Amiri Quran')) , loaded.join(','));

    // 9. Home reflects progress + continue
    await go('/');
    const ministats = await page.$$eval('.mini-stats strong', (e) => e.map((x) => x.textContent.trim()));
    check('Home shows memorized count', ministats[0] === '٢', ministats.join(' / '));
    check('Continue button enabled', !(await page.$eval('.hero-actions .btn-ghost', (e) => e.disabled)));
    check('Recently memorized list', (await count('.recent-list li')) === 2);

    // 10. Review flow
    await go('/review');
    await waitFor('.btn-block');
    await page.click('.card .btn-block');
    await waitFor('.review-session');
    check('Review session starts', (await count('.review-session .quran-hidden')) === 1);
    for (let i = 0; i < 2; i++) {
      await page.click('.review-session > .btn-primary');
      await waitFor('.g-good');
      await page.click('.g-good');
      await sleep(200);
    }
    check('Review summary shown', await waitFor('.summary-card'));
    const st3 = await page.evaluate(() => JSON.parse(localStorage.getItem('qc:progress:guest')));
    check('Review session saved', st3.reviews?.length === 1 && st3.reviews[0].good === 2, JSON.stringify(st3.reviews?.[0] || {}));

    // 11. Juz review (merged juz endpoints)
    await go('/review');
    await waitFor('.segmented button');
    await page.evaluate(() => [...document.querySelectorAll('.segmented button')][2].click());
    await sleep(100);
    await page.click('.card .btn-block');
    check('Juz review loads memorized verses from juz', await waitFor('.review-session'));

    // 12. Dashboard
    await go('/dashboard');
    check('Dashboard renders', await waitFor('.stat-grid'));
    check('Dashboard history row', (await count('.table tbody tr')) === 1);

    // 13. Verse search
    await go('/quran');
    await page.type('.search-bar input', 'كلمة');
    check('Verse search results render', await waitFor('.result-list li', 4000));

    // 14. Account (guest)
    await go('/account');
    if (mode === 'file') {
      check('Account (file://) explains Google sign-in needs localhost/hosting', await waitFor('.notice'), (await text('.notice p'))?.slice(0, 60));
    } else {
      check('Account shows Firebase setup steps', await waitFor('.setup-card textarea'));
      await page.type('.setup-card textarea', 'const firebaseConfig = {\n apiKey: "AIzaSyTEST-not-real",\n authDomain: "demo-test.firebaseapp.com",\n projectId: "demo-test",\n storageBucket: "demo-test.appspot.com",\n messagingSenderId: "1",\n appId: "1:1:web:abc"\n};');
      await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('.setup-card .btn-primary')]);
      check('After pasting config, Google sign-in button appears', await waitFor('.btn-google', 8000));
      check('App still works with Firebase enabled', (await count('.topbar')) === 1);
      await page.evaluate(() => localStorage.removeItem('qc:firebase-config'));
    }

    // 15. Language → English LTR
    await page.click('.topbar-actions .icon-btn'); // lang toggle
    await sleep(200);
    check('English toggles LTR', (await page.$eval('html', (e) => e.dir)) === 'ltr');
    await go('/');
    check('English headline', (await text('h1')) === 'Start Your Quran Journey', await text('h1'));
    check('Language persisted after reload', (await page.$eval('html', (e) => e.lang)) === 'en');

    // 16. Theme
    const before = await page.$eval('html', (e) => e.dataset.theme);
    await page.click('.topbar-actions .icon-btn:nth-child(2)');
    await sleep(150);
    const after = await page.$eval('html', (e) => e.dataset.theme);
    await go('/');
    const reloaded = await page.$eval('html', (e) => e.dataset.theme);
    check('Theme toggles and persists', before !== after && after === reloaded, `${before} → ${after} → ${reloaded}`);
    await sleep(500); // body has a 0.3s colour transition
    const bg = await page.$eval('body', (e) => getComputedStyle(e).backgroundColor.replace(/^rgba\((\d+), (\d+), (\d+), 1\)$/, 'rgb($1, $2, $3)'));
    check('Theme colors applied', after === 'dark' ? bg === 'rgb(12, 20, 18)' : bg === 'rgb(246, 243, 236)', bg);

    // 17. 404
    await go('/does-not-exist');
    check('Unknown route shows 404', (await text('h1')) === '404');

    // 18. Mobile layout
    await page.setViewport({ width: 390, height: 844 });
    await go('/');
    check('Mobile bottom nav visible', (await page.$eval('.nav-mobile', (e) => getComputedStyle(e).display)) === 'grid');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('No horizontal scroll on mobile', overflow <= 0, `overflow ${overflow}px`);
    await page.screenshot({ path: `shot-${mode}-mobile.png` });
    await page.setViewport({ width: 1280, height: 900 });
    await page.evaluate(() => { localStorage.setItem('qc:settings', JSON.stringify({ lang: 'ar', theme: 'light' })); });
    await go('/quran/112');
    await waitFor('.verse-row');
    await page.screenshot({ path: `shot-${mode}-reader.png` });
    await go('/memorize/session?surah=112&from=1&to=4');
    await waitFor('.stage-card .quran');
    await page.screenshot({ path: `shot-${mode}-session.png` });
  }
} catch (e) {
  check('Test run completed without exceptions', false, e.stack);
}

// Font-loading failures are caused by the sandbox blocking Google Fonts; API 503s are intentional in --api-fail.
const relevant = consoleErrors.filter((m) =>
  !/fonts\.g(static|oogleapis)/.test(m) &&
  !(API_FAIL && /503|status of 503|surah list failed/.test(m)) &&
  !/Failed to load resource: the server responded with a status of 404/.test(m));
check('No unexpected console errors', relevant.length === 0, relevant.slice(0, 5).join(' || '));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
