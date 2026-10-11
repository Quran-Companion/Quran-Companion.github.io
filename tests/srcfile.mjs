// Opens the SOURCE index.html from disk (the user's original scenario) and checks it is not blank.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
const p = await b.newPage();
await p.goto('file:///home/claude/quran-companion/index.html', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 3200));
const t = await p.$eval('#root', (e) => e.innerText);
console.log(t.includes('QuranCompanion.html') ? 'PASS  Source index.html via file:// shows instructions (not blank)' : 'FAIL  ' + t);
await b.close();
