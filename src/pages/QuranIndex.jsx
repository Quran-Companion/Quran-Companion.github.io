import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import { useProgress } from '../context/ProgressContext';
import { getSurahList, normalizeArabic, searchQuran } from '../lib/quranApi';
import { useAsync } from '../hooks/useAsync';
import { ErrorState, Loader, EmptyState, Spinner } from '../components/States';
import { ProgressBar } from '../components/ProgressRing';
import { toArabicDigits } from '../components/Verse';
import Icon from '../components/Icon';

export default function QuranIndex() {
  const { t, lang, numberFmt } = useSettings();
  const { stats } = useProgress();
  const { data: surahs, loading, error, retry } = useAsync(getSurahList, []);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [verseHits, setVerseHits] = useState({ loading: false, items: [], error: null });

  // Local surah filtering by number, Arabic name (diacritics-insensitive) or English name.
  const list = useMemo(() => {
    if (!surahs) return [];
    const nq = normalizeArabic(q.trim());
    return surahs.filter((s) => {
      if (filter === 'meccan' && s.type !== 'Meccan') return false;
      if (filter === 'medinan' && s.type !== 'Medinan') return false;
      if (filter === 'started' && !stats.perSurah[s.number]) return false;
      if (!nq) return true;
      return (
        String(s.number) === nq ||
        normalizeArabic(s.name).includes(nq) ||
        s.englishName.toLowerCase().replace(/[-']/g, '').includes(nq.replace(/[-' ]/g, '')) ||
        s.translation.toLowerCase().includes(nq)
      );
    });
  }, [surahs, q, filter, stats.perSurah]);

  // Remote verse search, debounced. "2:255" style references jump straight to the verse.
  const ref = q.trim().match(/^(\d{1,3})\s*[:：]\s*(\d{1,3})$/);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3 || /^\d+$/.test(term) || ref) {
      setVerseHits({ loading: false, items: [], error: null });
      return;
    }
    const ctrl = new AbortController();
    setVerseHits((s) => ({ ...s, loading: true, error: null }));
    const id = setTimeout(() => {
      searchQuran(term, { signal: ctrl.signal })
        .then((items) => setVerseHits({ loading: false, items, error: null }))
        .catch((e) => e.name !== 'AbortError' && setVerseHits({ loading: false, items: [], error: e }));
    }, 450);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="container page">
      <header className="page-head">
        <h1>{t.quran.title}</h1>
        <p className="muted">{t.quran.subtitle}</p>
      </header>

      <div className="search-bar">
        <Icon name="search" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.common.search}
          aria-label={t.common.search}
        />
        {q && <button className="icon-btn" onClick={() => setQ('')} aria-label={t.common.close}><Icon name="close" size={18} /></button>}
      </div>

      <div className="segmented" role="tablist">
        {[
          ['all', t.common.all],
          ['meccan', t.common.meccan],
          ['medinan', t.common.medinan],
          ['started', t.common.memorized],
        ].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'is-active' : ''} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>

      {ref && (
        <Link className="card jump-card" to={`/quran/${ref[1]}#a${ref[2]}`}>
          <Icon name="arrow" className="flip-rtl-next" /> {t.common.surah} {ref[1]} · {t.common.verse} {ref[2]}
        </Link>
      )}

      {loading && <Loader />}
      {error && <ErrorState error={error} onRetry={retry} />}

      {surahs && (
        <>
          {list.length === 0 && !verseHits.items.length && !verseHits.loading && (
            <EmptyState icon="search">{t.quran.noResults}</EmptyState>
          )}
          <ul className="surah-grid">
            {list.map((s) => {
              const done = stats.perSurah[s.number] || 0;
              return (
                <li key={s.number}>
                  <Link to={`/quran/${s.number}`} className="surah-card">
                    <span className="surah-num">{lang === 'ar' ? toArabicDigits(s.number) : s.number}</span>
                    <span className="surah-info">
                      <strong className="surah-en">{lang === 'ar' ? s.englishName : s.englishName}</strong>
                      <span className="muted small">
                        {s.type === 'Meccan' ? t.common.meccan : t.common.medinan} · {numberFmt(s.ayahs)} {t.common.verses}
                      </span>
                      {done > 0 && <ProgressBar value={done / s.ayahs} small />}
                    </span>
                    <span className="surah-ar" lang="ar">{s.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {(verseHits.loading || verseHits.items.length > 0 || verseHits.error) && (
        <section className="verse-results">
          <h2 className="section-title">
            {t.quran.verseResults} {verseHits.loading && <Spinner size={16} />}
          </h2>
          {verseHits.error && <ErrorState error={verseHits.error} />}
          <ul className="result-list">
            {verseHits.items.map((h) => (
              <li key={h.key}>
                <Link to={`/quran/${h.surah}#a${h.ayah}`} className="result">
                  <p className="quran quran-sm" lang="ar" dir="rtl">{h.text}</p>
                  <span className="muted small">{h.surahName} · {toArabicDigits(h.ayah)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
