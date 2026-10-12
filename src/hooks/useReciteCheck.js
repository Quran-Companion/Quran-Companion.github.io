import { useCallback, useEffect, useRef, useState } from 'react';
import { matchRecitation, saidSkeleton } from '../lib/recite';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
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
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 3;
    rec.current = r;
    r.onaudiostart = () => turn.current?.active && setStatus('listening');
    r.onresult = (e) => {
      const T2 = turn.current;
      if (!T2?.active) return;
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
      if (T2.flow) { flowStep(T2, `${base} ${interim[0]}`); return; }
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
      if (e.error === 'no-speech' || e.error === 'aborted') return; // onend restarts
      console.warn('[speech]', e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setError('denied'); end('error'); }
      else if (e.error === 'network') { setError('network'); end('error'); }
      else if (e.error === 'language-not-supported') { setError('unsupported'); end('error'); }
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
        setTimeout(listen, 60);
      }
    };
    try { r.start(); } catch (e) { console.warn('[speech] start', e); }
  }, [end]);

  // ---- Continuous recitation ("flow"): one listening session follows you through the verses. ----
  // Finished verses are reported with onVerse(index, result) — words not heard stay unmatched (shown red)
  // — and listening carries on. A verse counts as finished when all of it was heard, when you start the
  // next verse (or the one after, if you skipped one), or when you pause after reaching its end.
  const finishVerse = (T, r) => {
    const i = T.i;
    T.i += 1;
    T.cur = null;
    setResult(null);
    cfg.current.onVerse?.(T.base + i, r);
    if (T.i >= T.list.length) { end('success'); cfg.current.onFlowEnd?.(); return false; }
    return true;
  };

  // Did the person start this verse? (2 of its first 3 words heard, beginning with the 1st or 2nd)
  const headHeard = (r) => {
    const idx = [];
    for (let i = r.skipped; i < r.matched.length && idx.length < 3; i++) if (r.real[i]) idx.push(i);
    const heard = idx.filter((i) => r.matched[i]).length;
    return heard >= Math.min(2, idx.length) && Boolean(r.matched[idx[0]] || r.matched[idx[1]]);
  };

  const flowStep = (T, text) => {
    const s = saidSkeleton(text);
    for (;;) {
      const v = T.list[T.i];
      if (!v) return;
      const cur = matchRecitation(v.text, '', v.ctx, { from: T.offset, s });
      if (cur.complete) { if (!finishVerse(T, cur)) return; T.offset = cur.end; continue; }
      let moved = false;
      for (let k = 1; k <= 2 && T.i + k < T.list.length && !moved; k++) {
        const nv = T.list[T.i + k];
        for (const from of cur.end >= 0 ? [cur.end, T.offset] : [T.offset]) {
          const nx = matchRecitation(nv.text, '', nv.ctx, { from, s });
          if (nx.start < 0 || !headHeard(nx)) continue;
          if (from === T.offset && cur.start >= 0 && nx.start >= cur.start) continue;
          // You moved on: this verse is done (judged only on what came before the next one).
          const done = matchRecitation(v.text, '', v.ctx, { from: T.offset, s: s.slice(0, nx.start) });
          if (!finishVerse(T, done)) return;
          for (let j = 1; j < k; j++) { // a whole verse skipped
            const sv = T.list[T.i];
            if (!finishVerse(T, matchRecitation(sv.text, '', sv.ctx))) return;
          }
          T.offset = nx.start;
          moved = true;
          break;
        }
      }
      if (moved) continue;
      T.cur = cur;
      setResult(cur);
      setHeard(text.trim());
      return;
    }
  };

  /** Continuous recitation through `list` ([{ text, ctx }]); indexes reported from `base`. */
  const startFlow = useCallback((list, base = 0) => {
    clear();
    stopRec();
    setError(null);
    setHeard('');
    setResult(null);
    if (!SR) { setError('unsupported'); setStatus('error'); return; }
    turn.current = { flow: true, list, base, i: 0, offset: 0, cur: null, finals: [], session: '', pending: '', active: true, lastAt: 0, started: performance.now() };
    setStatus('starting');
    listen();
    timer.current = setInterval(() => {
      const T = turn.current;
      if (!T?.active) return clear();
      const now = performance.now();
      const { threshold: thr, pauseMs: pause } = cfg.current;
      // Paused after reaching the end of the verse → it's done. (A pause in the middle is someone
      // thinking — wait for them; starting the next verse also finishes it.) On the very last verse,
      // a long pause with most of it said also finishes, in case its last word was mis-heard.
      const lastOne = T.i === T.list.length - 1;
      if (T.cur && T.lastAt && ((now - T.lastAt > pause && T.cur.lastMatched) || (lastOne && now - T.lastAt > 4000 && T.cur.coverage >= Math.max(thr, 0.85)))) {
        const r = T.cur;
        if (finishVerse(T, r)) T.offset = r.end;
        return;
      }
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
      }
    }, 150);
  }, [listen, end]);

  const stop = useCallback(() => { end('idle'); setResult(null); setHeard(''); }, [end]);

  return { supported: speechSupported, status, error, result, heard, start, startFlow, stop };
}
