import { useSettings } from '../context/SettingsContext';
import ReciterPicker from './ReciterPicker';
import { QURAN_FONTS } from '../lib/fonts';
import Icon from './Icon';
import { Spinner } from './States';

const SPEEDS = [0.75, 1, 1.25, 1.5];

/** Reciter + speed pickers, shared by every page that plays audio. */
export function AudioSettings({ compact }) {
  const { t, speed, update } = useSettings();
  return (
    <div className={`audio-settings ${compact ? 'is-compact' : ''}`}>
      <ReciterPicker compact={compact} />
      <label className="field-inline">
        <span>{t.common.speed}</span>
        <select value={speed} onChange={(e) => update({ speed: +e.target.value })}>
          {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
      </label>
    </div>
  );
}

/** Main transport: previous / play-pause / next / replay. */
export function Transport({ player, onPrev, onNext, canPrev, canNext, size = 'lg' }) {
  const { t } = useSettings();
  const { playing, loading, toggle, replay } = player;
  return (
    <div className={`transport transport-${size}`}>
      <button className="icon-btn" onClick={replay} aria-label="Replay verse" title="Replay">
        <Icon name="replay" />
      </button>
      {/* Visual order follows reading direction: "previous" sits on the start side. */}
      <button className="icon-btn" onClick={onPrev} disabled={!canPrev} aria-label={t.common.prev}>
        <Icon name="next" className="flip-rtl-prev" />
      </button>
      <button className="play-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {loading && playing ? <Spinner size={26} /> : <Icon name={playing ? 'pause' : 'play'} size={28} className="play-icon" />}
      </button>
      <button className="icon-btn" onClick={onNext} disabled={!canNext} aria-label={t.common.next}>
        <Icon name="next" className="flip-rtl-next" />
      </button>
      <span className="transport-spacer" />
    </div>
  );
}

/** Quran script choice (all fonts are bundled with the app). */
export function QuranFontPicker() {
  const { lang, quranFont, update } = useSettings();
  return (
    <label className="field-inline">
      <span>{lang === 'ar' ? 'خط المصحف' : 'Quran font'}</span>
      <select value={quranFont} onChange={(e) => update({ quranFont: e.target.value })}>
        {QURAN_FONTS.map((f) => <option key={f.id} value={f.id}>{lang === 'ar' ? f.ar : f.en}</option>)}
      </select>
    </label>
  );
}

/** Bigger / smaller Quran text (saved). */
export function TextSize() {
  const { lang, fontScale, update } = useSettings();
  const steps = [0.85, 1, 1.15, 1.3, 1.5, 1.75];
  const i = Math.max(0, steps.findIndex((x) => Math.abs(x - fontScale) < 0.01));
  return (
    <div className="text-size" role="group" aria-label={lang === 'ar' ? 'حجم الخط' : 'Text size'}>
      <button type="button" className="icon-btn" disabled={i <= 0} onClick={() => update({ fontScale: steps[i - 1] })} aria-label={lang === 'ar' ? 'تصغير الخط' : 'Smaller text'}>
        <span className="ts-a ts-small">أ−</span>
      </button>
      <span className="ts-value">{Math.round(fontScale * 100)}%</span>
      <button type="button" className="icon-btn" disabled={i >= steps.length - 1} onClick={() => update({ fontScale: steps[i + 1] })} aria-label={lang === 'ar' ? 'تكبير الخط' : 'Larger text'}>
        <span className="ts-a ts-big">أ+</span>
      </button>
    </div>
  );
}
