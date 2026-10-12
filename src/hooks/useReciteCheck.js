import { useCallback, useEffect, useRef, useState } from 'react';
import { matchRecitation } from '../lib/recite';

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
export function useReciteCheck({ threshold = 0.7, pauseMs = 1000, onSuccess, onMistake, mistakeAfter = 0 } = {}) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { matched, coverage, lastMatched }
  const [heard, setHeard] = useState('');
  const rec = useRef(null);
  const turn = useRef(null); // { text, ctx, finals, active, lastAt, started }
  const timer = useRef(0);
  const cfg = useRef({});
  cfg.current = { threshold, pauseMs, onSuccess, onMistake, mistakeAfter };

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
      let interim = [''];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) T2.finals.push(res[0].transcript);
        else interim = Array.from(res).map((alt) => alt.transcript);
      }
      const base = T2.finals.join(' ');
      const best = evaluate(interim.map((x) => `${base} ${x}`));
      T2.lastAt = performance.now();
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
    r.onend = () => { if (turn.current?.active && rec.current === r) { rec.current = null; setTimeout(listen, 60); } };
    try { r.start(); } catch (e) { console.warn('[speech] start', e); }
  }, [end]);

  /** Start a turn for this verse. */
  const start = useCallback((text, ctx) => {
    clear();
    stopRec();
    setError(null);
    setHeard('');
    setResult(null);
    if (!SR) { setError('unsupported'); setStatus('error'); return; }
    turn.current = { text, ctx, finals: [], active: true, lastAt: 0, started: performance.now(), best: null };
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

  return { supported: speechSupported, status, error, result, heard, start, stop };
}
