import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import { useProgress } from '../context/ProgressContext';
import { getSurah } from '../lib/quranApi';
import { useAsync } from '../hooks/useAsync';
import { useRecitation } from '../hooks/useRecitation';
import { ErrorState, VerseSkeleton } from '../components/States';
import { AyahNumber, toArabicDigits } from '../components/Verse';
import { Transport } from '../components/AudioControls';
import SettingsSheet from '../components/SettingsSheet';
import { resolveReciter } from '../lib/reciters';
import { ProgressBar } from '../components/ProgressRing';
import Icon from '../components/Icon';

export default function SurahReader() {
  const { number } = useParams();
  const n = Number(number);
  const { t, lang, reciter, speed, numberFmt } = useSettings();
  const { memorized, toggleMemorized, stats } = useProgress();
  const navigate = useNavigate();
  const { hash } = useLocation();

  const valid = Number.isInteger(n) && n >= 1 && n <= 114;
  const { data: surah, loading, error, retry } = useAsync(() => (valid ? getSurah(n) : null), [n]);
  const verses = surah?.verses || [];

  const [index, setIndex] = useState(0);
  const [hideAll, setHideAll] = useState(false);
  const [revealed, setRevealed] = useState(() => new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [range, setRange] = useState(null); // {from, to} when selecting
  const [selecting, setSelecting] = useState(false);

  const player = useRecitation({
    verses,
    reciter,
    index,
    onIndexChange: setIndex,
    repeatVerse: 1,
    autoAdvance: true,
    speed,
  });

  // Jump to #aN after load.
  useEffect(() => {
    if (!verses.length || !hash) return;
    const a = Number(hash.replace('#a', ''));
    if (a >= 1 && a <= verses.length) {
      setIndex(a - 1);
      requestAnimationFrame(() =>
        document.getElementById(`a${a}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      );
    }
  }, [verses.length, hash]);

  // Keep the playing verse in view.
  useEffect(() => {
    if (player.playing) document.getElementById(`a${index + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [index, player.playing]);

  useEffect(() => { setRevealed(new Set()); }, [hideAll, n]);

  const playVerse = useCallback((i) => {
    if (i === index && player.playing) player.pause();
    else player.playAt(i);
  }, [index, player]);

  const onVerseClick = (i) => {
    if (!selecting) return;
    const a = i + 1;
    if (!range || (range.from && range.to)) setRange({ from: a, to: null });
    else setRange(a < range.from ? { from: a, to: range.from } : { from: range.from, to: a });
  };

  const inRange = (a) => range && a >= range.from && a <= (range.to || range.from);
  const memorizedHere = stats.perSurah[n] || 0;

  const meta = useMemo(() => surah && (
    <div className="surah-header card">
      <div>
        <span className="eyebrow">{t.common.surah} {numberFmt(n)}</span>
        <h1 className="surah-title" lang="ar">{surah.name}</h1>
        <p className="muted">
          {surah.englishName} · {surah.translation} · {surah.type === 'Meccan' ? t.common.meccan : t.common.medinan} · {numberFmt(verses.length)} {t.common.verses}
        </p>
      </div>
      <div className="surah-progress">
        <span className="small muted">{numberFmt(memorizedHere)} / {numberFmt(verses.length)} {t.common.memorized}</span>
        <ProgressBar value={memorizedHere / (verses.length || 1)} />
      </div>
    </div>
  ), [surah, n, verses.length, memorizedHere, t, numberFmt]);

  if (!valid) return <div className="container page"><ErrorState error={new Error('not_found')} /></div>;

  return (
    <div className="container page reader">
      <div className="reader-nav">
        <Link to="/quran" className="link"><Icon name="arrow" className="flip-rtl-back" size={18} /> {t.quran.title}</Link>
        <div className="reader-nav-pages">
          {n > 1 && <Link to={`/quran/${n - 1}`} className="link small">{lang === 'ar' ? 'السورة السابقة' : 'Previous surah'}</Link>}
          {n < 114 && <Link to={`/quran/${n + 1}`} className="link small">{lang === 'ar' ? 'السورة التالية' : 'Next surah'}</Link>}
        </div>
      </div>

      {loading && <><div className="card"><VerseSkeleton lines={2} /></div><div className="card"><VerseSkeleton lines={6} /></div></>}
      {error && <ErrorState error={error} onRetry={retry} />}

      {surah && (
        <>
          {meta}

          <div className="toolbar card">
            <Transport
              player={player}
              size="sm"
              canPrev={index > 0}
              canNext={index < verses.length - 1}
              onPrev={() => { player.resetCounts(); setIndex((i) => Math.max(0, i - 1)); }}
              onNext={() => { player.resetCounts(); setIndex((i) => Math.min(verses.length - 1, i + 1)); }}
            />
            <div className="toolbar-row">
              <button className="btn btn-soft btn-sm" onClick={() => setShowSettings(true)}>
                <Icon name="settings" size={18} /> {lang === 'ar' ? 'القارئ والخط' : 'Reciter & text'}
              </button>
              <button className={`btn btn-soft btn-sm ${hideAll ? 'is-on' : ''}`} onClick={() => setHideAll((h) => !h)}>
                <Icon name={hideAll ? 'eye' : 'eyeOff'} size={18} /> {hideAll ? t.quran.showAll : t.quran.hideAll}
              </button>
              <button className={`btn btn-soft btn-sm ${selecting ? 'is-on' : ''}`} onClick={() => { setSelecting((s) => !s); setRange(null); }}>
                <Icon name="target" size={18} /> {t.quran.selectRange}
              </button>
            </div>
            <p className="toolbar-reciter muted small"><Icon name="headphones" size={14} /> {lang === 'ar' ? resolveReciter(reciter).ar : resolveReciter(reciter).en}</p>
            {player.error && <p className="error-text small">{t.errors.audio}</p>}
          </div>

          {selecting && (
            <div className="range-bar card" role="status">
              <span>
                {range
                  ? `${t.common.from} ${numberFmt(range.from)} ${range.to ? `${t.common.to.split(' ')[0]} ${numberFmt(range.to)}` : ''}`
                  : lang === 'ar' ? 'اضغط على آية البداية ثم آية النهاية' : 'Tap the first verse, then the last'}
              </span>
              <button
                className="btn btn-primary btn-sm"
                disabled={!range}
                onClick={() => navigate(`/memorize/session?surah=${n}&from=${range.from}&to=${range.to || range.from}`)}
              >
                <Icon name="brain" size={18} /> {t.quran.memorizeRange}
              </button>
            </div>
          )}

          <ol className="verse-list">
            {verses.map((v, i) => {
              const isMem = Boolean(memorized[v.key]);
              const hidden = hideAll && !revealed.has(i);
              return (
                <li
                  key={v.key}
                  id={`a${v.ayah}`}
                  className={`verse-row ${i === index ? 'is-current' : ''} ${isMem ? 'is-memorized' : ''} ${inRange(v.ayah) ? 'in-range' : ''} ${selecting ? 'is-selectable' : ''}`}
                  onClick={() => onVerseClick(i)}
                >
                  <div className="verse-body">
                    {hidden ? (
                      <button
                        className="quran-hidden quran quran-md"
                        onClick={(e) => { e.stopPropagation(); setRevealed((s) => new Set(s).add(i)); }}
                      >
                        <span className="hidden-lines" aria-hidden="true"><span /><span /></span>
                        <span className="hidden-label">{t.quran.tapToReveal} · {toArabicDigits(v.ayah)}</span>
                      </button>
                    ) : (
                      <p className="quran quran-md" lang="ar" dir="rtl">
                        {v.text} <AyahNumber n={v.ayah} />
                      </p>
                    )}
                  </div>
                  <div className="verse-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="icon-btn" onClick={() => playVerse(i)} aria-label={`Play ${v.ayah}`}>
                      <Icon name={player.playing && i === index ? 'pause' : 'play'} size={16} />
                    </button>
                    <button
                      className={`icon-btn mem-toggle ${isMem ? 'is-on' : ''}`}
                      onClick={() => toggleMemorized(v.key)}
                      aria-pressed={isMem}
                      aria-label={isMem ? t.common.unmark : t.common.markMemorized}
                      title={isMem ? t.common.unmark : t.common.markMemorized}
                    >
                      <Icon name="check" size={16} />
                    </button>
                    <Link
                      className="icon-btn"
                      to={`/memorize/session?surah=${n}&from=${v.ayah}&to=${Math.min(verses.length, v.ayah + 4)}`}
                      aria-label={t.memorize.start}
                      title={t.memorize.start}
                    >
                      <Icon name="brain" size={16} />
                    </Link>
                    {v.sajda && <span className="badge badge-soft">۩</span>}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="source-note muted small">{t.common.source}: Tanzil Uthmani · AlQuran Cloud</p>
          <SettingsSheet open={showSettings} onClose={() => setShowSettings(false)} sections={['audio', 'display']} />
        </>
      )}
    </div>
  );
}
