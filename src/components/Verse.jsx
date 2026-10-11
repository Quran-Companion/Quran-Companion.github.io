/**
 * Renders Quranic text exactly as received from the data source.
 * The verse-number ornament is UI chrome, drawn separately from the text.
 */
const toArabicDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

/** Verse-end marker in the mushaf style: ﴿١٢﴾ (ornate parentheses), drawn in the Quran font. */
export function AyahNumber({ n }) {
  return (
    <span className="ayah-num" aria-label={`Verse ${n}`} dir="rtl">
      {'\uFD3F'}{toArabicDigits(n)}{'\uFD3E'}
    </span>
  );
}

export function QuranText({ text, ayah, size = 'md', hidden = false, onReveal, revealLabel }) {
  if (hidden) {
    return (
      <button type="button" className={`quran quran-${size} quran-hidden`} onClick={onReveal} aria-label={revealLabel}>
        <span className="hidden-lines" aria-hidden="true">
          <span /><span /><span />
        </span>
        {revealLabel && <span className="hidden-label">{revealLabel}</span>}
      </button>
    );
  }
  return (
    <p className={`quran quran-${size}`} lang="ar" dir="rtl">
      {text}
      {ayah != null && <> <AyahNumber n={ayah} /></>}
    </p>
  );
}

export { toArabicDigits };
