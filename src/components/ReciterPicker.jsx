import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { COUNTRIES, RECITERS, STYLES, resolveReciter } from '../lib/reciters';
import { normalizeArabic } from '../lib/quranApi';
import Icon from './Icon';

const loose = (s = '') => normalizeArabic(s).replace(/ـ/g, '').replace(/^ال/, '').replace(/[\s'’\-()]/g, '');

/** Matches any part of the name in Arabic or English, e.g. "منشاوي", "المنشاوي", "minsh", "مجود". */
function matches(r, q) {
  if (!q.trim()) return true;
  const hay = [r.ar, r.en, STYLES[r.style]?.ar, STYLES[r.style]?.en].filter(Boolean).map(loose).join('|');
  return q.trim().split(/\s+/).every((w) => hay.includes(loose(w)));
}

/** Reciter chooser: a button that opens a searchable list grouped by country. */
export default function ReciterPicker({ compact }) {
  const { lang, reciter, update, t } = useSettings();
  const ar = lang === 'ar';
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const current = resolveReciter(reciter);

  const groups = useMemo(
    () => COUNTRIES.map((c) => ({ ...c, items: RECITERS.filter((r) => r.country === c.id && matches(r, q)) })).filter((g) => g.items.length),
    [q],
  );

  useEffect(() => {
    if (!open) return;
    setQ('');
    const id = setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(id); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const choose = (id) => { update({ reciter: id }); setOpen(false); };

  return (
    <>
      <button type="button" className={`reciter-btn ${compact ? 'is-compact' : ''}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="reciter-btn-icon"><Icon name="user" size={18} /></span>
        <span className="reciter-btn-text">
          <span className="reciter-btn-label">{t.common.reciter}</span>
          <span className="reciter-btn-name">
            {ar ? current.ar : current.en}
            {current.style && <em> · {STYLES[current.style][ar ? 'ar' : 'en']}</em>}
          </span>
        </span>
        <span className="reciter-btn-chev" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={t.common.reciter}>
            <div className="sheet-head">
              <strong>{ar ? 'اختر القارئ' : 'Choose a reciter'}</strong>
              <span className="muted small">{RECITERS.length} {ar ? 'قارئ' : 'reciters'}</span>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label={t.common.close}><Icon name="close" /></button>
            </div>
            <div className="combo sheet-search">
              <Icon name="search" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={ar ? 'اكتب اسم الشيخ… مثلًا: المنشاوي' : 'Type a name… e.g. Minshawi'}
                aria-label={ar ? 'بحث عن قارئ' : 'Search reciters'}
              />
            </div>
            <div className="sheet-body">
              {groups.length === 0 && <p className="combo-empty">{ar ? 'لا يوجد قارئ بهذا الاسم' : 'No reciter found'}</p>}
              {groups.map((g) => (
                <section key={g.id} className="reciter-group">
                  <h3 className="reciter-group-title">{ar ? g.ar : g.en} <span className="muted">({g.items.length})</span></h3>
                  <ul>
                    {g.items.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className={`reciter-item ${r.id === current.id ? 'is-selected' : ''}`}
                          onClick={() => choose(r.id)}
                          data-reciter={r.id}
                        >
                          <span className="reciter-item-name">{ar ? r.ar : r.en}</span>
                          {r.style && <span className={`reciter-tag tag-${r.style}`}>{STYLES[r.style][ar ? 'ar' : 'en']}</span>}
                          {r.id === current.id && <Icon name="check" size={18} className="reciter-check" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
