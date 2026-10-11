import { useSettings } from '../context/SettingsContext';
import Icon from './Icon';

export function Spinner({ size = 22 }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="loading" />;
}

export function Loader({ label }) {
  const { t } = useSettings();
  return (
    <div className="state" aria-live="polite">
      <Spinner size={28} />
      <p className="muted">{label || t.common.loading}</p>
    </div>
  );
}

export function VerseSkeleton({ lines = 3 }) {
  return (
    <div className="skeleton-wrap" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton" style={{ width: `${92 - i * 14}%` }} />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const { t } = useSettings();
  const msg = error?.message === 'network' ? t.errors.network : t.errors.generic;
  // Keep the technical reason visible (e.g. "http_503") so failures are never silently hidden.
  const detail = error && error.message !== 'network' ? error.message || String(error) : null;
  return (
    <div className="state state-error" role="alert">
      <span className="state-icon"><Icon name="alert" size={26} /></span>
      <p>{msg}</p>
      {detail && <p className="muted small error-detail" dir="ltr">{detail}</p>}
      {onRetry && (
        <button className="btn btn-soft" onClick={onRetry}>
          <Icon name="replay" size={18} /> {t.common.retry}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon = 'book', title, children, action }) {
  return (
    <div className="state state-empty">
      <span className="state-icon"><Icon name={icon} size={26} /></span>
      {title && <h3>{title}</h3>}
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}
