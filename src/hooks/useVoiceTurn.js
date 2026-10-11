import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * "Your turn" listener for the repeat-after-the-sheikh (talqeen) mode.
 *
 * The microphone is opened ONCE with prepare() (when the person presses Start), calibrated to the
 * room, and kept open for the session. Each turn then starts instantly with start() — no permission
 * prompt, no device start-up, no calibration delay after the sheikh finishes.
 *
 * Loudness is read with the Web Audio API; nothing is recorded or uploaded. The turn finishes when
 * the person has spoken and then paused for `silenceMs`. It does NOT check what was recited.
 *
 * The level meter is written straight to the DOM (orbRef) instead of React state, so the page
 * doesn't re-render 60 times a second while listening.
 *
 * status: 'idle' | 'preparing' | 'waiting' (listening, not speaking yet) | 'speaking' | 'error'
 */
export function useVoiceTurn({ onDone, silenceMs = 1000, minSpeechMs = 350, graceMs = 150, maxWaitMs = 30000 } = {}) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const ctx = useRef(null);
  const analyser = useRef(null);
  const buf = useRef(null);
  const stream = useRef(null);
  const noise = useRef(0.01);
  const raf = useRef(0);
  const loopId = useRef(0);
  const orbRef = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const opts = useRef({});
  opts.current = { silenceMs, minSpeechMs, graceMs, maxWaitMs };

  const rms = () => {
    analyser.current.getFloatTimeDomainData(buf.current);
    const b = buf.current;
    let sum = 0;
    for (let i = 0; i < b.length; i++) sum += b[i] * b[i];
    return Math.sqrt(sum / b.length);
  };
  const setLevel = (v) => orbRef.current?.style.setProperty('--lvl', v.toFixed(2));

  const stopLoop = () => {
    loopId.current++; // invalidates any running loop
    cancelAnimationFrame(raf.current);
    setLevel(0);
  };

  /** Close the microphone completely. */
  const release = useCallback(() => {
    stopLoop();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    ctx.current?.close().catch(() => {});
    ctx.current = null;
    analyser.current = null;
    setStatus('idle');
  }, []);

  useEffect(() => release, [release]);

  const isReady = () => Boolean(stream.current && ctx.current && ctx.current.state === 'running' && stream.current.active);

  /** Open + calibrate the microphone. Call from a click (Start) so the permission prompt appears then. */
  const prepare = useCallback(async () => {
    if (isReady()) return true;
    setError(null);
    setStatus('preparing');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
      if (!stream.current?.active) {
        stream.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      }
      if (!ctx.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx.current = new AC();
        const src = ctx.current.createMediaStreamSource(stream.current);
        analyser.current = ctx.current.createAnalyser();
        analyser.current.fftSize = 1024;
        buf.current = new Float32Array(analyser.current.fftSize);
        src.connect(analyser.current);
      }
      await ctx.current.resume();
      // Measure the room's background noise for ~250 ms (before the sheikh starts).
      const t0 = performance.now();
      let sum = 0, n = 0;
      await new Promise((resolve) => {
        const cal = () => {
          sum += rms(); n++;
          if (performance.now() - t0 < 250) requestAnimationFrame(cal); else resolve();
        };
        requestAnimationFrame(cal);
      });
      noise.current = n ? sum / n : 0.01;
      setStatus('idle');
      return true;
    } catch (e) {
      console.error('[mic]', e);
      release();
      setStatus('error');
      setError(e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'denied' : e.name === 'NotFoundError' ? 'nomic' : 'unsupported');
      return false;
    }
  }, [release]);

  const finish = useCallback((reason) => {
    stopLoop();
    setStatus('idle');
    doneRef.current?.(reason);
  }, []);

  const begin = useCallback(() => {
    stopLoop();
    const my = loopId.current;
    const t0 = performance.now();
    const T = { speechStart: 0, lastVoice: 0 };
    setStatus('waiting');
    const tick = () => {
      if (my !== loopId.current || !analyser.current) return;
      const { silenceMs: sil, minSpeechMs: minSp, graceMs: grace, maxWaitMs: maxW } = opts.current;
      const level = rms();
      const now = performance.now();
      const threshold = Math.max(0.012, noise.current * 3);
      setLevel(Math.min(1, level / (threshold * 4)));
      // Ignore the first moments (echo / tail of the sheikh's audio).
      if (now - t0 > grace) {
        if (level > threshold) {
          if (!T.speechStart) { T.speechStart = now; setStatus('speaking'); }
          T.lastVoice = now;
        } else if (!T.speechStart) {
          noise.current = noise.current * 0.97 + level * 0.03; // adapt slowly to the room
        }
      }
      if (T.speechStart && now - T.lastVoice > sil && T.lastVoice - T.speechStart > minSp) return finish('voice');
      if (!T.speechStart && now - t0 > maxW) return finish('timeout');
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [finish]);

  /** Start one turn — instant when prepare() already ran. */
  const start = useCallback(async () => {
    if (isReady()) { begin(); return; }
    if (await prepare()) begin();
  }, [begin, prepare]);

  /** End the turn now (the "Done" button). */
  const done = useCallback(() => finish('manual'), [finish]);
  /** Stop this turn but keep the microphone open (e.g. "hear it again"). */
  const cancel = useCallback(() => { stopLoop(); setStatus((s) => (s === 'error' ? s : 'idle')); }, []);

  return { status, error, prepare, start, done, cancel, release, orbRef, listening: status === 'waiting' || status === 'speaking' };
}
