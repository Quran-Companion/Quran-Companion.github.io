import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Plays a whole surah as one file, looping forever (until paused). Because it is a single file with
 * `loop` on, the phone keeps it going with the screen locked — no code has to run between verses.
 * `urls` are tried in order; if none can be played, onFail(wasPlaying) is called so the caller can
 * fall back to verse-by-verse playback.
 */
export function useSurahLoop({ urls, speed = 1, title = '', onFail }) {
  const ref = useRef(null);
  if (!ref.current && typeof Audio !== 'undefined') {
    ref.current = new Audio();
    ref.current.preload = 'none';
    ref.current.loop = true;
  }
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const want = useRef(false);
  const at = useRef(0);
  const live = useRef({});
  live.current = { urls, onFail };
  const key = urls.join('|');

  useEffect(() => {
    const a = ref.current;
    if (!a) return undefined;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWait = () => setLoading(true);
    const onCan = () => setLoading(false);
    const onError = () => {
      const { urls: u, onFail: fail } = live.current;
      if (!a.getAttribute('src')) return;
      at.current += 1;
      if (at.current < u.length) { a.src = u[at.current]; if (want.current) a.play().catch(() => {}); return; }
      const was = want.current;
      want.current = false;
      setLoading(false);
      a.removeAttribute('src');
      fail?.(was);
    };
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('waiting', onWait);
    a.addEventListener('canplay', onCan);
    a.addEventListener('playing', onCan);
    a.addEventListener('error', onError);
    return () => {
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('waiting', onWait);
      a.removeEventListener('canplay', onCan);
      a.removeEventListener('playing', onCan);
      a.removeEventListener('error', onError);
    };
  }, []);

  // Another surah / reciter (or loop mode turned off): stop and forget the old file.
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.pause();
    a.removeAttribute('src');
    at.current = 0;
    want.current = false;
    setPlaying(false);
    setLoading(false);
  }, [key]);

  useEffect(() => () => ref.current?.pause(), []);
  useEffect(() => { if (ref.current) { ref.current.defaultPlaybackRate = speed; ref.current.playbackRate = speed; } }, [speed, key]);

  const play = useCallback(() => {
    const a = ref.current;
    const u = live.current.urls;
    if (!a || !u.length) return;
    want.current = true;
    a.loop = true;
    if (!a.getAttribute('src')) { a.src = u[at.current] || u[0]; setLoading(true); }
    a.play().catch(() => {});
  }, []);
  const pause = useCallback(() => { want.current = false; ref.current?.pause(); }, []);
  const toggle = useCallback(() => (want.current && !ref.current?.paused ? pause() : play()), [play, pause]);
  const replay = useCallback(() => { const a = ref.current; if (a?.getAttribute('src')) { a.currentTime = 0; } play(); }, [play]);

  // Lock-screen controls while this is what plays.
  useEffect(() => {
    if (!playing || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({ title, artist: 'Quran Companion' });
      navigator.mediaSession.setActionHandler('play', play);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.playbackState = 'playing';
    } catch { /* not supported */ }
  }, [playing, title, play, pause]);

  return { playing, loading, toggle, play, pause, replay, active: urls.length > 0 };
}
