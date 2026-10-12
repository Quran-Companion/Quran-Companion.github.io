# Quran Companion — رفيق القرآن

A modern, responsive web app for memorizing and reviewing the Holy Quran: listen and repeat verse by verse, hide the text to test yourself, review with self-grading, and track progress across devices.

**Stack:** React 18 · Vite 5 · React Router 6 · Firebase Auth + Firestore · plain CSS (no UI framework).

---

## بالعربي — باختصار

- **فتح التطبيق:** دبل كليك على `index.html` أو `QuranCompanion.html`، الاتنين بيفتحوا نفس التطبيق. لازم يكون فيه إنترنت عشان الآيات والتلاوة.
- **اختيار السورة:** في صفحة الحفظ اكتب اسم السورة (مثلًا: الكهف) أو رقمها، أو اختار "السورة كاملة".
- **القرّاء:** ٣٥ قارئ متقسّمين (مصر / السعودية / أخرى). دوس على "القارئ" واكتب أي جزء من اسم الشيخ (مثلًا: المنشاوي). وفيهم مصحف الحصري المعلّم المناسب جدًا للحفظ.
- **الخط:** خط مصحف المدينة هو الأساسي، وتقدر تغيّره من "خط المصحف" في صفحة السورة أو إعدادات جلسة الحفظ.
- **ردّد مع الشيخ (تلقين):** الشيخ يقرأ الآية، وبعدين انت تقرأها وراه. التطبيق بيتعرّف على كلامك (Speech Recognition) ويقارنه بالآية، **ومش بينتقل للآية اللي بعدها غير لما تقولها صح**. والكلمات بتنوّر وانت بتقولها، ولو الآية مخفية بتظهر كلمة كلمة.
- **سمّع وأنا أصحّحلك (تسميع):** تقرأ من حفظك على طول والنص مخفي، والبرنامج ماشي معاك آية آية من غير ما يوقّفك. الكلمات بتظهر وانت بتقولها، واللي تغلط فيه أو يفوتك (حتى لو نطّيت آية كاملة) بيتعلّم بالأحمر، والآية اللي فاتت بتفضل ظاهرة فوق بعلاماتها. لو نسيت: «اظهر كلمة» (تظهر الكلمة الجاية بالأصفر) أو «اظهر الآية». في الآخر بتظهر كل الآيات بالأخضر والأحمر، وجنب اللي فيها غلط زرار «اسمعها من الشيخ».
  - لو الكلام ناقص هيقولك "حاول تاني"، وفيه زرار "اسمع الشيخ تاني" وزرار "تخطّي".
  - "دقة التسميع" في الإعدادات: سهل ٥٠٪، أو عادي ٧٠٪، أو دقيق ٩٠٪ من حروف الآية.
  - التعرّف على الكلام شغال في Chrome وSafari ومحتاج إنترنت (الصوت بيتبعت لخدمة Google أو Apple عشان يتحوّل لكلام).
  - لو المتصفح مش بيدعمه، زي بعض متصفحات ماسنجر وفيسبوك، هيقولك تفتح الموقع في Chrome أو Safari، ويظهرلك زرار "قرأتها، التالي".
- **سرعة الميك:** الميكروفون بيتجهّز مرة واحدة أول ما تدوس "ابدأ التلقين"، وبعدها أول ما الشيخ يسكت بيبدأ يسمعك على طول (في الاختبار كان بين ١ و٣٥ مللي ثانية). وتقدر تختار من الإعدادات بعد قد إيه من سكوتك ينتقل للآية اللي بعدها: بسرعة، أو عادي، أو أطول.
- **الاختيارات:** كلها في لوحة واحدة (زرار الإعدادات) فيها ٣ أقسام: طريقة الحفظ، والصوت، وشكل الخط.
- **الصوت:** لكل شيخ أساسي فيه مصدر احتياطي، فلو ملف ماشتغلش يتجرب اللي بعده تلقائيًا.
- **تسجيل الدخول بجوجل:**
  1. اعمل مشروع Firebase مجاني، والخطوات مكتوبة جوه صفحة الحساب في التطبيق.
  2. شغّل `start-dev.bat`، أو ارفع الموقع على الإنترنت. جوجل مش بيسمح بتسجيل الدخول والملف مفتوح دبل كليك من الجهاز.
  3. من صفحة الحساب الصق كود `firebaseConfig`.

## النشر على GitHub Pages

- **أسهل طريقة:** ارفع الملفين `index.html` و `QuranCompanion.html` من النسخة دي مكان القديمين في الريبو.
  - `index.html` لو اتفتح على أي موقع، بيفتح `QuranCompanion.html` لوحده.
- **أو:** ارفع محتوى فولدر `github-pages` بس، وفيه `index.html` جاهز، والموقع يفتح على اللينك الأساسي مباشرة.
- **بعد الرفع:**
  - استنى دقيقة لحد ما GitHub يحدّث الموقع، وبعدين اعمل `Ctrl + F5`.
  - لو عايز تسجيل الدخول بجوجل: ضيف دومين الموقع (مثلًا `quran-companion.github.io`) في Firebase من Authentication ← Settings ← Authorized domains.

## Windows — how to open the app

> Double-clicking `index.html` also works now: it automatically opens `QuranCompanion.html`, which sits next to it.

### Option A — open it instantly, no install (standalone file)

1. Unzip the project (right-click the ZIP → **Extract All…**).
2. Open the extracted folder and double-click **`QuranCompanion.html`**. It opens in your default browser (Chrome recommended).

That single file contains the whole app (HTML, CSS and JavaScript). Notes:
- An **internet connection is required** — Quran text and recitations are always loaded live from the authenticated source (nothing is bundled).
- It runs in **guest mode**: progress is saved in that browser on that computer. Sign-in/sync is disabled for files opened from disk (Firebase requires an `http(s)` address); the Account page explains this.
- Page addresses look like `QuranCompanion.html#/quran/112` — that's expected when opening from disk.

### Option B — development version

1. Install **Node.js LTS** (v18 or newer) from <https://nodejs.org> (accept the defaults).
2. Double-click **`start-dev.bat`** in the project folder. The first run installs dependencies (takes a minute), then starts the dev server and opens <http://localhost:5173>.

Or do it manually — in the project folder, click the address bar in File Explorer, type `cmd`, press Enter, then:

```bat
npm install
npm run dev
```

Open the address it prints (normally <http://localhost:5173>). Press `Ctrl+C` in that window to stop.

> If PowerShell says *"running scripts is disabled on this system"*, use **Command Prompt (cmd)** instead, or run `npm.cmd install` / `npm.cmd run dev`.

### Rebuilding the standalone file

After changing the code, double-click **`build-standalone.bat`**, or run:

```bat
npm run build:standalone
copy /Y standalone\index.html QuranCompanion.html
```

### Other commands

```bat
npm run build      :: production build for hosting → dist\
npm run preview    :: serve the production build at http://localhost:4173
```

Without Firebase config the app runs in **guest mode**: everything works and progress is saved in the browser. To enable accounts, copy `.env.example` to `.env.local` and fill it in (see below). When the user later signs in, their guest progress is merged into their account automatically.

## Firebase setup (≈5 minutes)

**Easiest:** open the app → Account page (person icon) → follow the steps shown and paste your `firebaseConfig` snippet. It is saved in that browser; no rebuild needed. For a published site, put the values in `.env.local` instead so every visitor gets them:

1. Create a project at <https://console.firebase.google.com>.
2. **Build → Authentication → Sign-in method:** enable *Email/Password* and *Google*.
3. **Build → Firestore Database:** create a database (production mode).
4. **Firestore → Rules:** paste the contents of `firestore.rules` and publish (each user can only access their own data).
5. **Project settings → Your apps → Web app:** copy the config values into `.env.local`.
6. **Authentication → Settings → Authorized domains:** add your production domain.

### Data model

```
users/{uid}
  memorized:  { "2:255": <ms timestamp>, ... }   // verse key → when memorized
  reviewedAt: { "2:255": <ms>, ... }             // last review per verse (drives "Today's Review")
  daily:      { "2026-10-11": 12, ... }          // verses memorized per day
  last:       { surah, from, to, ayah, at }      // resume position
users/{uid}/reviews/{id}
  { at, scope, total, good, hard, again, durationSec, weak: ["2:255", ...] }
```

Firestore offline persistence is enabled, so progress saves without a connection and syncs when back online; live listeners keep every signed-in device in sync.

## Quran content — source & integrity

- **Text:** `quran-uthmani` edition from the [AlQuran Cloud API](https://alquran.cloud/api), which serves the **Tanzil.net** verified Uthmani text.
- **Audio:** one MP3 per verse from [EveryAyah.com](https://everyayah.com) (`https://everyayah.com/data/<reciter folder>/<SSSAAA>.mp3`), so a single verse can be repeated. 35 reciters — 12 from Egypt (Al-Husary incl. the teaching *Muallim* version, Al-Minshawi, Abdul Basit, Mustafa Ismail, Al-Tablawi, Al-Banna, Jibreel, Neana…), 20 from Saudi Arabia (As-Sudais, Ash-Shuraym, Al-Muaiqly, Ad-Dossari, Al-Juhany, Al-Ghamdi, Al-Hudhaify, Ash-Shatri, Al-Ajamy…) and 3 others. Folder names come from EveryAyah's own list; edit `src/lib/reciters.js` to add more. Where EveryAyah has a second bitrate of the same reciter it is used as an automatic fallback.
- **Fonts (bundled, work offline):** KFGQPC HAFS Uthmanic Script (Madinah Mushaf, default) and KFGQPC Uthman Taha Naskh from the King Fahd Complex, plus Amiri Quran and Scheherazade New; the reader can switch fonts. Licences: `src/assets/fonts/LICENSES.md`.
- **No Quranic text is stored or hardcoded in this codebase.** Every verse is fetched at runtime and rendered exactly as received; `src/lib/quranApi.js` is the only module that touches verse text and never alters it. (Arabic normalization there is only used to match surah *names* in the search box, never for display.)
- Verse search uses the API's search on the `quran-simple-clean` edition, and shows that edition's text in results.
- Note: in the Uthmani edition the Basmala is part of the first verse of each surah (except Al-Fatiha, where it is verse 1, and At-Tawbah). It is displayed as provided by the source.

For an offline/self-hosted setup, you can replace the API base URL with your own mirror of the Tanzil data — the rest of the app is unchanged.

## Features

| Page | Route | Highlights |
|---|---|---|
| Home | `/` | Hero, Start / Continue buttons, progress ring, streak, *Today's Review*, *Recently Memorized* |
| Quran | `/quran` | All 114 surahs, filter (Meccan/Medinan/started), diacritic-insensitive name search, verse search, `2:255` jump |
| Reader | `/quran/:n` | Elegant verse layout, play surah / single verse, repeat count, hide-all with tap-to-reveal, mark memorized, select a range → memorize |
| Memorize | `/memorize`, `/memorize/session` | Distraction-free focus mode, large text, repeat verse (1–20×/∞), repeat range, auto-advance, hide/peek, mark memorized, auto-saved position, keyboard shortcuts |
| Review | `/review` | Review all memorized / surah / juz / range, shuffle, count, reveal + self-grade (Forgot / Hesitated / Nailed it), session summary with weak verses |
| Progress | `/dashboard` | Overall %, verses & surahs, streak, last position, 14-day chart, per-surah bars, review history |
| Account | `/account` | Email/password, Google, password reset, sync status |

Also: Arabic (RTL) and English (LTR) UI, dark mode (follows system by default), adjustable Quran text size, playback speed, lock-screen media controls, skeleton/empty/error states, route-level code splitting, reduced-motion support.

**Memorization shortcuts:** `Space` play/pause · `←/→` previous/next verse · `H` hide/show text · `M` mark memorized. In review: `Space` reveal, `1/2/3` to grade.

## Project structure

```
src/
  App.jsx                 routes, providers, error boundary
  main.jsx
  lib/
    quranApi.js           Quran text & audio (the only source of verse text)
    firebase.js           Firebase init (guest mode when unconfigured)
    progressStore.js      local + Firestore adapters, guest→account merge
  context/
    SettingsContext.jsx   language/RTL, theme, reciter, speed, font size
    AuthContext.jsx       Firebase Auth
    ProgressContext.jsx   progress state, actions, derived stats
  hooks/
    useRecitation.js      verse-by-verse player (repeat, range repeat, auto-advance)
    useAsync.js           loading / error / retry helper
  components/             Layout, AudioControls, Verse, ProgressRing, States, Icon, SurahRangePicker
  pages/                  Home, QuranIndex, SurahReader, MemorizeSetup, MemorizeSession, Review, Dashboard, Account
  i18n/strings.js         Arabic & English UI strings
  styles/global.css       design tokens (light/dark), logical properties for RTL/LTR
```

## Deploying

Any static host works. Configure SPA fallback so all routes serve `index.html`:

- **Firebase Hosting:** `firebase init hosting` → public dir `dist`, "single-page app" = yes → `npm run build && firebase deploy`.
- **Netlify:** add `public/_redirects` with `/* /index.html 200`.
- **Vercel:** works out of the box with the Vite preset.

## Ideas for next steps

- Spaced-repetition scheduling (the review grades are already stored per session).
- Word-by-word highlighting with timing data.
- Translations/tafsir panels from additional API editions.
- PWA install + offline audio caching.

## Fixes in this version

| Problem | Cause | Fix |
|---|---|---|
| Blank white page when opening `index.html` from disk | `index.html` is Vite's source entry; it loads `/src/main.jsx`, which a browser cannot run from `file:///` | Added a single-file build (`npm run build:standalone` → `QuranCompanion.html`) that runs from disk. The source `index.html` now shows instructions instead of a blank page if it can't start |
| Links/refresh broken when opened from disk | Browser-history routing needs a server | Hash routing is used automatically on `file://` (`#/quran/112`); normal URLs everywhere else |
| Memorize, Review and Progress pages could spin forever if the Quran API was unreachable | The surah-list error was swallowed | The error is now shown with its technical reason and a **Try again** button |
| API errors showed only a generic message | — | Error panels now include the underlying reason (e.g. `http_503`); unexpected crashes show the error message instead of failing silently |
| Firebase sign-in would fail confusingly from a local file | Firebase Auth requires an `http(s)` origin | On `file://` the app uses guest mode and the Account page says why |

## Testing performed

Automated end-to-end tests (`tests/e2e.mjs`) were run in **headless Chrome 131** against all three ways of running the app: the standalone `QuranCompanion.html` opened via `file:///`, the dev server (`npm run dev`), and the production build (`npm run build` + `npm run preview`). Latest results: **57/57** on the dev server and the production build, **55/55** on the standalone file (the 2 Firebase-setup checks only apply over http), and **11/11** for the API-failure scenario in all three modes. Also verified: opening the source `index.html` from disk shows the instructions page, and a clean `npm install` → `npm run build` → `npm run build:standalone` in a fresh copy succeeds.

What the checks cover: app renders (no blank page); Arabic RTL default and English LTR switch (persisted); theme toggle (persisted, colors applied); client-side navigation and deep links including `#aN` verse anchors; 404 route; surah list, surah search and verse search; reader shows verses exactly as returned by the API; hide-all / tap-to-reveal; mark memorized → saved in guest progress; memorization session (audio plays, repeats, auto-advances; hide/show; mark memorized; position auto-saved; focus mode); Home stats/continue/recent; review flow (reveal, grade, summary saved); juz review; dashboard history; Account guest notice; mobile layout (bottom nav, no horizontal scroll); no unexpected console errors. Failure run: API returns HTTP 503 → every page shows an error with the reason and a retry button, no endless spinners, and no verse text is shown.

**Limits of that testing (please check these yourself):**
- The test environment could not reach `api.alquran.cloud` or `everyayah.com`. API requests were intercepted and answered in the API's JSON format with **authentic Tanzil Uthmani text** taken from the `quran` npm package's database (test-only, not shipped), and audio requests with a short silent clip. The tests confirm the right EveryAyah URLs are requested, but the real audio files were not downloaded from here (the URL pattern and folder names were checked against EveryAyah's website).
- Fonts are bundled and were verified to load and render real Quran text.
- Google sign-in itself was not tested end-to-end (no real Firebase project; Google's servers are unreachable from the test environment). Tested: pasting a Firebase config enables the Google sign-in button without breaking the app, and opening from disk explains why sign-in needs localhost or a website.
- Tests ran in Chrome on Linux, not on Windows. The standalone file is plain HTML/JS, so behaviour should be the same in Chrome on Windows.

`tests/talqeen.mjs` checks the repeat-after-the-sheikh mode with Chrome's fake microphone fed from `tests/fake-voice.wav` (silence → voice → silence): **15/15** in all three modes (voice detected, moves to the next verse, manual button, blocked-mic fallback, celebration, mic listening < 120 ms after the sheikh's audio ends — measured 1–35 ms — and no page freezes > 100 ms while memorizing).

`tests/e2e.mjs` uses `puppeteer-core` with `@sparticuz/chromium` (Linux only) and expects `tests/tanzil-fixture.json` (generate it from the `quran` npm package's `data/qurandb` SQLite file — not included here so the repository contains no Quran text): `node tests/e2e.mjs file file:///path/to/QuranCompanion.html` or `node tests/e2e.mjs http http://localhost:5173` (add `--api-fail` for the failure scenario).
