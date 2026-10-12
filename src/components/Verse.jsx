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

/**
 * marks: optional array (one entry per word) — words already recited are highlighted.
 *        An entry can also be 'bad' (said wrong / skipped — shown in red) or 'hint' (revealed as a reminder).
 * mask:  with marks, words not yet recited are covered (they appear as you say them).
 * The text is split on spaces only for styling; every character is rendered as received.
 */
export function QuranText({ text, ayah, size = 'md', hidden = false, onReveal, revealLabel, marks, mask = false }) {
  if (marks) {
    let w = -1;
    return (
      <p className={`quran quran-${size} quran-marked ${mask ? 'is-masked' : ''}`} lang="ar" dir="rtl">
        {text.split(/(\s+)/).map((tok, i) => {
          if (!tok.trim()) return tok;
          w++;
          const m = marks[w];
          return <span key={i} className={m === 'bad' ? 'w-bad' : m === 'hint' ? 'w-hint' : m ? 'w-ok' : 'w-todo'}>{tok}</span>;
        })}
        {ayah != null && <> <AyahNumber n={ayah} /></>}
      </p>
    );
  }
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
