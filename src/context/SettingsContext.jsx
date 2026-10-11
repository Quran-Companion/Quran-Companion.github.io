import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { strings } from '../i18n/strings';
import { DEFAULT_RECITER, resolveReciter } from '../lib/reciters';
import { quranFontFamily } from '../lib/fonts';

const KEY = 'qc:settings';
const defaults = {
  theme: null, // null = follow system
  lang: 'ar',
  reciter: DEFAULT_RECITER,
  quranFont: 'hafs',
  speed: 1,
  fontScale: 1.15,
  // memorization
  memMode: 'listen', // 'listen' = listen & repeat | 'talqeen' = the sheikh recites, you repeat after him
  repeatVerse: 3,
  repeatRange: 1,
  autoNext: true,
  hideOnTurn: false, // talqeen: hide the verse while it's your turn
  turnWait: 'normal', // talqeen: how long a pause ends your turn (fast | normal | slow)
};

const SettingsContext = createContext(null);

// One cached formatter per language (creating Intl.NumberFormat on every call is slow).
const formatters = {};
const numberFormatter = (lang) => (formatters[lang] ||= new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US'));

function systemDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
      saved.reciter = resolveReciter(saved.reciter).id; // migrate ids from older versions
      return saved;
    } catch {
      return defaults;
    }
  });

  const update = useCallback((patch) => setSettings((s) => ({ ...s, ...patch })), []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }, [settings]);

  const resolvedTheme = settings.theme || (systemDark() ? 'dark' : 'light');

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.lang = settings.lang;
    root.dir = settings.lang === 'ar' ? 'rtl' : 'ltr';
    root.style.setProperty('--quran-scale', settings.fontScale);
    root.style.setProperty('--font-quran', quranFontFamily(settings.quranFont));
  }, [resolvedTheme, settings.lang, settings.fontScale, settings.quranFont]);

  // Follow OS theme changes when the user hasn't chosen one.
  useEffect(() => {
    if (settings.theme) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => (document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [settings.theme]);

  const value = useMemo(
    () => ({
      ...settings,
      theme: resolvedTheme,
      t: strings[settings.lang],
      isRTL: settings.lang === 'ar',
      update,
      toggleTheme: () => update({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' }),
      toggleLang: () => update({ lang: settings.lang === 'ar' ? 'en' : 'ar' }),
      numberFmt: (n) => numberFormatter(settings.lang).format(n),
    }),
    [settings, resolvedTheme, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
