import { useCallback, useEffect, useRef, useState } from 'react';
import { matchRecitation, saidSkeleton, findWord, verseWords } from '../lib/recite';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
// Chrome on Android is unreliable in "continuous" mode (repeated results, sessions that silently die);
// short sessions restarted after each phrase work much better there.
const ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
export const speechSupported = Boolean(SR);

/**
 * Listens with the browser's speech recognition (Arabic) and checks the words against the verse.
 * The turn only passes when enough of the verse was actually said (see recite.js).
 *
 * status: 'idle' | 'starting' | 'listening' | 'success' | 'retry' | 'mistake' | 'error'
 *
 * Correction mode (onMistake given): the turn stops at the first wrong/skipped word — as soon as
 * `mistakeAfter` later words were heard (so one mis-heard word doesn't trigger it), or when the
 * person stops before the end of the verse. onMistake(result, wordIndex) gets where it went wrong.
 * error:  'denied' | 'network' | 'unsupported' | null
 *
 * Note: Chrome sends the audio to Google's speech service, Safari to Apple's (or on-device).
 */
export function useReciteCheck({ threshold = 0.7, pauseMs = 1000, onSuccess, onMistake, mistakeAfter = 0, onVerse, onFlowEnd } = {}) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { matched, coverage, lastMatched }
  const [heard, setHeard] = useState('');
  const rec = useRef(null);
  const turn = useRef(null); // { text, ctx, finals, active, lastAt, started }
  const timer = useRef(0);
  const cfg = useRef({});
  cfg.current = { threshold, pauseMs, onSuccess, onMistake, mistakeAfter, onVerse, onFlowEnd };

  const clear = () => clearInterval(timer.current);

  const stopRec = () => {
    const r = rec.current;
    rec.current = null;
    if (r) { r.onresult = r.onend = r.onerror = r.onaudiostart = null; try { r.abort(); } catch { /* ignore */ } }
  };

  const end = useCallback((st) => {
    clear();
    if (turn.current) turn.current.active = false;
    stopRec();
    setStatus(st);
  }, []);

  useEffect(() => () => { clear(); stopRec(); }, []);

  const evaluate = (texts) => {
    const T = turn.current;
    if (!T) return null;
    // Take the best of the alternatives the recogniser offered.
    let best = null;
    for (const t of texts) {
      const r = matchRecitation(T.text, t, T.ctx);
      if (!best || r.coverage > best.coverage) best = { ...r, said: t };
    }
    return best;
  };

  const listen = useCallback(() => {
    const T = turn.current;
    if (!T?.active) return;
    const r = new SR();
    r.lang = 'ar-SA';
    r.continuous = !ANDROID;
    r.interimResults = true;
    r.maxAlternatives = 3;
    rec.current = r;
    const alive = () => { if (turn.current) turn.current.lastEvt = performance.now(); };
    alive();
    r.onaudiostart = () => { alive(); if (turn.current?.active) { turn.current.fails = 0; setStatus('listening'); } };
    r.onspeechstart = alive;
    r.onsoundstart = alive;
    r.onresult = (e) => {
      const T2 = turn.current;
      if (!T2?.active) return;
      alive();
      // Rebuild this session's text from ALL its results (not just from resultIndex): Chrome on
      // Android sometimes reports a wrong resultIndex, or sends each final again with everything
      // said before it. Finals that just repeat/extend the previous one replace it.
      const fin = [];
      let interim = [''];
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const t = res[0].transcript.trim();
          if (!t) continue;
          const last = fin[fin.length - 1];
          // (e.g. 94:5 then 94:6 differ only by «ف», so only a final that STARTS with the previous one counts as a repeat)
          if (last && last.split(' ').length >= 2 && t.replace(/\s+/g, ' ').startsWith(last.replace(/\s+/g, ' '))) fin[fin.length - 1] = t;
          else fin.push(t);
        } else {
          interim = Array.from(res).map((alt) => alt.transcript);
        }
      }
      T2.session = fin.join(' ');
      T2.pending = interim[0] || '';
      const base = [...T2.finals, T2.session].join(' ');
      T2.lastAt = performance.now();
      if (T2.flow) { scheduleFlow(T2, `${base} ${interim[0]}`); return; }
      const best = evaluate(interim.map((x) => `${base} ${x}`));
      if (!best) return;
      setHeard(best.said.trim());
      setResult(best);
      T2.best = best;
      // The whole verse is there (last word heard) → pass right away.
      if (best.coverage >= cfg.current.threshold && best.lastMatched && !(cfg.current.onMistake && best.miss >= 0)) {
        end('success');
        cfg.current.onSuccess?.(best);
        return;
      }
      // Correction mode: a word was skipped or said wrong and the reciter went on past it.
      const { onMistake: om, mistakeAfter: n } = cfg.current;
      if (om && n > 0 && best.miss >= 0 && (best.after >= n || best.lastMatched)) {
        end('mistake');
        om(best, best.miss);
      }
    };
    r.onerror = (e) => {
      alive();
      if (e.error === 'no-speech' || e.error === 'aborted' || e.error === 'audio-capture') return; // onend restarts
      console.warn('[speech]', e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setError('denied'); end('error'); }
      else if (e.error === 'language-not-supported') { setError('unsupported'); end('error'); }
      else if (e.error === 'network') {
        // Mobile connections drop for a moment — retry a few times before giving up.
        const T3 = turn.current;
        if (T3) T3.fails = (T3.fails || 0) + 1;
        if (!T3 || T3.fails > 4) { setError('network'); end('error'); }
      }
    };
    // Recognition stops by itself after a pause on some devices — keep listening until the turn ends.
    // What this session heard is kept (plus any last words that never became "final").
    r.onend = () => {
      const T3 = turn.current;
      if (T3?.active && rec.current === r) {
        const kept = [T3.session, T3.pending].filter(Boolean).join(' ');
        if (kept) T3.finals.push(kept);
        T3.session = '';
        T3.pending = '';
        rec.current = null;
        setTimeout(listen, (T3.fails || 0) ? 400 * T3.fails : 60);
      }
    };
    try { r.start(); } catch (e) {
      // e.g. the previous session hasn't released the mic yet — try again shortly.
      console.warn('[speech] start', e);
      if (rec.current === r) rec.current = null;
      const T4 = turn.current;
      if (T4?.active) { T4.fails = (T4.fails || 0) + 1; setTimeout(listen, 300); }
    }
  }, [end]);

  // If the recogniser goes silent without telling us (it happens on phones), start it again.
  const watchdog = (T, now) => {
    if (!T.active || !T.lastEvt || now - T.lastEvt < 9000) return;
    const kept = [T.session, T.pending].filter(Boolean).join(' ');
    if (kept) T.finals.push(kept);
    T.session = '';
    T.pending = '';
    stopRec();
    T.lastEvt = now;
    listen();
  };

  // ---- Continuous recitation ("flow"): one listening session follows you through the verses. ----
  // A verse is done only when ALL of it has been said. Words heard stay heard (you can restart or
  // go back), a word you skipped turns red until you say it, and then the next verse follows.
  const finishVerse = (T, marks, endPos) => {
    const i = T.i;
    T.i += 1;
    T.cur = null;
    T.got = null;
    T.bad = null;
    T.offset = Math.max(T.offset, endPos);
    setResult(null);
    cfg.current.onVerse?.(T.base + i, { matched: marks, real: marks.map((_, k) => T.real[k]) });
    if (T.i >= T.list.length) { end('success'); cfg.current.onFlowEnd?.(); return false; }
    return true;
  };

  const flowStep = (T, text) => {
    const full = saidSkeleton(text);
    for (;;) {
      const v = T.list[T.i];
      if (!v) return;
      // Only the recent part of what was said matters (heard words are remembered) — keeps it fast.
      const from = Math.max(T.offset, full.length - 700);
      const cur = matchRecitation(v.text, '', v.ctx, { from, s: full });
      if (!T.got) { T.got = cur.matched.map(() => false); T.bad = new Set(); T.real = cur.real; T.end = T.offset; }
      cur.matched.forEach((m, k) => { if (m) T.got[k] = true; });
      if (cur.end > T.end) T.end = cur.end;
      // A word you skipped: said on its own afterwards still counts.
      T.bad.forEach((k) => {
        if (T.got[k]) return;
        const hit = findWord(full, verseWords(v.text)[k], Math.max(from, cur.end >= 0 ? cur.end - 2 : from));
        if (hit) { T.got[k] = true; if (hit[1] > T.end) T.end = hit[1]; }
      });
      // Words passed over (a later word was heard) are mistakes.
      let lastGot = -1;
      T.got.forEach((g, k) => { if (g && T.real[k]) lastGot = k; });
      for (let k = cur.skipped; k < lastGot; k++) if (T.real[k] && !T.got[k]) T.bad.add(k);
      const done = T.got.every((g, k) => g || !T.real[k] || k < cur.skipped);
      if (done) {
        // The record keeps words you had skipped (and said later) in red, so you see where you slipped.
        const marks = T.got.map((g, k) => (!T.real[k] || k < cur.skipped ? true : T.bad.has(k) ? 'bad' : true));
        if (!finishVerse(T, marks, T.end)) return;
        continue;
      }
      // Live: heard = green, skipped and still missing = red, not yet said = hidden.
      const shown = T.got.map((g, k) => (!T.real[k] || g ? true : T.bad.has(k) ? 'bad' : false));
      T.cur = { ...cur, matched: shown };
      setResult(T.cur);
      setHeard(text.trim());
      return;
    }
  };

  // Run the (relatively heavy) check at most ~7 times a second, always on the latest words.
  const scheduleFlow = (T, text) => {
    T.latest = text;
    if (T.flowTimer) return;
    const run = () => { T.flowTimer = 0; T.lastRun = performance.now(); if (T.active) flowStep(T, T.latest); };
    const wait = 140 - (performance.now() - (T.lastRun || 0));
    if (wait <= 0) run();
    else T.flowTimer = setTimeout(run, wait);
  };

  /** Give up on the current verse (its unsaid words are marked as mistakes) and go on. */
  const skipVerse = useCallback(() => {
    const T = turn.current;
    if (!T?.flow || !T.active) return;
    const v = T.list[T.i];
    const base = matchRecitation(v.text, '', v.ctx);
    if (!T.got) { T.got = base.matched.map(() => false); T.bad = new Set(); T.real = base.real; }
    const marks = T.got.map((g, k) => (!T.real[k] || k < base.skipped ? true : g && !T.bad.has(k) ? true : 'bad'));
    finishVerse(T, marks, saidSkeleton([...T.finals, T.session, T.pending].join(' ')).length);
  }, [end]);

  /** Continuous recitation through `list` ([{ text, ctx }]); indexes reported from `base`. */
  const startFlow = useCallback((list, base = 0) => {
    clear();
    stopRec();
    setError(null);
    setHeard('');
    setResult(null);
    if (!SR) { setError('unsupported'); setStatus('error'); return; }
    turn.current = { flow: true, list, base, i: 0, offset: 0, cur: null, got: null, finals: [], session: '', pending: '', active: true, lastAt: 0, started: performance.now() };
    setStatus('starting');
    listen();
    timer.current = setInterval(() => {
      const T = turn.current;
      if (!T?.active) return clear();
      const now = performance.now();
      watchdog(T, now);
      // Nothing said for a long while → pause listening (you can carry on with one tap).
      if (now - Math.max(T.lastAt, T.started) > 45000) end('retry');
    }, 150);
  }, [listen, end]);

  /** Start a turn for this verse. */
  const start = useCallback((text, ctx) => {
    clear();
    stopRec();
    setError(null);
    setHeard('');
    setResult(null);
    if (!SR) { setError('unsupported'); setStatus('error'); return; }
    turn.current = { text, ctx, finals: [], session: '', pending: '', active: true, lastAt: 0, started: performance.now(), best: null };
    setStatus('starting');
    listen();
    // Decide after a pause: enough of the verse → pass; something said but not enough → "try again".
    timer.current = setInterval(() => {
      const T = turn.current;
      if (!T?.active) return clear();
      const now = performance.now();
      const { threshold: thr, pauseMs: pause } = cfg.current;
      const om = cfg.current.onMistake;
      if (T.best && T.lastAt && now - T.lastAt > pause && T.best.coverage >= thr && !(om && T.best.miss >= 0)) {
        const b = T.best;
        end('success');
        cfg.current.onSuccess?.(b);
      } else if (om && T.best && T.lastAt && now - T.lastAt > pause + 1200) {
        // Stopped before the end (forgot) or with a wrong word → show where.
        const b = T.best;
        end('mistake');
        om(b, b.miss >= 0 ? b.miss : b.next);
      } else if (T.best && T.lastAt && now - T.lastAt > pause + 1800) {
        end('retry');
      } else if (now - T.started > 30000) {
        end('retry');
      } else {
        watchdog(T, now);
      }
    }, 150);
  }, [listen, end]);

  const stop = useCallback(() => { end('idle'); setResult(null); setHeard(''); }, [end]);

  return { supported: speechSupported, status, error, result, heard, start, startFlow, skipVerse, stop };
}
