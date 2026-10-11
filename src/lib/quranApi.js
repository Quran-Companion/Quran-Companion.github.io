/**
 * Quran data layer.
 *
 * All Quranic text comes verbatim from the AlQuran Cloud API (api.alquran.cloud),
 * edition "quran-uthmani" — the Tanzil.net verified Uthmani script.
 * Recitation audio (verse by verse) is attached separately — see reciters.js.
 *
 * This module never creates, edits or reformats verse text. It only fetches,
 * caches and passes the text through unchanged.
 */

const API = 'https://api.alquran.cloud/v1';
export const TEXT_EDITION = 'quran-uthmani';
export const TEXT_SOURCE = { name: 'Tanzil Uthmani via AlQuran Cloud', url: 'https://alquran.cloud' };

export { RECITERS } from './reciters';

export const TOTAL_AYAHS = 6236;
export const TOTAL_SURAHS = 114;

// ---------- caching ----------
const memory = new Map();
const META_KEY = 'qc:surah-meta:v1';

async function getJSON(url, { signal } = {}) {
  let res;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('network');
  }
  if (!res.ok) throw new Error(`http_${res.status}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error('bad_response');
  return json.data;
}

function cached(key, loader) {
  if (memory.has(key)) return memory.get(key);
  const p = loader().catch((e) => {
    memory.delete(key); // allow retry after failures
    throw e;
  });
  memory.set(key, p);
  return p;
}

// ---------- surah list ----------
export function getSurahList() {
  return cached('meta', async () => {
    try {
      const saved = JSON.parse(localStorage.getItem(META_KEY) || 'null');
      if (Array.isArray(saved) && saved.length === TOTAL_SURAHS) return saved;
    } catch { /* ignore */ }
    const data = await getJSON(`${API}/surah`);
    const list = data.map((s) => ({
      number: s.number,
      name: s.name, // Arabic name, from the API
      englishName: s.englishName,
      translation: s.englishNameTranslation,
      ayahs: s.numberOfAyahs,
      type: s.revelationType,
    }));
    try { localStorage.setItem(META_KEY, JSON.stringify(list)); } catch { /* quota */ }
    return list;
  });
}

// ---------- verses ----------
/** Convert API ayahs into verse objects. Text is copied as-is. */
function toVerses(textAyahs, surahFallback, nameFallback) {
  return textAyahs.map((a) => {
    const surah = a.surah?.number ?? surahFallback;
    return {
      key: `${surah}:${a.numberInSurah}`,
      surah,
      surahName: a.surah?.name ?? nameFallback,
      ayah: a.numberInSurah,
      global: a.number,
      text: a.text, // verbatim from the source
      juz: a.juz,
      page: a.page,
      sajda: Boolean(a.sajda),
    };
  });
}

/** All verses of a surah (text only; audio is added per reciter by the player). */
export function getSurah(number) {
  return cached(`surah:${number}`, async () => {
    const text = await getJSON(`${API}/surah/${number}/${TEXT_EDITION}`);
    return {
      number: text.number,
      name: text.name,
      englishName: text.englishName,
      translation: text.englishNameTranslation,
      type: text.revelationType,
      verses: toVerses(text.ayahs, text.number, text.name),
    };
  });
}

/** All verses of a juz (1–30). */
export function getJuz(number) {
  return cached(`juz:${number}`, async () => {
    const text = await getJSON(`${API}/juz/${number}/${TEXT_EDITION}`);
    return toVerses(text.ayahs);
  });
}

/** Verses for a list of verse keys ("2:255"), grouped by surah to minimise requests. */
export async function getVersesByKeys(keys) {
  const bySurah = new Map();
  for (const k of keys) {
    const [s] = k.split(':').map(Number);
    if (!bySurah.has(s)) bySurah.set(s, []);
    bySurah.get(s).push(k);
  }
  const surahs = await Promise.all([...bySurah.keys()].map((s) => getSurah(s)));
  const wanted = new Set(keys);
  return surahs.flatMap((s) => s.verses.filter((v) => wanted.has(v.key)));
}

/** Full-text search in the Arabic Quran (matched against the simple-clean text, results shown in Uthmani). */
export async function searchQuran(query, { signal } = {}) {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const data = await getJSON(`${API}/search/${encodeURIComponent(q)}/all/quran-simple-clean`, { signal });
    return (data.matches || []).slice(0, 50).map((m) => ({
      key: `${m.surah.number}:${m.numberInSurah}`,
      surah: m.surah.number,
      surahName: m.surah.name,
      ayah: m.numberInSurah,
      text: m.text,
    }));
  } catch (e) {
    if (e.message === 'http_404') return []; // the API answers 404 when nothing matches
    throw e;
  }
}

/** Remove Arabic diacritics for loose matching of surah names in local filtering (never for display). */
export function normalizeArabic(s = '') {
  return s
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

export const JUZ_LIST = Array.from({ length: 30 }, (_, i) => i + 1);
