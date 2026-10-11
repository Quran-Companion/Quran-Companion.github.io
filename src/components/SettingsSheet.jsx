import { useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import ReciterPicker from './ReciterPicker';
import { QURAN_FONTS } from '../lib/fonts';
import Icon from './Icon';
import { TextSize } from './AudioControls';

export const LOOP = 999; // "∞" (kept as a number so it can be saved)
const VERSE_REPEATS = [1, 2, 3, 5, 10, LOOP];
const RANGE_REPEATS = [1, 2, 3, 5];
const SPEEDS = [0.75, 1, 1.25, 1.5];
const fmt = (n) => (n === LOOP ? '∞' : `${n}×`);

function Pills({ value, options, onChange, format = (x) => x }) {
  return (
    <div className="pills">
      {options.map((o) => (
        <button key={o} type="button" className={value === o ? 'is-active' : ''} onClick={() => onChange(o)}>{format(o)}</button>
      ))}
    </div>
  );
}

/** Memorization mode as two clear cards. */
export function ModeChooser() {
  const { lang, memMode, update } = useSettings();
  const ar = lang === 'ar';
  const modes = [
    { id: 'listen', icon: 'repeat', title: ar ? 'استماع وتكرار' : 'Listen & repeat', desc: ar ? 'الشيخ يكرر الآية وأنت تسمع وتحفظ' : 'The sheikh repeats each verse while you listen' },
    { id: 'talqeen', icon: 'mic', title: ar ? 'ردّد مع الشيخ' : 'Repeat after the sheikh', desc: ar ? 'الشيخ يقرأ، ثم يُفتح الميك فتقرأ وراءه، ثم ينتقل للآية التالية' : 'He recites, the mic opens, you repeat, then the next verse plays' },
  ];
  return (
    <div className="mode-cards" role="radiogroup">
      {modes.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={memMode === m.id} className={`mode-card ${memMode === m.id ? 'is-active' : ''}`} onClick={() => update({ memMode: m.id })} data-mode={m.id}>
          <span className="mode-icon"><Icon name={m.icon} size={22} /></span>
          <strong>{m.title}</strong>
          <span className="muted small">{m.desc}</span>
          <span className="mode-check"><Icon name="check" size={16} /></span>
        </button>
      ))}
    </div>
  );
}

/**
 * All options in one organised panel: Sound · Memorization · Display.
 * `sections` chooses which groups to show on a given page.
 */
export default function SettingsSheet({ open, onClose, sections = ['audio', 'memorize', 'display'] }) {
  const s = useSettings();
  const ar = s.lang === 'ar';

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet settings-sheet" role="dialog" aria-modal="true" aria-label={ar ? 'الإعدادات' : 'Settings'}>
        <div className="sheet-head">
          <strong>{ar ? 'الإعدادات' : 'Settings'}</strong>
          <button className="icon-btn" onClick={onClose} aria-label={s.t.common.close}><Icon name="close" /></button>
        </div>
        <div className="sheet-body settings-body">
          {sections.includes('memorize') && (
            <section className="set-section">
              <h3><Icon name="brain" size={18} /> {ar ? 'طريقة الحفظ' : 'How to memorize'}</h3>
              <ModeChooser />
              {s.memMode === 'listen' ? (
                <>
                  <div className="set-row">
                    <span>{ar ? 'تكرار كل آية' : 'Repeat each verse'}</span>
                    <Pills value={s.repeatVerse} options={VERSE_REPEATS} onChange={(v) => s.update({ repeatVerse: v })} format={fmt} />
                  </div>
                  <div className="set-row">
                    <span>{ar ? 'تكرار المقطع كله' : 'Repeat the whole range'}</span>
                    <Pills value={s.repeatRange} options={RANGE_REPEATS} onChange={(v) => s.update({ repeatRange: v })} format={fmt} />
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={s.autoNext} onChange={(e) => s.update({ autoNext: e.target.checked })} />
                    <span className="switch-track" /> {ar ? 'الانتقال للآية التالية تلقائيًا' : 'Go to the next verse automatically'}
                  </label>
                </>
              ) : (
                <>
                <div className="set-row">
                  <span>{ar ? 'ينتقل للآية التالية بعد ما أسكت' : 'Next verse after I pause for'}</span>
                  <Pills
                    value={s.turnWait}
                    options={['fast', 'normal', 'slow']}
                    onChange={(v) => s.update({ turnWait: v })}
                    format={(v) => ({ fast: ar ? 'بسرعة' : 'Short', normal: ar ? 'عادي' : 'Normal', slow: ar ? 'أطول' : 'Longer' })[v]}
                  />
                </div>
                <label className="switch">
                  <input type="checkbox" checked={s.hideOnTurn} onChange={(e) => s.update({ hideOnTurn: e.target.checked })} />
                  <span className="switch-track" /> {ar ? 'إخفاء الآية وقت دوري (اختبار نفسي)' : 'Hide the verse on my turn (test myself)'}
                </label>
                </>
              )}
            </section>
          )}

          {sections.includes('audio') && (
            <section className="set-section">
              <h3><Icon name="play" size={16} /> {ar ? 'الصوت' : 'Sound'}</h3>
              <ReciterPicker />
              <div className="set-row">
                <span>{s.t.common.speed}</span>
                <Pills value={s.speed} options={SPEEDS} onChange={(v) => s.update({ speed: v })} format={(x) => `${x}×`} />
              </div>
            </section>
          )}

          {sections.includes('display') && (
            <section className="set-section">
              <h3><Icon name="book" size={18} /> {ar ? 'شكل الخط' : 'Text'}</h3>
              <div className="font-cards">
                {QURAN_FONTS.map((f) => (
                  <button key={f.id} type="button" className={`font-card ${s.quranFont === f.id ? 'is-active' : ''}`} onClick={() => s.update({ quranFont: f.id })} data-font={f.id}>
                    <span className="font-sample" style={{ fontFamily: f.family }} lang="ar">القرآن الكريم</span>
                    <span className="small">{ar ? f.ar : f.en}</span>
                  </button>
                ))}
              </div>
              <div className="set-row">
                <span>{ar ? 'حجم الخط' : 'Text size'}</span>
                <TextSize />
              </div>
            </section>
          )}
        </div>
        <div className="sheet-foot">
          <button className="btn btn-primary btn-block" onClick={onClose}>{ar ? 'تم' : 'Done'}</button>
        </div>
      </div>
    </div>
  );
}
