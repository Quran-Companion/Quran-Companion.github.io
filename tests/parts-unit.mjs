import { splitVerse, partText, findPauses, partTimes } from '/home/claude/quran-companion/src/lib/verseParts.js';
import { skeleton } from '/home/claude/quran-companion/src/lib/recite.js';
import { readFileSync } from 'node:fs';
const FX = JSON.parse(readFileSync('/tmp/claude-0/-home-claude/32586ce2-1978-57a7-b3bb-0060b83414cd/scratchpad/browser/tanzil-fixture.json'));
// test-only: put the pause marks the live text has (after these words) into the fixture text
export function withMarks(text, afterSkeletons) {
  const out = []; const want = [...afterSkeletons];
  for (const w of text.split(' ')) { out.push(w); if (want.length && skeleton(w) === want[0]) { out.push('ۚ'); want.shift(); } }
  return out.join(' ');
}
const k255 = withMarks(FX.verses['2:255'], ['لقيوم', 'نوم', 'لرض', 'بذنه', 'خلفهم', 'ش', 'ولرض', 'حفظهم']);
const res = []; const ck = (n, ok, i = '') => { res.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, i); };
for (const [name, text, ctx] of [['2:255 (with marks)', k255, { surah: 2, ayah: 255 }], ['2:282 (no marks)', FX.verses['2:282'], { surah: 2, ayah: 282 }], ['112:1', FX.verses['112:1'], { surah: 112, ayah: 1 }], ['67:2', FX.verses['67:2'], { surah: 67, ayah: 2 }], ['2:1 (Basmala? no)', FX.verses['2:1'], { surah: 2, ayah: 1 }]]) {
  for (const mode of ['auto', 'short', 'off']) {
    const ps = splitVerse(text, ctx, mode);
    console.log(`${name.padEnd(20)} ${mode.padEnd(5)} → ${ps.length} part(s): ` + ps.map((p) => partText(text, p).split(' ').filter((x) => skeleton(x)).length).join(' + ') + ' words');
  }
}
const ps = splitVerse(k255, { surah: 2, ayah: 255 }, 'auto');
ck('2:255 auto: parts end right after a pause mark', ps.slice(0, -1).every((p) => partText(k255, p).trim().endsWith('ۚ')), ps.map((p) => partText(k255, p).split(' ').slice(-2).join(' ')).join(' | '));
ck('Parts cover the verse exactly, in order, no word lost', ps.map((p) => partText(k255, p)).join(' ') === k255);
ck('Short verses are not split', splitVerse(FX.verses['112:1'], { surah: 112, ayah: 1 }).length === 1);
// every verse: parts reassemble the exact text
let bad = 0; for (const [k, t] of Object.entries(FX.verses)) { const [s, a] = k.split(':').map(Number); for (const m of ['auto', 'short']) { const p = splitVerse(t, { surah: s, ayah: a }, m); if (p.map((x) => partText(t, x)).join(' ') !== t.split(/\s+/).join(' ') || p.some((x) => x.to <= x.from)) bad++; } }
ck('All 6236 verses: parts always reassemble the exact verse', bad === 0, String(bad));
// pause detection on a synthetic recording: voice 2s, pause .5s, voice 1.5s, pause .3s, voice 2s
const rate = 8000; const segs = [[2, 1], [0.5, 0], [1.5, 1], [0.3, 0], [2, 1]];
const total = segs.reduce((n, [d]) => n + d, 0); const data = new Float32Array(Math.round(total * rate)); let o = 0;
for (const [d, v] of segs) { for (let i = 0; i < d * rate; i++) data[o + i] = v ? 0.4 * Math.sin(i / 3) : 0.001 * Math.sin(i); o += Math.round(d * rate); }
const pauses = findPauses({ getChannelData: () => data, sampleRate: rate, duration: total });
ck('Finds the reciter\'s two pauses', pauses.length === 2 && Math.abs(pauses[0][0] - 2) < 0.05 && Math.abs(pauses[1][0] - 4) < 0.05, JSON.stringify(pauses.map((p) => p.map((x) => +x.toFixed(2)))));
const t = partTimes([{ letters: 30 }, { letters: 50 }], { duration: total, pauses });
ck('Cut placed inside the pause nearest the text split (not mid-voice)', t[0].end > 2 && t[0].end < 2.5 && t[1].start > 2 && t[1].start < 2.5 && t[0].measured, JSON.stringify(t));
const f = partTimes([{ letters: 30 }, { letters: 50 }], null);
ck('Without analysis: estimated by word length', f[0].frac && Math.abs(f[0].end - 0.39) < 0.02, JSON.stringify(f));
console.log(`${res.filter(Boolean).length}/${res.length}`);
