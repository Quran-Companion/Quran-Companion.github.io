import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import { useProgress } from '../context/ProgressContext';
import SurahRangePicker from '../components/SurahRangePicker';
import ReciterPicker from '../components/ReciterPicker';
import { ModeChooser } from '../components/SettingsSheet';
import { ErrorState, Loader } from '../components/States';
import { ProgressBar } from '../components/ProgressRing';
import Icon from '../components/Icon';
import { verseRef } from './Home';

const SUGGESTED = [1, 112, 113, 114, 103, 108, 110, 36, 67, 18];

export default function MemorizeSetup() {
  const { t, lang, numberFmt } = useSettings();
  const { meta, metaError, retryMeta, last, stats } = useProgress();
  const navigate = useNavigate();
  const [sel, setSel] = useState(() =>
    last ? { surah: last.surah, from: last.from, to: last.to } : { surah: 1, from: 1, to: 7 },
  );

  const start = () => navigate(`/memorize/session?surah=${sel.surah}&from=${sel.from}&to=${sel.to}`);

  if (!meta && metaError) return <div className="container page"><ErrorState error={metaError} onRetry={retryMeta} /></div>;
  if (!meta) return <div className="container page"><Loader /></div>;

  return (
    <div className="container page narrow">
      <header className="page-head">
        <h1>{t.memorize.title}</h1>
        <p className="muted">{t.memorize.choose}</p>
      </header>

      {last && (
        <Link
          to={`/memorize/session?surah=${last.surah}&from=${last.from}&to=${last.to}&at=${last.ayah}`}
          className="card continue-card"
        >
          <span className="continue-icon"><Icon name="play" size={18} /></span>
          <span>
            <strong>{t.home.continue}</strong>
            <span className="muted small d-block">{verseRef(meta, `${last.surah}:${last.ayah}`, lang)}</span>
          </span>
          <Icon name="arrow" className="flip-rtl-next" />
        </Link>
      )}

      <section className="card setup-card-steps">
        <div className="setup-step">
          <span className="step-num">١</span>
          <div className="step-body">
            <h2 className="step-title">{lang === 'ar' ? 'اختر السورة' : 'Choose the surah'}</h2>
            <SurahRangePicker meta={meta} value={sel} onChange={setSel} />
            <p className="muted small">{numberFmt(sel.to - sel.from + 1)} {t.common.verses}</p>
          </div>
        </div>
        <div className="setup-step">
          <span className="step-num">٢</span>
          <div className="step-body">
            <h2 className="step-title">{lang === 'ar' ? 'طريقة الحفظ' : 'How to memorize'}</h2>
            <ModeChooser />
          </div>
        </div>
        <div className="setup-step">
          <span className="step-num">٣</span>
          <div className="step-body">
            <h2 className="step-title">{lang === 'ar' ? 'القارئ' : 'Reciter'}</h2>
            <ReciterPicker />
          </div>
        </div>
        <button className="btn btn-primary btn-lg btn-block start-btn" onClick={start}>
          <Icon name="brain" /> {t.memorize.start}
        </button>
      </section>

      <section>
        <h2 className="section-title">{lang === 'ar' ? 'سور مقترحة للبداية' : 'Suggested surahs'}</h2>
        <ul className="suggest-grid">
          {SUGGESTED.map((n) => {
            const s = meta[n - 1];
            const done = stats.perSurah[n] || 0;
            return (
              <li key={n}>
                <button className="suggest" onClick={() => setSel({ surah: n, from: 1, to: Math.min(s.ayahs, n === 1 ? 7 : 5) })}>
                  <span className="surah-ar" lang="ar">{s.name}</span>
                  <span className="muted small">{numberFmt(s.ayahs)} {t.common.verses}</span>
                  <ProgressBar value={done / s.ayahs} small />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
