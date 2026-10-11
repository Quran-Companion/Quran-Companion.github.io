import { useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import SurahSearch from './SurahSearch';

/** Surah selector + from/to verse inputs. value = {surah, from, to} */
export default function SurahRangePicker({ meta, value, onChange, showRange = true }) {
  const { t, lang } = useSettings();
  const total = meta?.[value.surah - 1]?.ayahs || 1;

  // Keep the range valid when the surah changes.
  useEffect(() => {
    if (value.to > total || value.from > total) onChange({ ...value, from: 1, to: Math.min(total, 5) });
  }, [total]); // eslint-disable-line react-hooks/exhaustive-deps

  const nums = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div className="picker">
      <SurahSearch
        meta={meta}
        value={value.surah}
        onChange={(s) => {
          const max = meta?.[s - 1]?.ayahs || 1;
          // Whole surah by default when it is short; otherwise the first 5 verses.
          onChange({ surah: s, from: 1, to: max <= 10 ? max : 5 });
        }}
      />
      {showRange && (
        <div className="range-quick">
          <button type="button" className={`btn btn-soft btn-sm ${value.from === 1 && value.to === total ? 'is-on' : ''}`} onClick={() => onChange({ ...value, from: 1, to: total })}>
            {lang === 'ar' ? 'السورة كاملة' : 'Whole surah'}
          </button>
        </div>
      )}
      {showRange && (
        <div className="field-pair">
          <label className="field">
            <span>{t.common.from}</span>
            <select value={value.from} onChange={(e) => {
              const from = Number(e.target.value);
              onChange({ ...value, from, to: Math.max(from, value.to) });
            }}>
              {nums.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t.common.to}</span>
            <select value={value.to} onChange={(e) => {
              const to = Number(e.target.value);
              onChange({ ...value, to, from: Math.min(value.from, to) });
            }}>
              {nums.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
