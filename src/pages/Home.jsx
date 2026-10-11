import { Link, useNavigate } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import { useProgress } from '../context/ProgressContext';
import ProgressRing from '../components/ProgressRing';
import Icon from '../components/Icon';
import { EmptyState } from '../components/States';
import { toArabicDigits } from '../components/Verse';

export function surahLabel(meta, n, lang) {
  const s = meta?.[n - 1];
  if (!s) return `${n}`;
  return lang === 'ar' ? s.name : s.englishName;
}

export function verseRef(meta, key, lang) {
  const [s, a] = key.split(':');
  return `${surahLabel(meta, +s, lang)} · ${lang === 'ar' ? toArabicDigits(a) : a}`;
}

export default function Home() {
  const { t, lang, numberFmt } = useSettings();
  const { stats, last, meta, loading } = useProgress();
  const navigate = useNavigate();

  const continueTo = last
    ? `/memorize/session?surah=${last.surah}&from=${last.from}&to=${last.to}&at=${last.ayah}`
    : null;

  return (
    <div className="container page">
      <section className="hero">
        <div className="hero-text">
          <span className="eyebrow">{lang === 'ar' ? 'رفيقك اليومي في الحفظ' : 'Your daily memorization companion'}</span>
          <h1>{t.home.title}</h1>
          <p className="lead">{t.home.subtitle}</p>
          <div className="hero-actions">
            <Link to="/memorize" className="btn btn-primary btn-lg">
              <Icon name="brain" /> {t.home.start}
            </Link>
            <button
              className="btn btn-ghost btn-lg"
              disabled={!continueTo}
              onClick={() => continueTo && navigate(continueTo)}
            >
              {t.home.continue} <Icon name="arrow" className="flip-rtl-next" />
            </button>
          </div>
          {last && meta && (
            <p className="muted small hero-last">
              {t.dash.lastPosition}: {verseRef(meta, `${last.surah}:${last.ayah}`, lang)}
            </p>
          )}
        </div>

        <div className="card hero-card">
          <h2 className="card-title">{t.home.progress}</h2>
          <div className="hero-progress">
            <ProgressRing value={stats.overall} size={132} label={t.dash.overall}>
              <strong className="ring-number">{numberFmt(Math.round(stats.overall * 1000) / 10)}%</strong>
            </ProgressRing>
            <ul className="mini-stats">
              <li><strong>{numberFmt(stats.memorizedCount)}</strong><span>{t.dash.memorizedVerses}</span></li>
              <li><strong>{numberFmt(stats.completedSurahs)}</strong><span>{t.dash.memorizedSurahs}</span></li>
              <li><strong><Icon name="flame" size={16} /> {numberFmt(stats.streak)}</strong><span>{t.home.streak}</span></li>
              <li><strong>{numberFmt(stats.today)}</strong><span>{t.home.todayCount}</span></li>
            </ul>
          </div>
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <header className="card-head">
            <h2 className="card-title">{t.home.today}</h2>
            {stats.dueToday.length > 0 && <span className="badge">{numberFmt(stats.dueToday.length)}</span>}
          </header>
          {loading ? null : stats.dueToday.length ? (
            <>
              <p className="muted small">{t.home.todayHint}</p>
              <div className="chips">
                {stats.dueToday.slice(0, 8).map((k) => (
                  <span key={k} className="chip">{verseRef(meta, k, lang)}</span>
                ))}
              </div>
              <Link to="/review/session?mode=due" className="btn btn-primary">
                <Icon name="repeat" /> {t.home.startReview}
              </Link>
            </>
          ) : (
            <EmptyState icon="repeat">{t.home.emptyReview}</EmptyState>
          )}
        </section>

        <section className="card">
          <header className="card-head">
            <h2 className="card-title">{t.home.recent}</h2>
            {stats.recent.length > 0 && <Link to="/dashboard" className="link">{t.common.viewAll}</Link>}
          </header>
          {loading ? null : stats.recent.length ? (
            <ul className="recent-list">
              {stats.recent.slice(0, 6).map((r) => {
                const [s, a] = r.key.split(':');
                return (
                  <li key={r.key}>
                    <Link to={`/quran/${s}#a${a}`}>
                      <span className="recent-dot"><Icon name="check" size={14} /></span>
                      <span>{verseRef(meta, r.key, lang)}</span>
                      <time className="muted small">{new Date(r.at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' })}</time>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon="brain" action={<Link to="/memorize/session?surah=1&from=1&to=7" className="btn btn-soft">{t.home.start}</Link>}>
              {t.home.emptyRecent}
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}
