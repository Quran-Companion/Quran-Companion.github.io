import { Link } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import { useProgress } from '../context/ProgressContext';
import ProgressRing, { ProgressBar } from '../components/ProgressRing';
import { EmptyState, ErrorState, Loader } from '../components/States';
import Icon from '../components/Icon';
import { verseRef } from './Home';
import { TOTAL_AYAHS, TOTAL_SURAHS } from '../lib/quranApi';

export default function Dashboard() {
  const { t, lang, numberFmt } = useSettings();
  const { stats, last, meta, metaError, retryMeta, reviews, loading } = useProgress();

  if (!meta && metaError) return <div className="container page"><ErrorState error={metaError} onRetry={retryMeta} /></div>;
  if (loading || !meta) return <div className="container page"><Loader /></div>;

  const maxDay = Math.max(1, ...stats.days.map((d) => d.count));
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  const surahRows = meta
    .filter((s) => stats.perSurah[s.number])
    .map((s) => ({ ...s, done: stats.perSurah[s.number] }))
    .sort((a, b) => b.done / b.ayahs - a.done / a.ayahs || a.number - b.number);

  return (
    <div className="container page">
      <header className="page-head">
        <h1>{t.dash.title}</h1>
      </header>

      <div className="stat-grid">
        <div className="card stat-card stat-hero">
          <ProgressRing value={stats.overall} size={148} stroke={12} label={t.dash.overall}>
            <strong className="ring-number">{numberFmt(Math.round(stats.overall * 1000) / 10)}%</strong>
            <span className="small muted">{t.dash.overall}</span>
          </ProgressRing>
        </div>
        <StatCard icon="book" value={numberFmt(stats.memorizedCount)} sub={`/ ${numberFmt(TOTAL_AYAHS)}`} label={t.dash.memorizedVerses} />
        <StatCard icon="check" value={numberFmt(stats.completedSurahs)} sub={`/ ${numberFmt(TOTAL_SURAHS)}`} label={t.dash.memorizedSurahs} />
        <StatCard icon="flame" value={numberFmt(stats.streak)} label={t.home.streak} />
        <StatCard icon="repeat" value={numberFmt(stats.reviewCount)} label={t.dash.sessions} />
        <div className="card stat-card">
          <span className="stat-icon"><Icon name="target" /></span>
          <span className="stat-label">{t.dash.lastPosition}</span>
          {last ? (
            <Link className="stat-link" to={`/memorize/session?surah=${last.surah}&from=${last.from}&to=${last.to}&at=${last.ayah}`}>
              {verseRef(meta, `${last.surah}:${last.ayah}`, lang)} <Icon name="arrow" size={16} className="flip-rtl-next" />
            </Link>
          ) : <span className="muted">—</span>}
        </div>
      </div>

      <section className="card">
        <h2 className="card-title">{t.dash.daily}</h2>
        <div className="day-chart" role="img" aria-label={t.dash.daily}>
          {stats.days.map((d) => {
            const date = new Date(`${d.day}T12:00:00`);
            return (
              <div key={d.day} className="day-col" title={`${d.day}: ${d.count}`}>
                <span className="day-val small">{d.count ? numberFmt(d.count) : ''}</span>
                <span className="day-bar"><span style={{ height: `${(d.count / maxDay) * 100}%` }} /></span>
                <span className="day-label small muted">{date.toLocaleDateString(locale, { day: 'numeric' })}</span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2 className="card-title">{t.dash.surahProgress}</h2>
          {surahRows.length ? (
            <ul className="surah-progress-list">
              {surahRows.map((s) => (
                <li key={s.number}>
                  <Link to={`/quran/${s.number}`}>
                    <span className="sp-name"><span lang="ar">{s.name}</span><span className="muted small">{numberFmt(s.done)}/{numberFmt(s.ayahs)}</span></span>
                    <ProgressBar value={s.done / s.ayahs} small />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="book" action={<Link to="/memorize" className="btn btn-soft">{t.home.start}</Link>}>{t.home.emptyRecent}</EmptyState>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">{t.home.recent}</h2>
          {stats.recent.length ? (
            <ul className="recent-list">
              {stats.recent.map((r) => {
                const [s, a] = r.key.split(':');
                return (
                  <li key={r.key}>
                    <Link to={`/quran/${s}#a${a}`}>
                      <span className="recent-dot"><Icon name="check" size={14} /></span>
                      <span>{verseRef(meta, r.key, lang)}</span>
                      <time className="muted small">{new Date(r.at).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}</time>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState icon="brain">{t.home.emptyRecent}</EmptyState>}
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">{t.dash.history}</h2>
        {reviews.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                  <th>{lang === 'ar' ? 'النطاق' : 'Scope'}</th>
                  <th>{t.review.reviewed}</th>
                  <th>{t.review.accuracy}</th>
                  <th>{t.review.duration}</th>
                </tr>
              </thead>
              <tbody>
                {reviews.slice(0, 20).map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.at).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{r.scope}</td>
                    <td>{numberFmt(r.total)}</td>
                    <td>
                      <span className={`acc ${r.good / r.total >= 0.8 ? 'acc-good' : r.good / r.total >= 0.5 ? 'acc-mid' : 'acc-low'}`}>
                        {numberFmt(Math.round((r.good / r.total) * 100))}%
                      </span>
                    </td>
                    <td>{numberFmt(Math.max(1, Math.round(r.durationSec / 60)))} {t.common.minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="repeat" action={<Link to="/review" className="btn btn-soft">{t.review.start}</Link>}>{t.dash.noHistory}</EmptyState>
        )}
      </section>
    </div>
  );
}

function StatCard({ icon, value, sub, label }) {
  return (
    <div className="card stat-card">
      <span className="stat-icon"><Icon name={icon} /></span>
      <span className="stat-value">{value} {sub && <small className="muted">{sub}</small>}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
