import { readFileSync } from 'node:fs';
const { matchRecitation } = await import('/home/claude/quran-companion/src/lib/recite.js');
const FX = JSON.parse(readFileSync(new URL('./tanzil-fixture.json', import.meta.url)));
const strip = (s) => s.replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '').replace(/ٱ/g, 'ا');
let tp = 0, n = 0, fp = 0, fpList = [], slow = 0;
const t0 = Date.now();
for (const c of FX.chapters) {
  for (let a = 1; a <= c.ayahs; a++) {
    const key = `${c.number}:${a}`; const v = FX.verses[key];
    const s = Date.now();
    if (matchRecitation(v, strip(v), { surah: c.number, ayah: a }).coverage >= 0.7) tp++;
    if (Date.now() - s > 30) slow++;
    n++;
    const nextKey = a < c.ayahs ? `${c.number}:${a + 1}` : null;
    if (nextKey) {
      const r = matchRecitation(v, strip(FX.verses[nextKey]), { surah: c.number, ayah: a });
      if (r.coverage >= 0.7) { fp++; if (fpList.length < 6) fpList.push(`${key} (${Math.round(r.coverage * 100)}%)`); }
    }
  }
}
console.log(`Correct verse recognised: ${tp}/${n}`);
console.log(`Next verse wrongly accepted: ${fp}/${n - 114} (${(fp / (n - 114) * 100).toFixed(2)}%)  e.g. ${fpList.join(', ')}`);
console.log(`Time for ${n * 2} checks: ${Date.now() - t0} ms; checks slower than 30 ms: ${slow}`);
