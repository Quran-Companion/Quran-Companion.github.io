/**
 * Quran fonts bundled with the app (no internet needed for fonts).
 * - KFGQPC HAFS Uthmanic Script & KFGQPC Uthman Taha Naskh: © King Fahd Glorious Quran Printing
 *   Complex, free to use and redistribute unmodified (see src/assets/fonts/LICENSES.md).
 * - Amiri Quran, Scheherazade New: SIL Open Font License 1.1.
 */
export const QURAN_FONTS = [
  { id: 'hafs', ar: 'خط مصحف المدينة (حفص)', en: 'Madinah Mushaf (KFGQPC Hafs)', family: "'KFGQPC Hafs'" },
  { id: 'uthman-taha', ar: 'خط عثمان طه (نسخ واضح)', en: 'Uthman Taha Naskh', family: "'KFGQPC Uthman Taha'" },
  { id: 'amiri', ar: 'الأميري قرآن', en: 'Amiri Quran', family: "'Amiri Quran'" },
  { id: 'scheherazade', ar: 'شهرزاد', en: 'Scheherazade New', family: "'Scheherazade New'" },
];

const FALLBACK = "'KFGQPC Hafs', 'Amiri Quran', 'Scheherazade New', 'Traditional Arabic', serif";

export function quranFontFamily(id) {
  const f = QURAN_FONTS.find((x) => x.id === id) || QURAN_FONTS[0];
  return `${f.family}, ${FALLBACK}`;
}
