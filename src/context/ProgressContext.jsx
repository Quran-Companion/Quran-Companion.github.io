import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  emptyProgress,
  firestoreAdapter,
  localAdapter,
  mergeGuestIntoCloud,
  todayKey,
} from '../lib/progressStore';
import { getSurahList, TOTAL_AYAHS } from '../lib/quranApi';

const ProgressContext = createContext(null);
const guestStore = localAdapter();

export function ProgressProvider({ children }) {
  const { user, ready } = useAuth();
  const [store, setStore] = useState(null);
  const [data, setData] = useState(emptyProgress());
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState(null);
  const [metaAttempt, setMetaAttempt] = useState(0);

  // Surah list (names, verse counts). A failure is surfaced to pages so they can show a retry,
  // instead of spinning forever.
  useEffect(() => {
    let alive = true;
    setMetaError(null);
    getSurahList()
      .then((m) => alive && setMeta(m))
      .catch((e) => {
        console.error('[quran] surah list failed', e);
        if (alive) setMetaError(e);
      });
    return () => { alive = false; };
  }, [metaAttempt]);
  const retryMeta = useCallback(() => setMetaAttempt((n) => n + 1), []);

  // Pick the storage adapter for the current session.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let unsub = () => {};
    setLoading(true);
    (async () => {
      let s = guestStore;
      if (user) {
        try {
          const merged = await mergeGuestIntoCloud(user.uid, guestStore.snapshot());
          if (merged) guestStore.clear();
          setSyncError(null);
        } catch (e) {
          console.error('[progress] merge failed', e);
          setSyncError(e);
        }
        s = firestoreAdapter(user.uid);
      }
      if (cancelled) return;
      setStore(s);
      unsub = s.subscribe((d) => {
        setData(d);
        setLoading(false);
      });
    })();
    return () => { cancelled = true; unsub(); };
  }, [user, ready]);

  const run = useCallback(
    async (op) => {
      if (!store) return;
      try {
        await store.apply({ ...op, at: Date.now() });
        setSyncError(null);
      } catch (e) {
        console.error('[progress] save failed', e);
        setSyncError(e);
      }
    },
    [store],
  );

  const actions = useMemo(
    () => ({
      setMemorized: (keys, value = true) => run({ type: 'memorize', keys: [].concat(keys), value }),
      toggleMemorized: (key) => run({ type: 'memorize', keys: [key], value: !data.memorized[key] }),
      saveLastPosition: (last) => run({ type: 'last', last: { ...last, at: Date.now() } }),
      markReviewed: (keys) => run({ type: 'reviewed', keys }),
      addReviewSession: (review) =>
        run({ type: 'review', review: { id: `r${Date.now()}`, at: Date.now(), ...review } }),
    }),
    [run, data.memorized],
  );

  const stats = useMemo(() => computeStats(data, meta), [data, meta]);

  const value = useMemo(
    () => ({ ...data, ...actions, stats, meta, metaError, retryMeta, loading, syncError, mode: store?.kind || 'local' }),
    [data, actions, stats, meta, metaError, retryMeta, loading, syncError, store],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export const useProgress = () => useContext(ProgressContext);

// ---------------- derived stats ----------------
function computeStats(data, meta) {
  const keys = Object.keys(data.memorized);
  const perSurah = {};
  for (const k of keys) {
    const s = +k.split(':')[0];
    perSurah[s] = (perSurah[s] || 0) + 1;
  }
  const completedSurahs = meta
    ? meta.filter((s) => perSurah[s.number] >= s.ayahs).length
    : 0;

  const recent = keys
    .map((k) => ({ key: k, at: data.memorized[k] }))
    .sort((a, b) => b.at - a.at)
    .slice(0, 12);

  // Daily series for the last 14 days + current streak.
  const days = [];
  const d = new Date();
  for (let i = 13; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    const k = todayKey(x);
    days.push({ day: k, count: data.daily[k] || 0 });
  }
  let streak = 0;
  const cursor = new Date();
  // A streak still counts if today is empty but yesterday wasn't.
  if (!data.daily[todayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (data.daily[todayKey(cursor)]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Today's review: memorized verses reviewed least recently (never-reviewed first), up to 20.
  const dueToday = keys
    .map((k) => ({ key: k, last: data.reviewedAt[k] || 0 }))
    .filter((x) => Date.now() - x.last > 20 * 3600 * 1000)
    .sort((a, b) => a.last - b.last)
    .slice(0, 20)
    .map((x) => x.key);

  return {
    memorizedCount: keys.length,
    completedSurahs,
    startedSurahs: Object.keys(perSurah).length,
    perSurah,
    overall: keys.length / TOTAL_AYAHS,
    recent,
    days,
    streak,
    today: data.daily[todayKey()] || 0,
    dueToday,
    reviewCount: data.reviews.length,
  };
}
