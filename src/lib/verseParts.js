/**
 * Splitting long verses into parts for "repeat after the sheikh".
 *
 * Text: parts end at the Quran's own pause marks (ۚ ۖ ۗ ۘ ۙ ۛ — printed as separate tokens in the
 * Uthmani text) when one is near the ideal split point, otherwise at a word boundary.
 * Audio: the reciter's recording is analysed for silences (he breathes at those marks); each cut is
 * made in the silence nearest to where the text split falls. The verse text is never changed —
 * parts are just ranges of its words.
 */
import { skeleton, verseWords } from './recite.js';

const PAUSE_MARK = /^[ۖ-ۛ]+$/;
const BASMALA = 'بسم لله لرحمن لرحيم';

/** Words per part for each setting. */
export const SPLIT_TARGET = { auto: 10, short: 6, off: Infinity };

/**
 * @returns {{ from: number, to: number, letters: number }[]} token ranges [from, to) covering the verse.
 *   letters = letters of the part that are in the recording (the Basmala isn't — it's a separate file).
 */
export function splitVerse(text, { surah, ayah } = {}, mode = 'auto') {
  const tokens = verseWords(text);
  const sk = tokens.map(skeleton);
  let skip = 0;
  if (ayah === 1 && surah !== 1 && sk.slice(0, 4).join(' ') === BASMALA) skip = 4;
  const real = []; // token index of every real word after the Basmala
  for (let i = skip; i < tokens.length; i++) if (sk[i]) real.push(i);
  const letters = (from, to) => { let n = 0; for (let i = Math.max(from, skip); i < to; i++) n += sk[i].length; return n; };
  const whole = [{ from: 0, to: tokens.length, letters: letters(0, tokens.length) }];
  const target = SPLIT_TARGET[mode] ?? SPLIT_TARGET.auto;
  const n = real.length;
  if (!Number.isFinite(target) || n <= Math.round(target * 1.4)) return whole;

  const k = Math.max(2, Math.round(n / target));
  // Where a part may start: right after a pause mark (best), or after any word.
  const after = (wordNo) => { // token index just after the wordNo-th real word (and any marks following it)
    let t = real[wordNo - 1] + 1;
    while (t < tokens.length && !sk[t]) t++;
    return t;
  };
  const marks = [];
  for (let i = skip; i < tokens.length; i++) {
    if (PAUSE_MARK.test(tokens[i])) {
      const before = real.filter((r) => r < i).length;
      if (before > 0 && before < n) marks.push({ at: i + 1, before });
    }
  }
  const cuts = [];
  let prev = 0;
  for (let j = 1; j < k; j++) {
    const ideal = (j * n) / k;
    let best = null;
    for (const m of marks) {
      if (m.before - prev < 3 || n - m.before < 3) continue;
      const d = Math.abs(m.before - ideal);
      if (d <= target * 0.6 && (!best || d < best.d)) best = { at: m.at, before: m.before, d };
    }
    if (!best) {
      const before = Math.min(n - 3, Math.max(prev + 3, Math.round(ideal)));
      if (before - prev < 3 || n - before < 3) continue;
      best = { at: after(before), before };
    }
    if (best.before <= prev) continue;
    cuts.push(best.at);
    prev = best.before;
  }
  if (!cuts.length) return whole;
  const bounds = [0, ...cuts, tokens.length];
  return bounds.slice(0, -1).map((from, i) => ({ from, to: bounds[i + 1], letters: letters(from, bounds[i + 1]) }));
}

/** The words of one part (for checking what was recited — not for display). */
export const partText = (text, part) => verseWords(text).slice(part.from, part.to).join(' ');

// ---- Audio analysis -------------------------------------------------------------------------

const analyses = new Map();

/**
 * Decode a recording and find its silences. Needs the file to be readable by the page (CORS);
 * otherwise this rejects and the caller falls back to an estimate.
 * Also returns a local copy of the file to play from: jumping into the middle of it always works
 * (some servers can't serve part of a file), and it isn't downloaded twice.
 * @returns {Promise<{ duration: number, pauses: [number, number][], local: string }>}
 */
export function analyzeAudio(url) {
  if (analyses.has(url)) return analyses.get(url);
  const job = (async () => {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`audio ${res.status}`);
    const data = await res.arrayBuffer();
    const local = URL.createObjectURL(new Blob([data], { type: res.headers.get('content-type') || 'audio/mpeg' })); // copy, before decoding detaches `data`
    const buffer = await decode(data);
    const { pauses, voice } = findPauses(buffer, true);
    return { duration: buffer.duration, pauses, voice, local };
  })();
  analyses.set(url, job);
  job.catch(() => analyses.delete(url));
  return job;
}

function decode(data) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (Offline) {
    const ctx = new Offline(1, 8000, 8000);
    return new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(data, resolve, reject); // callback form for older Safari
      if (p?.then) p.then(resolve, reject);
    });
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  return ctx.decodeAudioData(data).finally(() => ctx.close?.());
}

/** Silences (in seconds) inside the recording: loudness well below the reciter's voice for ≥ 0.18 s. */
export function findPauses(buffer, withVoice = false) {
  const ch = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  const frame = Math.max(1, Math.round(rate * 0.02)); // 20 ms
  const step = Math.max(1, Math.floor(frame / 64)); // sample a subset — fast, plenty accurate
  const rms = [];
  for (let i = 0; i + frame <= ch.length; i += frame) {
    let sum = 0;
    let cnt = 0;
    for (let j = i; j < i + frame; j += step) { sum += ch[j] * ch[j]; cnt++; }
    rms.push(Math.sqrt(sum / cnt));
  }
  if (!rms.length) return withVoice ? { pauses: [], voice: [0, buffer.duration] } : [];
  const sorted = [...rms].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)];
  const thr = Math.max(0.004, loud * 0.12);
  const pauses = [];
  let start = -1;
  for (let f = 0; f <= rms.length; f++) {
    const quiet = f < rms.length && rms[f] < thr;
    if (quiet && start < 0) start = f;
    if (!quiet && start >= 0) {
      const s = (start * frame) / rate;
      const e = (f * frame) / rate;
      // not the silence at the very start / end of the file
      if (e - s >= 0.18 && start > 0 && f < rms.length) pauses.push([s, e]);
      start = -1;
    }
  }
  if (!withVoice) return pauses;
  // Where his voice starts and ends in the file (leading/trailing silence excluded).
  let a = 0;
  while (a < rms.length && rms[a] < thr) a++;
  let b = rms.length - 1;
  while (b > a && rms[b] < thr) b--;
  return { pauses, voice: [(a * frame) / rate, ((b + 1) * frame) / rate] };
}

/**
 * Start/end times for each part. With an analysis, cuts are placed in the reciter's pause nearest
 * to where the text split falls; without one, times are estimated from the words' length
 * (as fractions of the recording, resolved once its duration is known).
 * @returns {{ start: number, end: number, frac: boolean, measured: boolean }[]}
 */
export function partTimes(parts, analysis) {
  const total = parts.reduce((n, p) => n + p.letters, 0) || 1;
  let acc = 0;
  const ideal = parts.slice(0, -1).map((p) => { acc += p.letters; return acc / total; });
  if (!analysis) {
    const cuts = [0, ...ideal, 1];
    return parts.map((_, i) => ({ start: Math.max(0, cuts[i] - (i ? 0.015 : 0)), end: Math.min(1, cuts[i + 1] + (i < parts.length - 1 ? 0.015 : 0)), frac: true, measured: false }));
  }
  const { duration: D, pauses } = analysis;
  const window = Math.max(1.5, D * 0.12);
  const used = new Set();
  const cuts = ideal.map((f) => {
    const t = f * D;
    let best = -1;
    pauses.forEach(([s, e], k) => {
      if (used.has(k)) return;
      const c = (s + e) / 2;
      if (Math.abs(c - t) <= window && (best < 0 || Math.abs(c - t) < Math.abs((pauses[best][0] + pauses[best][1]) / 2 - t))) best = k;
    });
    if (best < 0) return { end: t + 0.25, start: t - 0.25, measured: false };
    used.add(best);
    const [s, e] = pauses[best];
    // end in the silence just after his voice stops; start just before it resumes
    return { end: Math.min(s + 0.15, (s + e) / 2), start: Math.max(e - 0.15, (s + e) / 2), measured: true };
  });
  return parts.map((_, i) => ({
    start: i ? Math.max(0, cuts[i - 1].start) : 0,
    end: i < parts.length - 1 ? cuts[i].end : D + 1,
    frac: false,
    measured: i ? cuts[i - 1].measured : (cuts[0]?.measured ?? true),
  }));
}

// ---- Stop where the sheikh stops ------------------------------------------------------------

/** A verse this long (words) is recited in parts. */
export const LONG_VERSE = 12;

/** Is this verse recited in parts (with this setting)? */
export function isLong(text, { surah, ayah } = {}, mode = 'auto') {
  if (mode === 'off') return false;
  const sk = verseWords(text).map(skeleton);
  const skip = ayah === 1 && surah !== 1 && sk.slice(0, 4).join(' ') === BASMALA ? 4 : 0;
  return sk.slice(skip).filter(Boolean).length >= LONG_VERSE;
}

/**
 * Parts that follow the reciter: every real stop he makes in the recording (a silence of a breath,
 * ≥ 0.3 s — or ≥ 0.2 s for "smaller parts") ends a part. Each stop is matched to the place in the
 * text where he stopped: the pause mark (ۚ ۖ ۗ …) that best fits his timing — found for all stops
 * together, in order, so a slower or faster stretch doesn't throw the rest off — or, if no mark fits,
 * the word boundary at that point.
 * Without an analysis, falls back to the text-only split with estimated times.
 * @returns {{ parts: {from,to,letters}[], times: {start,end,frac,measured}[], byPauses: boolean }}
 */
export function planParts(text, ctx = {}, analysis = null, mode = 'auto') {
  const whole = splitVerse(text, ctx, 'off');
  const tokens = verseWords(text);
  const sk = tokens.map(skeleton);
  let skip = 0;
  if (ctx.ayah === 1 && ctx.surah !== 1 && sk.slice(0, 4).join(' ') === BASMALA) skip = 4;
  const real = [];
  for (let i = skip; i < tokens.length; i++) if (sk[i]) real.push(i);
  const n = real.length;
  if (mode === 'off' || n < LONG_VERSE) return { parts: whole, times: [{ start: 0, end: Infinity, frac: false, measured: true }], byPauses: false };
  if (!analysis) {
    const parts = splitVerse(text, ctx, mode === 'short' ? 'short' : 'auto');
    return { parts, times: partTimes(parts, null), byPauses: false };
  }
  const { duration: D, pauses } = analysis;
  const [vs, ve] = analysis.voice || [0, D];
  const span = Math.max(0.1, ve - vs);
  const minStop = mode === 'short' ? 0.2 : 0.3;
  const stops = pauses.filter(([a, b]) => b - a >= minStop && a > vs && b < ve);
  if (!stops.length) { // he recites it in one breath — split by text, cut in the nearest small gaps
    const parts = splitVerse(text, ctx, mode === 'short' ? 'short' : 'auto');
    return { parts, times: partTimes(parts, analysis), byPauses: false };
  }
  // letters before each token → share of the recited verse
  const before = new Array(tokens.length + 1).fill(0);
  for (let i = 0; i < tokens.length; i++) before[i + 1] = before[i] + (i >= skip ? sk[i].length : 0);
  const total = before[tokens.length] || 1;
  const wordsBefore = (t) => real.filter((r) => r < t).length;
  // Candidate places in the text: just after a pause mark.
  const marks = [];
  for (let i = skip; i < tokens.length; i++) {
    if (PAUSE_MARK.test(tokens[i])) {
      const at = i + 1;
      const w = wordsBefore(at);
      if (w > 0 && w < n) marks.push({ at, f: before[at] / total });
    }
  }
  // How far into the verse each stop is, counting only time he is reciting (silences left out —
  // otherwise every earlier breath would push the later stops off).
  const gaps = pauses.filter(([a, b]) => a > vs && b < ve);
  const silentBefore = (t) => gaps.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, t) - a), 0);
  const spoken = Math.max(0.1, span - silentBefore(ve));
  const tf = stops.map(([a]) => (a - vs - silentBefore(a)) / spoken);
  // Match stops → marks in order (dynamic programming). Two things are weighed:
  //  · where the stop falls in the verse vs. where the mark is (share of the letters), and
  //  · steady pace: the time between two stops should fit the letters between their marks
  //    (a reciter's speed changes a little within a verse, not a lot).
  // A stop may also match no mark (a breath mid-phrase), at a cost.
  const SKIP = 0.12;
  const P = stops.length;
  const M = marks.length;
  const spokenAt = stops.map(([a]) => a - vs - silentBefore(a));
  const pace = spoken / total; // seconds per letter, whole verse
  const paceCost = (tPrev, fPrev, t, f) => {
    const letters = (f - fPrev) * total;
    if (letters <= 0) return Infinity;
    const r = (t - tPrev) / letters / pace;
    return 0.15 * Math.log(r) ** 2;
  };
  // Simpler, exact formulation: state = (stop p, last used mark m).
  const S = Array.from({ length: P + 1 }, () => new Array(M + 1).fill(null));
  S[0][0] = { c: 0, t: 0, f: 0, from: null, pair: false };
  for (let p = 1; p <= P; p++) {
    for (let m = 0; m <= M; m++) {
      let bestHere = null;
      // stop p matches no mark: last used mark stays m
      const keep = S[p - 1][m];
      if (keep) bestHere = { c: keep.c + SKIP, t: keep.t, f: keep.f, from: [p - 1, m], pair: false };
      // stop p matches mark m (coming from any earlier last mark k < m)
      if (m > 0) {
        for (let k = 0; k < m; k++) {
          const prev = S[p - 1][k];
          if (!prev) continue;
          const c = prev.c + Math.abs(tf[p - 1] - marks[m - 1].f) + paceCost(prev.t, prev.f, spokenAt[p - 1], marks[m - 1].f);
          if (!bestHere || c < bestHere.c) bestHere = { c, t: spokenAt[p - 1], f: marks[m - 1].f, from: [p - 1, k], pair: true };
        }
      }
      S[p][m] = bestHere;
    }
  }
  // the end of the verse must fit the pace too
  let end = null;
  for (let m = 0; m <= M; m++) {
    const st = S[P][m];
    if (!st) continue;
    const c = st.c + paceCost(st.t, st.f, spoken, 1);
    if (!end || c < end.c) end = { c, m };
  }
  const cutAt = new Array(P).fill(null);
  for (let p = P, m = end ? end.m : 0; p > 0;) {
    const st = S[p][m];
    if (st.pair) cutAt[p - 1] = marks[m - 1].at;
    [p, m] = st.from;
  }
  // A stop with no mark: cut at the word boundary at that point of the verse.
  cutAt.forEach((c, p) => {
    if (c != null) return;
    const goal = tf[p] * total;
    let best = null;
    for (let w = 1; w < n; w++) {
      let t = real[w - 1] + 1;
      while (t < tokens.length && !sk[t]) t++;
      const d = Math.abs(before[t] - goal);
      if (!best || d < best.d) best = { t, d };
    }
    cutAt[p] = best ? best.t : null;
  });
  // Build parts; drop a stop that would leave a part shorter than 2 words (a quick breath).
  const cuts = [];
  let last = 0;
  let lastWords = 0;
  cutAt.forEach((t, p) => {
    if (t == null || t <= last) return;
    const w = wordsBefore(t);
    if (w - lastWords < 2 || n - w < 2) return;
    cuts.push({ t, stop: stops[p] });
    last = t;
    lastWords = w;
  });
  if (!cuts.length) return { parts: whole, times: [{ start: 0, end: Infinity, frac: false, measured: true }], byPauses: true };
  const bounds = [0, ...cuts.map((c) => c.t), tokens.length];
  const parts = bounds.slice(0, -1).map((from, i) => ({ from, to: bounds[i + 1], letters: before[bounds[i + 1]] - before[from] }));
  const times = parts.map((_, i) => {
    const prev = cuts[i - 1]?.stop;
    const next = cuts[i]?.stop;
    return {
      // start just before his voice comes back; end just after it stops
      start: prev ? Math.max((prev[0] + prev[1]) / 2, prev[1] - 0.15) : 0,
      end: next ? Math.min((next[0] + next[1]) / 2, next[0] + 0.15) : Infinity,
      frac: false,
      measured: true,
    };
  });
  if (mode === 'short') return refineShort(tokens, sk, real, before, parts, times, gaps, ve);
  return { parts, times, byPauses: true };
}

/**
 * "Smaller parts": a stretch he recites in one go that is still long (> 8 words) is split again —
 * at a pause mark (or a word) near its middle, cut in the small gap nearest that point if there is
 * one, else at the matching share of that stretch's time.
 */
function refineShort(tokens, sk, real, before, parts, times, gaps, voiceEnd) {
  const MAX = 8;
  const outP = [];
  const outT = [];
  parts.forEach((pt, i) => {
    const t0 = times[i];
    const t = { ...t0, end: Number.isFinite(t0.end) ? t0.end : voiceEnd }; // last part: up to where his voice ends
    const words = real.filter((r) => r >= pt.from && r < pt.to);
    if (words.length <= MAX) { outP.push(pt); outT.push(t0); return; }
    const k = Math.ceil(words.length / (MAX - 2)); // aim for ~6, so snapping to a mark stays ≤ 8
    let from = pt.from;
    let start = t.start;
    for (let j = 1; j < k; j++) {
      const ideal = Math.round((j * words.length) / k);
      // a pause mark within 2 words of the ideal point, else the word boundary there
      let cut = null;
      for (let d = 0; d <= 2 && cut == null; d++) {
        for (const w of [ideal - d, ideal + d]) {
          if (w < 2 || words.length - w < 2) continue;
          let tt = words[w - 1] + 1;
          if (tt < tokens.length && !sk[tt] && /^[\u06D6-\u06DB]+$/.test(tokens[tt])) { cut = tt + 1; break; }
        }
      }
      if (cut == null) { cut = words[ideal - 1] + 1; while (cut < tokens.length && !sk[cut]) cut++; }
      if (cut <= from || cut >= pt.to) continue;
      const share = (before[cut] - before[pt.from]) / Math.max(1, before[pt.to] - before[pt.from]);
      const goal = t.start + share * (t.end - t.start);
      const g = gaps.filter(([a, b]) => (a + b) / 2 > start + 0.3 && (a + b) / 2 < t.end - 0.3)
        .sort((x, y) => Math.abs((x[0] + x[1]) / 2 - goal) - Math.abs((y[0] + y[1]) / 2 - goal))[0];
      const near = g && Math.abs((g[0] + g[1]) / 2 - goal) < Math.max(0.8, (t.end - t.start) * 0.15);
      const endHere = near ? Math.min((g[0] + g[1]) / 2, g[0] + 0.12) : goal + 0.2;
      const nextStart = near ? Math.max((g[0] + g[1]) / 2, g[1] - 0.12) : goal - 0.2;
      outP.push({ from, to: cut, letters: before[cut] - before[from] });
      outT.push({ start, end: endHere, frac: false, measured: Boolean(near) });
      from = cut;
      start = nextStart;
    }
    outP.push({ from, to: pt.to, letters: before[pt.to] - before[from] });
    outT.push({ ...t0, start });
  });
  return { parts: outP, times: outT, byPauses: true };
}
