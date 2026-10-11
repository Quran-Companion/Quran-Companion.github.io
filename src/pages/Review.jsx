import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import { useProgress } from '../context/ProgressContext';
import { JUZ_LIST, getJuz, getSurah, getVersesByKeys } from '../lib/quranApi';
import { useRecitation } from '../hooks/useRecitation';
import SurahRangePicker from '../components/SurahRangePicker';
import { EmptyState, ErrorState, Loader } from '../components/States';
import { QuranText, toArabicDigits } from '../components/Verse';
import { AudioSettings } from '../components/AudioControls';
import ProgressRing, { ProgressBar } from '../components/ProgressRing';
import Icon from '../components/Icon';
import { verseRef } from './Home';

const COUNTS = [10, 20, 50, 0]; // 0 = all

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Review() {
  const [params, setParams] = useSearchParams();
  const { t, lang, reciter, numberFmt } = useSettings();
  const progress = useProgress();
  const { meta, memorized, stats, metaError, retryMeta } = progress;

  const [phase, setPhase] = useState('setup'); // setup | loading | session | summary
  const [error, setError] = useState(null);
  const [cfg, setCfg] = useState({
    mode: 'all', surah: 1, from: 1, to: 7, juz: 30, count: 20, shuffle: true, includeAll: false,
  });
  const [queue, setQueue] = useState([]);
  const [results, setResults] = useState({});
  const [empty, setEmpty] = useState(false);
  const startedAt = useRef(0);
  const scopeLabel = useRef('');

  const memorizedKeys = useMemo(() => Object.keys(memorized), [memorized]);

  const build = useCallback(async (c) => {
    setError(null);
    setEmpty(false);
    setPhase('loading');
    try {
      const keep = (v) => c.includeAll || memorized[v.key];
      let list;
      let label;
      if (c.mode === 'due' || c.mode === 'all') {
        let keys = c.mode === 'due' ? stats.dueToday : memorizedKeys;
        keys = c.shuffle ? shuffleArr(keys) : [...keys].sort(byKey);
        if (c.count) keys = keys.slice(0, c.count);
        list = await getVersesByKeys(keys);
        const order = new Map(keys.map((k, i) => [k, i]));
        list.sort((a, b) => order.get(a.key) - order.get(b.key));
        label = c.mode === 'due' ? t.home.today : t.review.mode.all;
      } else if (c.mode === 'surah') {
        list = (await getSurah(c.surah)).verses.filter(keep);
        label = `${t.common.surah} ${meta?.[c.surah - 1]?.[lang === 'ar' ? 'name' : 'englishName'] || c.surah}`;
      } else if (c.mode === 'juz') {
        list = (await getJuz(c.juz)).filter(keep);
        label = `${t.common.juz} ${c.juz}`;
      } else {
        list = (await getSurah(c.surah)).verses.slice(c.from - 1, c.to).filter(keep);
        label = `${meta?.[c.surah - 1]?.[lang === 'ar' ? 'name' : 'englishName'] || c.surah} ${c.from}–${c.to}`;
      }
      if (c.mode !== 'due' && c.mode !== 'all') {
        if (c.shuffle) list = shuffleArr(list);
        if (c.count) list = list.slice(0, c.count);
      }
      if (!list.length) {
        setEmpty(true);
        setPhase('setup');
        return;
      }
      scopeLabel.current = label;
      startedAt.current = Date.now();
      setResults({});
      setQueue(list);
      setPhase('session');
    } catch (e) {
      setError(e);
      setPhase('setup');
    }
  }, [memorized, memorizedKeys, stats.dueToday, meta, lang, t]);

  // Deep link from Home: /review/session?mode=due
  const autostarted = useRef(false);
  useEffect(() => {
    if (autostarted.current || progress.loading) return;
    if (params.get('mode') === 'due') {
      autostarted.current = true;
      const c = { ...cfg, mode: 'due', count: 20, shuffle: true };
      setCfg(c);
      build(c);
    }
  }, [params, progress.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback((res) => {
    const graded = Object.entries(res);
    if (graded.length) {
      const counts = { good: 0, hard: 0, again: 0 };
      graded.forEach(([, g]) => counts[g]++);
      progress.markReviewed(graded.map(([k]) => k));
      progress.addReviewSession({
        scope: scopeLabel.current,
        total: graded.length,
        ...counts,
        durationSec: Math.round((Date.now() - startedAt.current) / 1000),
        weak: graded.filter(([, g]) => g !== 'good').map(([k]) => k).slice(0, 50),
      });
    }
    setPhase('summary');
  }, [progress]);

  if (!meta && metaError) return <div className="container page"><ErrorState error={metaError} onRetry={retryMeta} /></div>;
  if (!meta || progress.loading) return <div className="container page"><Loader /></div>;

  if (phase === 'loading') return <div className="container page"><Loader /></div>;

  if (phase === 'session') {
    return (
      <ReviewSession
        queue={queue}
        results={results}
        setResults={setResults}
        onFinish={finish}
        meta={meta}
      />
    );
  }

  if (phase === 'summary') {
    const graded = Object.entries(results);
    const good = graded.filter(([, g]) => g === 'good').length;
    const weak = graded.filter(([, g]) => g !== 'good');
    const secs = Math.round((Date.now() - startedAt.current) / 1000);
    return (
      <div className="container page narrow">
        <div className="card summary-card">
          <h1>{t.review.summary}</h1>
          <p className="muted">{scopeLabel.current}</p>
          <div className="summary-stats">
            <ProgressRing value={graded.length ? good / graded.length : 0} size={120} label={t.review.accuracy}>
              <strong className="ring-number">{numberFmt(graded.length ? Math.round((good / graded.length) * 100) : 0)}%</strong>
              <span className="small muted">{t.review.accuracy}</span>
            </ProgressRing>
            <ul className="mini-stats">
              <li><strong>{numberFmt(graded.length)}</strong><span>{t.review.reviewed}</span></li>
              <li><strong>{numberFmt(Math.max(1, Math.round(secs / 60)))}</strong><span>{t.common.minutes}</span></li>
              <li><strong className="c-good">{numberFmt(good)}</strong><span>{t.review.good}</span></li>
              <li><strong className="c-hard">{numberFmt(weak.length)}</strong><span>{t.review.toImprove}</span></li>
            </ul>
          </div>
          {weak.length > 0 && (
            <>
              <h2 className="section-title">{t.review.toImprove}</h2>
              <div className="chips">
                {weak.map(([k, g]) => {
                  const [s, a] = k.split(':');
                  return (
                    <Link key={k} to={`/memorize/session?surah=${s}&from=${a}&to=${a}`} className={`chip chip-${g}`}>
                      {verseRef(meta, k, lang)}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
          <div className="done-actions">
            <button className="btn btn-primary" onClick={() => { setParams({}); setPhase('setup'); }}>
              <Icon name="repeat" /> {t.review.newSession}
            </button>
            <Link to="/dashboard" className="btn btn-ghost">{t.nav.dashboard}</Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------- setup ----------
  const modes = ['all', 'surah', 'juz', 'range'];
  return (
    <div className="container page narrow">
      <header className="page-head">
        <h1>{t.review.title}</h1>
        <p className="muted">{t.review.subtitle}</p>
      </header>

      {stats.dueToday.length > 0 && (
        <button className="card continue-card" onClick={() => build({ ...cfg, mode: 'due', count: 20, shuffle: true })}>
          <span className="continue-icon"><Icon name="clock" size={18} /></span>
          <span>
            <strong>{t.home.today}</strong>
            <span className="muted small d-block">{numberFmt(stats.dueToday.length)} {t.common.verses}</span>
          </span>
          <Icon name="arrow" className="flip-rtl-next" />
        </button>
      )}

      <section className="card">
        <h2 className="card-title">{t.review.what}</h2>
        <div className="segmented" role="tablist">
          {modes.map((m) => (
            <button key={m} role="tab" aria-selected={cfg.mode === m} className={cfg.mode === m ? 'is-active' : ''} onClick={() => setCfg({ ...cfg, mode: m })}>
              {t.review.mode[m]}
            </button>
          ))}
        </div>

        {cfg.mode === 'all' && (
          <p className="muted">{numberFmt(memorizedKeys.length)} {t.common.verses} {t.common.memorized}</p>
        )}
        {(cfg.mode === 'surah' || cfg.mode === 'range') && (
          <SurahRangePicker
            meta={meta}
            value={{ surah: cfg.surah, from: cfg.from, to: cfg.to }}
            onChange={(v) => setCfg({ ...cfg, ...v })}
            showRange={cfg.mode === 'range'}
          />
        )}
        {cfg.mode === 'juz' && (
          <label className="field">
            <span>{t.common.juz}</span>
            <select value={cfg.juz} onChange={(e) => setCfg({ ...cfg, juz: Number(e.target.value) })}>
              {JUZ_LIST.map((j) => <option key={j} value={j}>{t.common.juz} {lang === 'ar' ? toArabicDigits(j) : j}</option>)}
            </select>
          </label>
        )}

        <div className="option-group">
          <span className="option-label">{t.review.count}</span>
          <div className="pills">
            {COUNTS.map((c) => (
              <button key={c} className={cfg.count === c ? 'is-active' : ''} onClick={() => setCfg({ ...cfg, count: c })}>
                {c ? numberFmt(c) : t.common.all}
              </button>
            ))}
          </div>
        </div>

        <label className="switch">
          <input type="checkbox" checked={cfg.shuffle} onChange={(e) => setCfg({ ...cfg, shuffle: e.target.checked })} />
          <span className="switch-track" /> <Icon name="shuffle" size={16} /> {t.review.shuffle}
        </label>
        {cfg.mode !== 'all' && (
          <label className="switch">
            <input type="checkbox" checked={cfg.includeAll} onChange={(e) => setCfg({ ...cfg, includeAll: e.target.checked })} />
            <span className="switch-track" /> {t.review.includeUnmemorized}
          </label>
        )}

        {empty && <EmptyState icon="target">{t.review.nothing}</EmptyState>}
        {error && <ErrorState error={error} onRetry={() => build(cfg)} />}

        <button
          className="btn btn-primary btn-lg btn-block"
          onClick={() => build(cfg)}
          disabled={cfg.mode === 'all' && memorizedKeys.length === 0}
        >
          <Icon name="repeat" /> {t.review.start}
        </button>
        {cfg.mode === 'all' && memorizedKeys.length === 0 && (
          <p className="muted small center">{t.home.emptyReview} <Link className="link" to="/memorize">{t.home.start}</Link></p>
        )}
      </section>
    </div>
  );
}

function byKey(a, b) {
  const [s1, a1] = a.split(':').map(Number);
  const [s2, a2] = b.split(':').map(Number);
  return s1 - s2 || a1 - a2;
}

// ---------------- session ----------------
function ReviewSession({ queue, results, setResults, onFinish, meta }) {
  const { t, lang, speed, reciter, numberFmt } = useSettings();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showAudio, setShowAudio] = useState(false);
  const current = queue[index];

  const player = useRecitation({
    verses: queue,
    reciter,
    index,
    onIndexChange: setIndex,
    autoAdvance: false,
    speed,
  });

  useEffect(() => { setRevealed(false); player.pause(); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const grade = (g) => {
    const next = { ...results, [current.key]: g };
    setResults(next);
    if (index < queue.length - 1) setIndex(index + 1);
    else onFinish(next);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'SELECT'].includes(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); revealed ? player.toggle() : setRevealed(true); }
      if (revealed && e.key === '1') grade('again');
      if (revealed && e.key === '2') grade('hard');
      if (revealed && e.key === '3') grade('good');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="container page narrow review-session">
      <div className="session-progress">
        <ProgressBar value={(index + (revealed ? 0.5 : 0)) / queue.length} />
        <div className="session-progress-meta small muted">
          <span>{numberFmt(index + 1)} / {numberFmt(queue.length)}</span>
          <button className="link" onClick={() => onFinish(results)}>{t.review.finish}</button>
        </div>
      </div>

      <div className="stage-card" key={current.key}>
        <div className="stage-meta">
          <span className="badge badge-soft">{verseRef(meta, current.key, lang)}</span>
        </div>

        <QuranText
          text={current.text}
          ayah={current.ayah}
          size="lg"
          hidden={!revealed}
          onReveal={() => setRevealed(true)}
          revealLabel={t.common.show}
        />

        <div className="review-audio">
          <button className="btn btn-soft" onClick={player.toggle}>
            <Icon name={player.playing ? 'pause' : 'play'} size={18} /> {lang === 'ar' ? 'استمع' : 'Listen'}
          </button>
          <button className="icon-btn" onClick={() => setShowAudio((s) => !s)} aria-label="Audio settings">
            <Icon name="settings" size={18} />
          </button>
        </div>
        {showAudio && <AudioSettings compact />}
        {player.error && <p className="error-text small center">{t.errors.audio}</p>}
      </div>

      {revealed ? (
        <div className="grade" role="group" aria-label={t.review.recall}>
          <p className="muted small center">{t.review.recall}</p>
          <div className="grade-row">
            <button className="grade-btn g-again" onClick={() => grade('again')}>{t.review.again}</button>
            <button className="grade-btn g-hard" onClick={() => grade('hard')}>{t.review.hard}</button>
            <button className="grade-btn g-good" onClick={() => grade('good')}><Icon name="check" size={18} /> {t.review.good}</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary btn-lg btn-block" onClick={() => setRevealed(true)}>
          <Icon name="eye" /> {t.common.show}
        </button>
      )}
    </div>
  );
}
