/**
 * Reciters with verse-by-verse audio (needed for repeating a single verse while memorizing).
 *
 * Audio files come from EveryAyah.com (one MP3 per verse):
 *   https://everyayah.com/data/<folder>/<SSS><AAA>.mp3   e.g. 002255.mp3 = Al-Baqarah 255
 * Folder names below were taken from EveryAyah's own reciter list (data/recitations.js).
 * If a file fails, the player tries the backups in order:
 *   `cdn`      — the same reciter on the Islamic Network CDN used by AlQuran Cloud
 *                (URL pattern verified through the AlQuran Cloud API: /quran/audio/<bitrate>/<edition>/<global ayah>.mp3)
 *   `fallback` — another EveryAyah folder of the same reciter (another bitrate).
 */
const EA = 'https://everyayah.com/data';

export const COUNTRIES = [
  { id: 'eg', ar: 'قرّاء مصر', en: 'Egypt' },
  { id: 'sa', ar: 'قرّاء السعودية', en: 'Saudi Arabia' },
  { id: 'other', ar: 'قرّاء آخرون', en: 'Other' },
];

export const RECITERS = [
  // ---------- Egypt ----------
  { id: 'husary', country: 'eg', ar: 'محمود خليل الحصري', en: 'Mahmoud Khalil Al-Husary', style: 'murattal', folder: 'Husary_128kbps', fallback: 'Husary_64kbps' , cdn: '128/ar.husary' },
  { id: 'husary-muallim', country: 'eg', ar: 'محمود خليل الحصري', en: 'Mahmoud Khalil Al-Husary', style: 'muallim', folder: 'Husary_Muallim_128kbps' },
  { id: 'husary-mujawwad', country: 'eg', ar: 'محمود خليل الحصري', en: 'Mahmoud Khalil Al-Husary', style: 'mujawwad', folder: 'Husary_128kbps_Mujawwad', fallback: 'Husary_Mujawwad_64kbps' , cdn: '128/ar.husarymujawwad' },
  { id: 'minshawi', country: 'eg', ar: 'محمد صديق المنشاوي', en: 'Muhammad Siddiq Al-Minshawi', style: 'murattal', folder: 'Minshawy_Murattal_128kbps', fallback: 'Menshawi_32kbps' , cdn: '128/ar.minshawi' },
  { id: 'minshawi-mujawwad', country: 'eg', ar: 'محمد صديق المنشاوي', en: 'Muhammad Siddiq Al-Minshawi', style: 'mujawwad', folder: 'Minshawy_Mujawwad_192kbps', fallback: 'Minshawy_Mujawwad_64kbps' , cdn: '64/ar.minshawimujawwad' },
  { id: 'abdulbasit', country: 'eg', ar: 'عبد الباسط عبد الصمد', en: 'Abdul Basit Abdus-Samad', style: 'murattal', folder: 'Abdul_Basit_Murattal_192kbps', fallback: 'Abdul_Basit_Murattal_64kbps' , cdn: '192/ar.abdulbasitmurattal' },
  { id: 'abdulbasit-mujawwad', country: 'eg', ar: 'عبد الباسط عبد الصمد', en: 'Abdul Basit Abdus-Samad', style: 'mujawwad', folder: 'Abdul_Basit_Mujawwad_128kbps' },
  { id: 'mustafa-ismail', country: 'eg', ar: 'مصطفى إسماعيل', en: 'Mustafa Ismail', folder: 'Mustafa_Ismail_48kbps' },
  { id: 'tablawi', country: 'eg', ar: 'محمد محمود الطبلاوي', en: 'Mohammad Al-Tablawi', folder: 'Mohammad_al_Tablaway_128kbps', fallback: 'Mohammad_al_Tablaway_64kbps' },
  { id: 'banna', country: 'eg', ar: 'محمود علي البنا', en: 'Mahmoud Ali Al-Banna', folder: 'mahmoud_ali_al_banna_32kbps' },
  { id: 'jibreel', country: 'eg', ar: 'محمد جبريل', en: 'Muhammad Jibreel', folder: 'Muhammad_Jibreel_128kbps', fallback: 'Muhammad_Jibreel_64kbps' , cdn: '128/ar.muhammadjibreel' },
  { id: 'neana', country: 'eg', ar: 'أحمد نعينع', en: 'Ahmed Neana', folder: 'Ahmed_Neana_128kbps' },

  // ---------- Saudi Arabia ----------
  { id: 'sudais', country: 'sa', ar: 'عبد الرحمن السديس', en: 'Abdur-Rahman As-Sudais', folder: 'Abdurrahmaan_As-Sudais_192kbps', fallback: 'Abdurrahmaan_As-Sudais_64kbps' , cdn: '192/ar.abdurrahmaansudais' },
  { id: 'shuraym', country: 'sa', ar: 'سعود الشريم', en: "Sa'ud Ash-Shuraym", folder: 'Saood_ash-Shuraym_128kbps', fallback: 'Saood_ash-Shuraym_64kbps' , cdn: '64/ar.saoodshuraym' },
  { id: 'maher', country: 'sa', ar: 'ماهر المعيقلي', en: 'Maher Al-Muaiqly', folder: 'MaherAlMuaiqly128kbps', fallback: 'Maher_AlMuaiqly_64kbps' , cdn: '128/ar.mahermuaiqly' },
  { id: 'dossari', country: 'sa', ar: 'ياسر الدوسري', en: 'Yasser Ad-Dossari', folder: 'Yasser_Ad-Dussary_128kbps' },
  { id: 'juhany', country: 'sa', ar: 'عبد الله عواد الجهني', en: 'Abdullah Awad Al-Juhany', folder: 'Abdullaah_3awwaad_Al-Juhaynee_128kbps' },
  { id: 'ghamdi', country: 'sa', ar: 'سعد الغامدي', en: "Sa'd Al-Ghamdi", folder: 'Ghamadi_40kbps' },
  { id: 'hudhaify', country: 'sa', ar: 'علي بن عبد الرحمن الحذيفي', en: 'Ali Al-Hudhaify', folder: 'Hudhaify_128kbps', fallback: 'Hudhaify_64kbps' , cdn: '128/ar.hudhaify' },
  { id: 'shaatree', country: 'sa', ar: 'أبو بكر الشاطري', en: 'Abu Bakr Ash-Shatri', folder: 'Abu_Bakr_Ash-Shaatree_128kbps', fallback: 'Abu_Bakr_Ash-Shaatree_64kbps' , cdn: '128/ar.shaatree' },
  { id: 'ajamy', country: 'sa', ar: 'أحمد بن علي العجمي', en: 'Ahmed Al-Ajamy', folder: 'ahmed_ibn_ali_al_ajamy_128kbps', fallback: 'Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net' , cdn: '128/ar.ahmedajamy' },
  { id: 'qahtani', country: 'sa', ar: 'خالد القحطاني', en: 'Khalid Al-Qahtani', folder: 'Khaalid_Abdullaah_al-Qahtaanee_192kbps' },
  { id: 'qatami', country: 'sa', ar: 'ناصر القطامي', en: 'Nasser Al-Qatami', folder: 'Nasser_Alqatami_128kbps' },
  { id: 'budair', country: 'sa', ar: 'صلاح البدير', en: 'Salah Al-Budair', folder: 'Salah_Al_Budair_128kbps' },
  { id: 'basfar', country: 'sa', ar: 'عبد الله بصفر', en: 'Abdullah Basfar', folder: 'Abdullah_Basfar_192kbps', fallback: 'Abdullah_Basfar_64kbps' , cdn: '192/ar.abdullahbasfar' },
  { id: 'ayyoub', country: 'sa', ar: 'محمد أيوب', en: 'Muhammad Ayyoub', folder: 'Muhammad_Ayyoub_128kbps', fallback: 'Muhammad_Ayyoub_64kbps' , cdn: '128/ar.muhammadayyoub' },
  { id: 'akhdar', country: 'sa', ar: 'إبراهيم الأخضر', en: 'Ibrahim Al-Akhdar', folder: 'Ibrahim_Akhdar_64kbps', fallback: 'Ibrahim_Akhdar_32kbps' , cdn: '32/ar.ibrahimakhbar' },
  { id: 'rifai', country: 'sa', ar: 'هاني الرفاعي', en: 'Hani Ar-Rifai', folder: 'Hani_Rifai_192kbps', fallback: 'Hani_Rifai_64kbps' , cdn: '192/ar.hanirifai' },
  { id: 'qasim', country: 'sa', ar: 'محسن القاسم', en: 'Muhsin Al-Qasim', folder: 'Muhsin_Al_Qasim_192kbps' },
  { id: 'matroud', country: 'sa', ar: 'عبد الله المطرود', en: 'Abdullah Al-Matroud', folder: 'Abdullah_Matroud_128kbps' },
  { id: 'alijaber', country: 'sa', ar: 'علي جابر', en: 'Ali Jaber', folder: 'Ali_Jaber_64kbps' },
  { id: 'fares', country: 'sa', ar: 'فارس عباد', en: 'Fares Abbad', folder: 'Fares_Abbad_64kbps' },

  // ---------- Other ----------
  { id: 'alafasy', country: 'other', ar: 'مشاري راشد العفاسي (الكويت)', en: 'Mishary Alafasy (Kuwait)', folder: 'Alafasy_128kbps', fallback: 'Alafasy_64kbps' , cdn: '128/ar.alafasy' },
  { id: 'bukhatir', country: 'other', ar: 'صلاح بو خاطر (الإمارات)', en: 'Salah Bukhatir (UAE)', folder: 'Salaah_AbdulRahman_Bukhatir_128kbps' },
  { id: 'suwaid', country: 'other', ar: 'أيمن سويد (سوريا)', en: 'Ayman Suwaid (Syria)', folder: 'Ayman_Sowaid_64kbps' , cdn: '64/ar.aymanswoaid' },
];

export const STYLES = {
  murattal: { ar: 'مرتل', en: 'Murattal' },
  mujawwad: { ar: 'مجوّد', en: 'Mujawwad' },
  muallim: { ar: 'المعلّم — للحفظ', en: 'Teaching (for memorizing)' },
};

/** Display name including the recitation style. */
export function reciterLabel(r, lang = 'ar') {
  const name = lang === 'ar' ? r.ar : r.en;
  return r.style ? `${name} (${STYLES[r.style][lang === 'ar' ? 'ar' : 'en']})` : name;
}

export const DEFAULT_RECITER = 'husary';

// Settings saved by earlier versions used AlQuran Cloud edition ids.
const LEGACY = {
  'ar.alafasy': 'alafasy', 'ar.husary': 'husary', 'ar.minshawi': 'minshawi',
  'ar.abdulbasitmurattal': 'abdulbasit', 'ar.mahermuaiqly': 'maher',
};

export function resolveReciter(id) {
  const fixed = LEGACY[id] || id;
  return RECITERS.find((r) => r.id === fixed) || RECITERS.find((r) => r.id === DEFAULT_RECITER);
}

const pad = (n) => String(n).padStart(3, '0');

const CDN = 'https://cdn.islamic.network/quran/audio';

/** Primary MP3 URL plus backups for one verse. `global` = verse number across the whole Quran (1–6236). */
export function verseAudio(reciterId, surah, ayah, global) {
  const r = resolveReciter(reciterId);
  const file = `${pad(surah)}${pad(ayah)}.mp3`;
  const alts = [];
  if (r.cdn && global) alts.push(`${CDN}/${r.cdn}/${global}.mp3`);
  if (r.fallback) alts.push(`${EA}/${r.fallback}/${file}`);
  const out = { audio: `${EA}/${r.folder}/${file}`, audioAlts: alts };
  // Verse-by-verse files start AFTER the Basmala. Before verse 1 of every surah except
  // Al-Fatiha (where the Basmala is verse 1 itself) and At-Tawbah (which has none), play the
  // same reciter's Basmala — his recitation of 1:1.
  if (ayah === 1 && surah !== 1 && surah !== 9) {
    out.intro = `${EA}/${r.folder}/001001.mp3`;
    out.introAlts = [r.cdn ? `${CDN}/${r.cdn}/1.mp3` : null, r.fallback ? `${EA}/${r.fallback}/001001.mp3` : null].filter(Boolean);
  }
  return out;
}

/** Attach audio URLs for a reciter to verse objects (returns new objects; text untouched). */
export function withAudio(verses, reciterId) {
  return verses.map((v) => ({ ...v, ...verseAudio(reciterId, v.surah, v.ayah, v.global) }));
}
