import { useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { authErrorMessage, useAuth } from '../context/AuthContext';
import { useProgress } from '../context/ProgressContext';
import { Spinner } from '../components/States';
import Icon from '../components/Icon';
import FirebaseSetup from '../components/FirebaseSetup';

const GOOGLE_ICON = (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
);

export default function Account() {
  const { t, lang, numberFmt } = useSettings();
  const auth = useAuth();
  const { stats, syncError } = useProgress();
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const run = async (fn) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ type: 'error', text: authErrorMessage(e, lang) });
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    run(() => (tab === 'login' ? auth.signIn(form) : auth.signUp(form)));
  };

  if (auth.user) {
    const u = auth.user;
    return (
      <div className="container page narrow">
        <div className="card account-card">
          {u.photoURL
            ? <img className="avatar avatar-lg avatar-img" src={u.photoURL} alt="" referrerPolicy="no-referrer" />
            : <span className="avatar avatar-lg">{(u.displayName || u.email || '?')[0].toUpperCase()}</span>}
          <h1>{u.displayName || u.email}</h1>
          <p className="muted small">{t.auth.signedInAs} {u.email}</p>
          <p className={`sync-status ${syncError ? 'is-error' : ''}`}>
            <Icon name="cloud" size={18} /> {syncError ? t.errors.network : t.auth.synced}
          </p>
          <p className="muted">{numberFmt(stats.memorizedCount)} {t.common.verses} {t.common.memorized}</p>
          <button className="btn btn-ghost" onClick={() => auth.signOut()}>{t.common.signOut}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container page narrow">
      <header className="page-head center">
        <h1>{t.auth.title}</h1>
        <p className="muted">{t.auth.subtitle}</p>
      </header>

      {!auth.enabled ? (
        auth.disabledReason === 'file-protocol' ? (
          <div className="card notice">
            <Icon name="alert" />
            <p>{t.auth.fileMode}</p>
          </div>
        ) : (
          <FirebaseSetup reason={auth.disabledReason} />
        )
      ) : (
        <div className="card auth-card">
          <button className="btn btn-google btn-lg btn-block" onClick={() => run(auth.signInWithGoogle)} disabled={busy}>
            {GOOGLE_ICON}
            {t.auth.google}
          </button>
          <div className="divider"><span>{lang === 'ar' ? 'أو بالبريد الإلكتروني' : 'or with email'}</span></div>
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={tab === 'login'} className={tab === 'login' ? 'is-active' : ''} onClick={() => setTab('login')}>{t.auth.login}</button>
            <button role="tab" aria-selected={tab === 'signup'} className={tab === 'signup' ? 'is-active' : ''} onClick={() => setTab('signup')}>{t.auth.signup}</button>
          </div>

          <form onSubmit={submit} className="form">
            {tab === 'signup' && (
              <label className="field">
                <span>{t.auth.name}</span>
                <input value={form.name} onChange={set('name')} autoComplete="name" />
              </label>
            )}
            <label className="field">
              <span>{t.auth.email}</span>
              <input type="email" required value={form.email} onChange={set('email')} autoComplete="email" dir="ltr" />
            </label>
            <label className="field">
              <span>{t.auth.password}</span>
              <input type="password" required minLength={6} value={form.password} onChange={set('password')} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} dir="ltr" />
            </label>
            {msg && <p className={msg.type === 'error' ? 'error-text' : 'success-text'} role="alert">{msg.text}</p>}
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? <Spinner size={18} /> : tab === 'login' ? t.auth.login : t.auth.signup}
            </button>
          </form>

          {tab === 'login' && (
            <button
              className="link small"
              onClick={() => {
                if (!form.email) return setMsg({ type: 'error', text: authErrorMessage({ code: 'auth/invalid-email' }, lang) });
                run(async () => { await auth.resetPassword(form.email); setMsg({ type: 'ok', text: t.auth.resetSent }); });
              }}
            >
              {t.auth.reset}
            </button>
          )}



          {stats.memorizedCount > 0 && <p className="muted small center">{t.auth.merged}</p>}
        </div>
      )}

      <p className="muted small center">{t.auth.guestNote}</p>
    </div>
  );
}
