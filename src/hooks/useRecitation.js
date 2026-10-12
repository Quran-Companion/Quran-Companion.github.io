import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { withAudio } from '../lib/reciters';

// ~0.3 s of silence. Phones (and Bluetooth headsets, or right after the mic closes)
// need a moment to wake the audio output; without this lead-in the first syllable
// of a recording — e.g. the "ب" of the Basmala — gets swallowed.
const SILENCE = (() => {
  const rate = 8000, n = 2400, b = new Uint8Array(44 + n);
  const dv = new DataView(b.buffer);
  const str = (o, t) => [...t].forEach((c, i) => { b[o + i] = c.charCodeAt(0); });
  str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate, true);
  dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); str(36, 'data'); dv.setUint32(40, n, true); b.fill(128, 44);
  let bin = ''; b.forEach((x) => { bin += String.fromCharCode(x); });
  return `data:audio/wav;base64,${btoa(bin)}`;
})();

/**
 * Verse-by-verse recitation player.
 *
 * - repeatVerse: how many times each verse plays (Infinity = loop)
 * - repeatRange: how many times the whole list plays
 * - autoAdvance: continue to the next verse after the repeats finish
 *
 * Index is controlled by the caller so the visible verse and the audio stay in sync.
 */
export function useRecitation({
  verses: textVerses,
  reciter,
  index,
  onIndexChange,
  repeatVerse = 1,
  repeatRange = 1,
  autoAdvance = true,
  speed = 1,
  onFinish,
  title,
}) {
  // Attach this reciter's verse-by-verse audio URLs (verse text is untouched).
  const verses = useMemo(() => withAudio(textVerses || [], reciter), [textVerses, reciter]);
  const audioRef = useRef(null);
  const wantPlay = useRef(false);
  const counts = useRef({ verse: 0, range: 0 });
  const altIndex = useRef(0); // which backup URL we are on for the current verse
  const stage = useRef('main'); // 'lead' (silence) → 'intro' (Basmala before verse 1) → 'main'
  const pending = useRef('main'); // the stage that follows the silent lead-in
  const lastEnded = useRef(-Infinity); // when a clip last finished — tells continuous playback from a cold start
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [repeatState, setRepeatState] = useState({ verse: 0, range: 0 });

  // Latest values for event handlers.
  const live = useRef({});
  live.current = { verses, index, onIndexChange, repeatVerse, repeatRange, autoAdvance, onFinish };

  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';
  }

  const syncCounts = () => setRepeatState({ ...counts.current });

  const load = useCallback((i, autoplay) => {
    const a = audioRef.current;
    const v = live.current.verses?.[i];
    if (!a || !v?.audio) return;
    altIndex.current = 0;
    setError(null);
    let first = v.intro || v.audio;
    stage.current = v.intro ? 'intro' : 'main';
    // Starting from silence (not straight after the previous clip): lead in with a short silence.
    const cold = a.paused && performance.now() - lastEnded.current > 1000;
    if (autoplay && cold) {
      pending.current = stage.current;
      stage.current = 'lead';
      const warm = new Audio(); warm.preload = 'auto'; warm.src = first; // buffer the real file meanwhile
      first = SILENCE;
    }
    if (a.src !== first) {
      a.src = first;
      setLoading(true);
    } else {
      a.currentTime = 0;
    }
    if (autoplay) {
      a.play().catch((e) => {
        if (e.name !== 'AbortError') { setError('audio'); wantPlay.current = false; setPlaying(false); }
      });
    }
    // Warm the cache: the verse itself (it follows the Basmala) and the next verse.
    if (v.intro) { const w = new Audio(); w.preload = 'auto'; w.src = v.audio; }
    const next = live.current.verses?.[i + 1];
    if (next?.audio) { const p = new Audio(); p.preload = 'auto'; p.src = next.audio; }
  }, []);

  // Wire audio element events once.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onCanPlay = () => setLoading(false);
    const onWaiting = () => setLoading(true);
    const onError = () => {
      const v = live.current.verses?.[live.current.index];
      if (stage.current === 'lead') { startPending(v); return; }
      // Basmala failed: try its backups, else go straight to the verse.
      if (stage.current === 'intro') {
        const alt = v?.introAlts?.[altIndex.current];
        if (alt) { altIndex.current += 1; a.src = alt; if (wantPlay.current) a.play().catch(() => {}); return; }
        stage.current = 'main';
        altIndex.current = 0;
        a.src = v.audio;
        if (wantPlay.current) a.play().catch(() => {});
        return;
      }
      // Try the next backup source for this verse before reporting an error.
      const next = v?.audioAlts?.[altIndex.current];
      if (next) {
        altIndex.current += 1;
        console.warn('[audio] source failed, trying backup', next);
        a.src = next;
        if (wantPlay.current) a.play().catch(() => {});
        return;
      }
      setLoading(false);
      setError('audio');
      wantPlay.current = false;
    };
    const startPending = (v) => {
      stage.current = pending.current;
      const src = stage.current === 'intro' ? v?.intro : v?.audio;
      if (!src) return;
      a.src = src;
      if (wantPlay.current) a.play().catch(() => {});
    };
    const onEnded = () => {
      const L = live.current;
      lastEnded.current = performance.now();
      // Silent lead-in done → the real recording.
      if (stage.current === 'lead') { startPending(L.verses?.[L.index]); return; }
      // Basmala done → the verse itself (not counted as a repeat).
      if (stage.current === 'intro') {
        const v = L.verses?.[L.index];
        stage.current = 'main';
        altIndex.current = 0;
        if (v?.audio) { a.src = v.audio; a.play().catch(() => {}); return; }
      }
      const c = counts.current;
      c.verse += 1;
      if (c.verse < L.repeatVerse) {
        syncCounts();
        a.currentTime = 0;
        a.play().catch(() => {});
        return;
      }
      c.verse = 0;
      const last = L.verses.length - 1;
      if (L.autoAdvance && L.index < last) {
        syncCounts();
        L.onIndexChange(L.index + 1); // effect below loads & plays
        return;
      }
      if (L.autoAdvance && L.index >= last) {
        c.range += 1;
        if (c.range < L.repeatRange) {
          syncCounts();
          if (L.index === 0) load(0, true);
          else L.onIndexChange(0);
          return;
        }
      }
      c.range = 0;
      syncCounts();
      wantPlay.current = false;
      setPlaying(false);
      L.onFinish?.({ completedRange: L.autoAdvance && L.index >= last });
    };
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('canplay', onCanPlay);
    a.addEventListener('waiting', onWaiting);
    a.addEventListener('error', onError);
    a.addEventListener('ended', onEnded);
    return () => {
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('canplay', onCanPlay);
      a.removeEventListener('waiting', onWaiting);
      a.removeEventListener('error', onError);
      a.removeEventListener('ended', onEnded);
    };
  }, [load]);

  // Stop audio when the component unmounts.
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  // When the verse (or the verse list, e.g. a reciter change) changes, load it; keep playing if we were.
  const currentUrl = verses?.[index]?.audio;
  useEffect(() => {
    if (!currentUrl) return;
    load(index, wantPlay.current);
  }, [index, currentUrl, load]);

  useEffect(() => {
    if (audioRef.current) { audioRef.current.defaultPlaybackRate = speed; audioRef.current.playbackRate = speed; }
  }, [speed, currentUrl]);

  // Lock-screen / headset controls.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !verses?.[index]) return;
    const v = verses[index];
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: `${v.surahName || title || ''} — ${v.ayah}`,
      artist: 'Quran Companion',
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => index > 0 && onIndexChange(index - 1));
    navigator.mediaSession.setActionHandler('nexttrack', () => index < verses.length - 1 && onIndexChange(index + 1));
  }, [index, verses, title, onIndexChange]);

  const play = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    wantPlay.current = true;
    setError(null);
    // Not started yet (or at the very start) → load, which adds the lead-in.
    if (!a.src || stage.current === 'lead' || a.currentTime === 0) load(live.current.index, true);
    else a.play().catch((e) => e.name !== 'AbortError' && setError('audio'));
  }, [load]);

  const pause = useCallback(() => {
    wantPlay.current = false;
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => (playing ? pause() : play()), [playing, play, pause]);

  const replay = useCallback(() => {
    counts.current.verse = 0;
    syncCounts();
    wantPlay.current = true;
    load(live.current.index, true);
  }, [load]);

  /** Jump to a verse and start playing it. */
  const playAt = useCallback((i) => {
    counts.current.verse = 0;
    syncCounts();
    wantPlay.current = true;
    if (i === live.current.index) load(i, true);
    else live.current.onIndexChange(i); // the index effect loads and plays
  }, [load]);

  const resetCounts = useCallback(() => {
    counts.current = { verse: 0, range: 0 };
    syncCounts();
  }, []);

  return { playing, loading, error, toggle, play, pause, replay, playAt, resetCounts, repeatState };
}
