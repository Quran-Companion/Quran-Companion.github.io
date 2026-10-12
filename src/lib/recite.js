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

// Once part of the verse was heard, the next word must come within this many letters.
// (Allows a few repeated / extra words, but stops a missed word from "matching" far ahead,
// e.g. inside the next verse.)
const GAP = 40;

/** Find word `w` in `s` from `from` up to `until` (exact first, then approximate). Returns [start, end] or null. */
function find(s, w, from, until = s.length) {
  let exact = s.indexOf(w, from);
  if (exact >= 0 && exact > until) exact = -1;
  const max = allowedErrors(w.length);
  if (max === 0) return exact >= 0 ? [exact, exact + w.length] : null;
  const limit = exact >= 0 ? exact : Math.min(s.length, until + 1);
  for (let j = from; j < limit; j++) {
    for (let L = w.length - max; L <= w.length + max; L++) {
      if (L <= 0 || j + L > s.length) continue;
      if (lev(s.slice(j, j + L), w, max) <= max) return [j, j + L];
    }
  }
  return exact >= 0 ? [exact, exact + w.length] : null;
}

/** The transcript as one string of letters (what positions below refer to). */
export const saidSkeleton = (said) => skeleton(said).replace(/\s+/g, '');

const BASMALA = 'بسم لله لرحمن لرحيم';

/**
 * @returns {{ matched: boolean[], coverage: number, lastMatched: boolean, skipped: number, next: number, miss: number, after: number }}
 *   matched[i]  — word i of the verse was heard
 *   next        — first word not heard yet (-1 when all were heard)
 *   miss        — first word that was skipped or said wrong, i.e. not heard while a LATER word was (-1 if none)
 *   after       — how many words were heard after `miss` (more = surer it's a real mistake)
 *   start/end   — letter positions (in saidSkeleton) of the first / after the last heard word, -1 if none
 *   complete    — every word was heard
 * opts.from: start looking at this letter position (continuous recitation: where this verse began).
 *   coverage    — share of the verse's letters that were heard, 0..1
 *   skipped     — leading words not required (the Basmala printed at the top of verse 1)
 */
export function matchRecitation(verseText, said, ctx = {}, opts = {}) {
  const s = opts.s ?? saidSkeleton(said);
  const from = opts.from || 0;
  // People stop, hesitate, or look at the verse and start again. Try every place the verse could
  // (re)start — where one of its first words was said — and keep the best reading, so a fresh
  // attempt isn't tied to an earlier, broken-off one.
  let best = matchFrom(verseText, s, ctx, from);
  if (best.complete) return best;
  const words = verseWords(verseText).map(skeleton);
  const heads = [];
  for (let i = best.skipped; i < words.length && heads.length < 3; i++) if (words[i] && words[i].length >= 2) heads.push(words[i]);
  const starts = new Set();
  for (const h of heads) {
    for (let at = s.indexOf(h, from + 1); at >= 0; at = s.indexOf(h, at + 1)) starts.add(at);
  }
  // The most recent attempts matter most (bounded work on long transcripts).
  const recent = [...starts].sort((a, b) => b - a).slice(0, 12);
  for (const at of recent) {
    if (at === best.start) continue;
    const r = matchFrom(verseText, s, ctx, at);
    if (r.coverage > best.coverage + 1e-9 || (r.coverage === best.coverage && r.coverage > 0 && r.start > best.start && r.next >= best.next)) best = r;
    if (best.complete) break;
  }
  return best;
}

function matchFrom(verseText, s, { surah, ayah } = {}, from = 0) {
  const words = verseWords(verseText);
  const sk = words.map(skeleton);
  const matched = sk.map((w) => !w); // tokens that are only marks (e.g. ۚ ۞) count as done
  let skipped = 0;
  // Verse 1 of most surahs is shown with the Basmala; reciting it is optional.
  if (ayah === 1 && surah !== 1 && sk.slice(0, 4).join(' ') === BASMALA) {
    skipped = 4;
    for (let i = 0; i < 4; i++) matched[i] = true;
  }
  let pos = from;
  let total = 0;
  let got = 0;
  let start = -1;
  for (let i = skipped; i < sk.length; i++) {
    const w = sk[i];
    if (!w) continue;
    total += w.length;
    let hit = find(s, w, pos, start < 0 ? s.length : pos + GAP);
    if (!hit && start >= 0) {
      // Long pause / hesitation in the middle, then carried on from here: accept the word further
      // ahead only if the word after it follows straight away (so a lone coincidence doesn't count).
      const far = find(s, w, pos);
      let k = i + 1;
      while (k < sk.length && !sk[k]) k++;
      const nextW = sk[k];
      if (far && (!nextW ? false : Boolean(find(s, nextW, far[1], far[1] + 6)))) hit = far;
    }
    if (hit) {
      matched[i] = true;
      got += w.length;
      if (start < 0) start = hit[0];
      pos = hit[1];
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
  return { matched, coverage: total ? got / total : 0, lastMatched: last >= skipped && matched[last], skipped, next, miss, after, real: sk.map(Boolean), start, end: start < 0 ? -1 : pos, complete: next < 0 };
}
