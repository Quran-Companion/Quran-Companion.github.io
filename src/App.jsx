import { Component, lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Link, Route, Routes } from 'react-router-dom';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { AuthProvider } from './context/AuthContext';
import { ProgressProvider } from './context/ProgressContext';
import Layout from './components/Layout';
import { Loader } from './components/States';
import Home from './pages/Home';

// Route-level code splitting keeps the first load small.
const QuranIndex = lazy(() => import('./pages/QuranIndex'));
const SurahReader = lazy(() => import('./pages/SurahReader'));
const MemorizeSetup = lazy(() => import('./pages/MemorizeSetup'));
const MemorizeSession = lazy(() => import('./pages/MemorizeSession'));
const Review = lazy(() => import('./pages/Review'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Account = lazy(() => import('./pages/Account'));

function NotFound() {
  const { t } = useSettings();
  return (
    <div className="container page center">
      <h1>404</h1>
      <p className="muted">{t.errors.notFound}</p>
      <Link to="/" className="btn btn-primary">{t.nav.home}</Link>
    </div>
  );
}

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error(error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="container page center">
          <h1>⚠︎</h1>
          <p>Something went wrong · حدث خطأ غير متوقع</p>
          <p className="muted small error-detail" dir="ltr">{String(this.state.error?.message || this.state.error)}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload · إعادة التحميل</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// The single-file build (and any page opened from disk) uses hash URLs (#/quran/2) so it works
// anywhere without server-side route rewrites; the normal build uses clean URLs.
const useHash = import.meta.env.MODE === 'standalone' || window.location.protocol === 'file:';
const Router = useHash ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <AuthProvider>
          <ProgressProvider>
            <Router>
              <Suspense fallback={<div className="container page"><Loader /></div>}>
                <Routes>
                  <Route element={<Layout />}>
                    <Route index element={<Home />} />
                    <Route path="quran" element={<QuranIndex />} />
                    <Route path="quran/:number" element={<SurahReader />} />
                    <Route path="memorize" element={<MemorizeSetup />} />
                    <Route path="memorize/session" element={<MemorizeSession />} />
                    <Route path="review" element={<Review />} />
                    <Route path="review/session" element={<Review />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="account" element={<Account />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </Suspense>
            </Router>
          </ProgressProvider>
        </AuthProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
