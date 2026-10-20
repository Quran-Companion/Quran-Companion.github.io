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
    return { duration: buffer.duration, pauses: findPauses(buffer), local };
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
export function findPauses(buffer) {
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
  if (!rms.length) return [];
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
  return pauses;
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
