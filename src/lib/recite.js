/**
 * Checks what the person recited (speech-recognition transcript) against the verse.
 *
 * Both sides are reduced to a consonant "skeleton": diacritics, Quranic marks and alef/hamza
 * forms are removed and a few letters are unified. This makes the Uthmani spelling of the
 * verse (e.g. "ٱلصَّلَوٰةَ") comparable with the everyday spelling a speech recogniser writes
 * ("الصلاة"). Matching is done word by word, in order, with a small tolerance for longer words.
 *
 * The verse text itself is never changed — this is only used for comparison.
 */

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿـ]/g;

export function skeleton(s = '') {
  return s
    .replace(MARKS, '')
    .replace(/[ٱأإآاٰ]/g, '')
    .replace(/ء/g, '')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-ي\s]/g, '')
    .trim();
}

/** Split exactly like the display does, so word indexes line up with the rendered text. */
export function verseWords(text = '') {
  return text.split(/\s+/).filter(Boolean);
}

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const allowedErrors = (len) => (len <= 3 ? 0 : len <= 6 ? 1 : 2);

/** Find word `w` in `s` at or after `from` (exact first, then approximate). Returns end index or -1. */
function find(s, w, from) {
  const exact = s.indexOf(w, from);
  const max = allowedErrors(w.length);
  if (max === 0) return exact >= 0 ? exact + w.length : -1;
  let bestEnd = exact >= 0 ? exact + w.length : -1;
  const limit = exact >= 0 ? exact : s.length;
  for (let j = from; j < limit; j++) {
    for (let L = w.length - max; L <= w.length + max; L++) {
      if (L <= 0 || j + L > s.length) continue;
      if (lev(s.slice(j, j + L), w, max) <= max) return j + L;
    }
  }
  return bestEnd;
}

const BASMALA = 'بسم لله لرحمن لرحيم';

/**
 * @returns {{ matched: boolean[], coverage: number, lastMatched: boolean, skipped: number, next: number, miss: number, after: number }}
 *   matched[i]  — word i of the verse was heard
 *   next        — first word not heard yet (-1 when all were heard)
 *   miss        — first word that was skipped or said wrong, i.e. not heard while a LATER word was (-1 if none)
 *   after       — how many words were heard after `miss` (more = surer it's a real mistake)
 *   coverage    — share of the verse's letters that were heard, 0..1
 *   skipped     — leading words not required (the Basmala printed at the top of verse 1)
 */
export function matchRecitation(verseText, said, { surah, ayah } = {}) {
  const words = verseWords(verseText);
  const sk = words.map(skeleton);
  const matched = sk.map((w) => !w); // tokens that are only marks (e.g. ۚ ۞) count as done
  let skipped = 0;
  // Verse 1 of most surahs is shown with the Basmala; reciting it is optional.
  if (ayah === 1 && surah !== 1 && sk.slice(0, 4).join(' ') === BASMALA) {
    skipped = 4;
    for (let i = 0; i < 4; i++) matched[i] = true;
  }
  const s = skeleton(said).replace(/\s+/g, '');
  let pos = 0;
  let total = 0;
  let got = 0;
  for (let i = skipped; i < sk.length; i++) {
    const w = sk[i];
    if (!w) continue;
    total += w.length;
    const end = find(s, w, pos);
    if (end >= 0) {
      matched[i] = true;
      got += w.length;
      pos = end;
    }
  }
  let last = sk.length - 1;
  while (last >= 0 && !sk[last]) last--;
  let next = -1;
  let miss = -1;
  let after = 0;
  for (let i = skipped; i < sk.length; i++) {
    if (!sk[i]) continue;
    if (!matched[i]) {
      if (next < 0) next = i;
    } else if (next >= 0) {
      if (miss < 0) miss = next;
      after += 1;
    }
  }
  return { matched, coverage: total ? got / total : 0, lastMatched: last >= skipped && matched[last], skipped, next, miss, after };
}
