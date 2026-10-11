import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useProgress } from '../context/ProgressContext';
import Icon from './Icon';

const NAV = [
  { to: '/', key: 'home', icon: 'home', end: true },
  { to: '/quran', key: 'quran', icon: 'book' },
  { to: '/memorize', key: 'memorize', icon: 'brain' },
  { to: '/review', key: 'review', icon: 'repeat' },
  { to: '/dashboard', key: 'dashboard', icon: 'chart' },
];

export function Logo() {
  const { t } = useSettings();
  return (
    <Link to="/" className="logo" aria-label={t.appName}>
      <svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
        <rect width="64" height="64" rx="16" className="logo-bg" />
        <path
          d="M32 12l5.9 8.1L48 18.3l-1.8 10.1L54 32l-7.8 3.6L48 45.7l-10.1-1.8L32 52l-5.9-8.1L16 45.7l1.8-10.1L10 32l7.8-3.6L16 18.3l10.1 1.8z"
          fill="none"
          className="logo-star"
          strokeWidth="2.5"
        />
        <circle cx="32" cy="32" r="7" className="logo-dot" />
      </svg>
      <span className="logo-text">{t.appName}</span>
    </Link>
  );
}

export default function Layout() {
  const { t, theme, toggleTheme, toggleLang, lang } = useSettings();
  const { user } = useAuth();
  const { mode, syncError } = useProgress();
  const { pathname } = useLocation();
  const focus = pathname.startsWith('/memorize/session');

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className={`app ${focus ? 'app-focus' : ''}`}>
      <a href="#main" className="skip">Skip to content</a>
      <header className="topbar">
        <div className="topbar-inner container">
          <Logo />
          <nav className="nav-desktop" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
                {t.nav[n.key]}
              </NavLink>
            ))}
          </nav>
          <div className="topbar-actions">
            <button className="icon-btn" onClick={toggleLang} aria-label="Language" title={lang === 'ar' ? 'English' : 'العربية'}>
              <span className="lang-chip">{lang === 'ar' ? 'EN' : 'ع'}</span>
            </button>
            <button className="icon-btn" onClick={toggleTheme} aria-label="Theme">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <Link to="/account" className={`account-btn ${mode === 'cloud' ? 'is-synced' : ''}`} aria-label={t.auth.title}>
              {user ? (
                <span className="avatar">{(user.displayName || user.email || '?').trim()[0].toUpperCase()}</span>
              ) : (
                <Icon name="user" />
              )}
              {mode === 'cloud' && <span className={`sync-dot ${syncError ? 'is-error' : ''}`} />}
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="main">
        <Outlet />
      </main>

      <nav className="nav-mobile" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="nav-mobile-link">
            <Icon name={n.icon} size={22} />
            <span>{t.nav[n.key]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
