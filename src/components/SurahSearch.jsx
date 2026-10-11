import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { normalizeArabic } from '../lib/quranApi';
import { toArabicDigits } from './Verse';
import Icon from './Icon';

/** Loose key for matching: no diacritics/tatweel, no "سورة" prefix, no "al-" / punctuation. */
function key(s = '') {
  return normalizeArabic(s)
    .replace(/ـ/g, '')
    .replace(/^سوره\s*/, '')
    .replace(/^(al|an|ar|as|at|ad|az|ash|adh)[- ]/, '')
    .replace(/['’\-\s]/g, '');
}

function matches(s, q) {
  if (!q) return true;
  const nq = key(q);
  const digits = q.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();
  if (/^\d+$/.test(digits)) return String(s.number).startsWith(digits);
  return key(s.name).includes(nq) || key(s.englishName).includes(nq) || key(s.translation || '').includes(nq);
}

/**
 * Type-to-search surah picker: type the surah's name (Arabic or English) or its number.
 * value: surah number; onChange(number)
 */
export default function SurahSearch({ meta, value, onChange, autoFocus }) {
  const { lang, t, numberFmt } = useSettings();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrap = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const selected = meta?.[value - 1];
  const results = useMemo(() => (meta || []).filter((s) => matches(s, query)), [meta, query]);

  useEffect(() => { setActive(0); }, [query]);

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!wrap.current?.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Keep the highlighted option visible.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (s) => {
    onChange(s.number);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (open && results[active]) choose(results[active]); else setOpen(true); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  const label = (s) => `${lang === 'ar' ? toArabicDigits(s.number) : s.number}. ${s.name}`;

  return (
    <div className="surah-search" ref={wrap}>
      <label className="field" htmlFor={`${id}-input`}>
        <span>{t.common.surah}</span>
      </label>
      <div className={`combo ${open ? 'is-open' : ''}`}>
        <Icon name="search" />
        <input
          id={`${id}-input`}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={selected ? label(selected) : (lang === 'ar' ? 'اكتب اسم السورة أو رقمها…' : 'Type a surah name or number…')}
          value={open ? query : selected ? label(selected) : ''}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={onKey}
        />
        <span className="combo-chevron" aria-hidden="true">▾</span>
      </div>
      {open && (
        <ul className="combo-list" id={`${id}-list`} role="listbox" ref={listRef}>
          {results.length === 0 && <li className="combo-empty">{lang === 'ar' ? 'لا توجد سورة بهذا الاسم' : 'No matching surah'}</li>}
          {results.map((s, i) => (
            <li
              key={s.number}
              role="option"
              data-index={i}
              aria-selected={s.number === value}
              className={`combo-option ${i === active ? 'is-active' : ''} ${s.number === value ? 'is-selected' : ''}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(s)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="combo-num">{lang === 'ar' ? toArabicDigits(s.number) : s.number}</span>
              <span className="combo-name" lang="ar">{s.name}</span>
              <span className="combo-meta">{s.englishName} · {numberFmt(s.ayahs)} {t.common.verses}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
