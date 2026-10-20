import { planParts, partText } from '/home/claude/quran-companion/src/lib/verseParts.js';
import { skeleton } from '/home/claude/quran-companion/src/lib/recite.js';
import { readFileSync } from 'node:fs';
const FX = JSON.parse(readFileSync('/tmp/claude-0/-home-claude/32586ce2-1978-57a7-b3bb-0060b83414cd/scratchpad/browser/tanzil-fixture.json'));
const AFTER = ['لقيوم', 'نوم', 'لرض', 'بذنه', 'خلفهم', 'ش', 'ولرض', 'حفظهم'];
const tokens = []; { const want = [...AFTER]; for (const w of FX.verses['2:255'].split(' ')) { tokens.push(w); if (want.length && skeleton(w) === want[0]) { tokens.push('ۚ'); want.shift(); } } }
const V = tokens.join(' ');
const groups = []; { let g = []; for (const w of tokens) { if (w === 'ۚ') { groups.push(g); g = []; } else g.push(w); } groups.push(g); }
// Simulate a reciter: per-group speed factors, and which marks he stops at.
function recording(stopAt, speed = groups.map(() => 1), extraBreathInGroup = -1) {
  let t = 0.3; const pauses = []; const vs = t;
  groups.forEach((g, k) => {
    const d = g.map(skeleton).join('').length * 0.06 * speed[k];
    if (k === extraBreathInGroup) { t += d / 2; pauses.push([t, t + 0.45]); t += 0.45 + d / 2; } else t += d;
    if (k < groups.length - 1) { if (stopAt.includes(k)) { pauses.push([t, t + 0.7]); t += 0.7; } else { pauses.push([t, t + 0.1]); t += 0.1; } } // 0.1 s = a tiny gap, not a stop
  });
  return { duration: t + 0.3, pauses: pauses.filter(([a, b]) => b - a >= 0.18), voice: [vs, t] };
}
const res = []; const ck = (n, ok, i = '') => { res.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, i ? `— ${i}` : ''); };
const ends = (plan) => plan.parts.slice(0, -1).map((p) => tokens.slice(p.from, p.to).filter((x) => x !== 'ۚ').pop());
const markWord = (k) => groups[k][groups[k].length - 1];
let plan = planParts(V, { surah: 2, ayah: 255 }, recording([0, 1, 2, 3, 4, 5, 6, 7]));
ck('Sheikh stops at every mark → a part per stop', plan.parts.length === 9 && plan.byPauses, `${plan.parts.length} parts, ends: ${ends(plan).join(' | ')}`);
plan = planParts(V, { surah: 2, ayah: 255 }, recording([1, 4, 6]));
ck('Stops only at 3 marks → 4 parts, ending exactly where he stopped', plan.parts.length === 4 && ends(plan).join() === [1, 4, 6].map(markWord).join(), ends(plan).join(' | '));
const slow = groups.map((_, k) => (k < 3 ? 1.3 : 0.85));
plan = planParts(V, { surah: 2, ayah: 255 }, recording([1, 4, 6], slow));
ck('Same, but slow at the start and fast later (1.5× difference) → still the right marks', ends(plan).join() === [1, 4, 6].map(markWord).join(), ends(plan).join(' | '));
plan = planParts(V, { surah: 2, ayah: 255 }, recording([2, 5], groups.map((_, k) => 0.6 + (k % 3) * 0.45)));
ck('Uneven speed throughout, stops at 2 marks → right marks', ends(plan).join() === [2, 5].map(markWord).join(), ends(plan).join(' | '));
plan = planParts(V, { surah: 2, ayah: 255 }, recording([3], undefined, 5));
ck('A breath mid-phrase (no mark) also ends a part, at a word boundary', plan.parts.length === 3 && ends(plan)[0] === markWord(3), ends(plan).join(' | '));
const rec = recording([1, 4, 6]);
plan = planParts(V, { surah: 2, ayah: 255 }, rec);
ck('Times: each part ends inside his stop and the next starts inside it', plan.times.slice(0, -1).every((t, i) => { const st = rec.pauses.filter(([a, b]) => b - a > 0.5)[i]; return t.end >= st[0] && t.end <= st[1] && plan.times[i + 1].start >= st[0] && plan.times[i + 1].start <= st[1]; }), JSON.stringify(plan.times.map((t) => [+t.start.toFixed(2), +(t.end === Infinity ? -1 : t.end).toFixed(2)])));
ck('Parts reassemble the verse exactly', plan.parts.map((p) => partText(V, p)).join(' ') === V);
plan = planParts(FX.verses['112:1'], { surah: 112, ayah: 1 }, rec);
ck('Short verse → not split', plan.parts.length === 1);
plan = planParts(V, { surah: 2, ayah: 255 }, rec, 'off');
ck('"كاملة" → not split', plan.parts.length === 1);
plan = planParts(V, { surah: 2, ayah: 255 }, null);
ck('No analysis → text split fallback', plan.parts.length > 1 && !plan.byPauses);
console.log(`${res.filter(Boolean).length}/${res.length}`);
console.log('groups:', groups.map((g, k) => `${k}:${g.length}w…${g[g.length - 1]}`).join('  '));
const r = recording([0, 1, 2, 3, 4, 5, 6, 7]);
console.log('stops:', r.pauses.filter(([a, b]) => b - a >= 0.3).length, 'voice', r.voice.map((x) => x.toFixed(2)).join('-'), 'dur', r.duration.toFixed(2));
// Random reciters: random subset of marks, local speed ±35%, a random overall pace.
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
let okRuns = 0; const N = 500; let worst = '';
for (let r = 0; r < N; r++) {
  const stopAt = [...Array(groups.length - 1).keys()].filter(() => rnd() < 0.5);
  if (!stopAt.length) { okRuns++; continue; }
  const base = 0.6 + rnd() * 1.2;
  const sp = groups.map(() => base * (0.65 + rnd() * 0.7));
  const pl = planParts(V, { surah: 2, ayah: 255 }, recording(stopAt, sp));
  const got = ends(pl).join(); const want = stopAt.map(markWord).join();
  if (got === want) okRuns++; else if (!worst) worst = `want ${want} got ${got}`;
}
console.log(`Random reciters: ${okRuns}/${N} split exactly where they stopped (${(100 * okRuns / N).toFixed(1)}%)`, worst ? `e.g. ${worst}` : '');
const sh = planParts(V, { surah: 2, ayah: 255 }, recording([4]), 'short');
const nw = (p) => tokens.slice(p.from, p.to).filter((x) => skeleton(x)).length;
console.log(sh.parts.map(nw).join('+'), sh.times.map((t) => `${t.start.toFixed(2)}-${Number.isFinite(t.end) ? t.end.toFixed(2) : 'end'}`).join(' '));
ck('"أجزاء أصغر": long stretches without a stop are split again (≤ 8 words each)', sh.parts.length > 2 && sh.parts.every((p) => nw(p) <= 8));
ck('…keeping his real stop as a cut', sh.parts.some((p) => tokens.slice(p.from, p.to).filter((x) => x !== 'ۚ').pop() === markWord(4)));
ck('…parts still reassemble the verse', sh.parts.map((p) => partText(V, p)).join(' ') === V);
ck('…times in order', sh.times.every((t, i) => !i || t.start >= sh.times[i - 1].start && t.start < (Number.isFinite(t.end) ? t.end : 1e9)));
