import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import { useProgress } from '../context/ProgressContext';
import { getSurah } from '../lib/quranApi';
import { useAsync } from '../hooks/useAsync';
import { useRecitation } from '../hooks/useRecitation';
import { useVoiceTurn } from '../hooks/useVoiceTurn';
import { ErrorState, VerseSkeleton } from '../components/States';
import { QuranText, toArabicDigits } from '../components/Verse';
import { Transport } from '../components/AudioControls';
import SettingsSheet, { LOOP } from '../components/SettingsSheet';
import { ProgressBar } from '../components/ProgressRing';
import { resolveReciter } from '../lib/reciters';
import Icon from '../components/Icon';

export default function MemorizeSession() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const S = useSettings();
  const { t, lang, reciter, speed, numberFmt, memMode, repeatVerse, repeatRange, autoNext, hideOnTurn, turnWait } = S;
  const ar = lang === 'ar';
  const talqeen = memMode === 'talqeen';
  const { memorized, setMemorized, toggleMemorized, saveLastPosition } = useProgress();

  const surahN = clamp(Number(params.get('surah')) || 1, 1, 114);
  const { data: surah, loading, error, retry } = useAsync(() => getSurah(surahN), [surahN]);

  const total = surah?.verses.length || 0;
  const from = clamp(Number(params.get('from')) || 1, 1, total || 1);
  const to = clamp(Number(params.get('to')) || total, from, total || from);
  const verses = useMemo(() => surah?.verses.slice(from - 1, to) || [], [surah, from, to]);

  const startAt = clamp((Number(params.get('at')) || from) - from, 0, Math.max(0, verses.length - 1));
  const [index, setIndex] = useState(startAt);
  const [hidden, setHidden] = useState(false);
  const [peek, setPeek] = useState(false);
  const [finished, setFinished] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Talqeen phases: null (stopped) | 'sheikh' (he recites) | 'you' (mic open) | 'timeout' | 'manual' (no mic: tap when done)
  const [phase, setPhase] = useState(null);
  const indexRef = useRef(index);
  indexRef.current = index;

  // Position the session once per range, after its verses load.
  const rangeKey = `${surahN}:${from}-${to}`;
  const initFor = useRef(null);
  useEffect(() => {
    if (!verses.length || initFor.current === rangeKey) return;
    initFor.current = rangeKey;
    setIndex(startAt);
    setFinished(false);
  }, [rangeKey, verses.length, startAt]);

  const playerRef = useRef(null);

  // ---- "your turn" listener (talqeen) ----
  const voice = useVoiceTurn({
    silenceMs: TURN_WAIT[turnWait] || TURN_WAIT.normal,
    onDone: (reason) => {
      if (reason === 'timeout') { setPhase('timeout'); return; }
      advanceAfterTurn();
    },
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const advanceAfterTurn = () => {
    const i = indexRef.current;
    if (i >= verses.length - 1) {
      voiceRef.current.release();
      setPhase(null);
      setFinished(true);
      return;
    }
    setPhase('sheikh');
    playerRef.current.playAt(i + 1);
  };

  // Called the moment the sheikh's audio ends: the mic is already open, so listening starts at once.
  const startYourTurn = useCallback((retry = false) => {
    // Mic unavailable (blocked / missing): go straight to the manual "Done" button, no waiting.
    if (!retry && voiceRef.current.status === 'error') { setPhase('manual'); return; }
    setPhase('you');
    voiceRef.current.start();
  }, []);

  // When the mic can't be used, fall back to a "I've recited it" button.
  useEffect(() => { if (voice.status === 'error' && phase === 'you') setPhase('manual'); }, [voice.status, phase]);

  const player = useRecitation({
    verses,
    reciter,
    index,
    onIndexChange: setIndex,
    repeatVerse: talqeen ? 1 : repeatVerse,
    repeatRange: talqeen ? 1 : repeatRange,
    autoAdvance: talqeen ? false : autoNext,
    speed,
    onFinish: ({ completedRange }) => {
      if (talqeen) { if (phase !== null) startYourTurn(); return; }
      if (completedRange) setFinished(true);
    },
  });
  playerRef.current = player;

  const stopTalqeen = useCallback(() => {
    voiceRef.current.release(); // close the microphone when the loop stops
    setPhase(null);
  }, []);

  // Start: open + calibrate the mic first (permission prompt appears now, not mid-recitation),
  // then the sheikh recites. If the mic can't be used we still continue with a manual "Done" button.
  const startTalqeen = useCallback(async () => {
    setFinished(false);
    setPhase('prepare');
    await voiceRef.current.prepare();
    setPhase('sheikh');
    playerRef.current.playAt(indexRef.current);
  }, []);

  // Switching mode mid-session stops the talqeen loop.
  useEffect(() => { if (!talqeen) stopTalqeen(); }, [talqeen, stopTalqeen]);

  const current = verses[index];

  useEffect(() => {
    if (!current) return;
    const id = setTimeout(() => saveLastPosition({ surah: surahN, from, to, ayah: current.ayah }), 600);
    return () => clearTimeout(id);
  }, [current?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPeek(false); }, [index, phase]);

  const go = useCallback((delta) => {
    player.resetCounts();
    if (talqeen) { player.pause(); stopTalqeen(); }
    setFinished(false);
    setIndex((i) => clamp(i + delta, 0, verses.length - 1));
  }, [player, verses.length, talqeen, stopTalqeen]);

  // The big play button: in talqeen it starts/stops the whole sheikh → you → next loop.
  const talqeenActive = talqeen && phase !== null;
  const transportPlayer = talqeen
    ? {
        ...player,
        playing: talqeenActive,
        toggle: () => {
          if (talqeenActive) { player.pause(); stopTalqeen(); }
          else startTalqeen();
        },
        replay: () => { voiceRef.current.cancel(); setPhase('sheikh'); player.playAt(index); },
      }
    : player;

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || showSettings) return;
      const rtl = document.documentElement.dir === 'rtl';
      if (e.code === 'Space') { e.preventDefault(); transportPlayer.toggle(); }
      else if (e.key === 'ArrowLeft') go(rtl ? 1 : -1);
      else if (e.key === 'ArrowRight') go(rtl ? -1 : 1);
      else if (e.key.toLowerCase() === 'h') setHidden((h) => !h);
      else if (e.key.toLowerCase() === 'm' && current) toggleMemorized(current.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const memCount = verses.filter((v) => memorized[v.key]).length;
  const isMem = current && Boolean(memorized[current.key]);
  const nextRange = to < total ? { from: to + 1, to: Math.min(total, to + (to - from + 1)) } : surahN < 114 ? { surah: surahN + 1 } : null;
  const hideNow = (hidden || (talqeen && hideOnTurn && ['you', 'manual', 'timeout'].includes(phase))) && !peek;
  const reciterName = (() => { const r = resolveReciter(reciter); return ar ? r.ar : r.en; })();

  return (
    <div className="session">
      <header className="session-head container">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label={t.common.back}>
          <Icon name="close" />
        </button>
        <div className="session-title">
          <strong lang="ar">{surah?.name || '…'}</strong>
          <span className="muted small">
            {ar ? `الآيات ${toArabicDigits(from)}–${toArabicDigits(to)}` : `Verses ${from}–${to}`}
            {' · '}
            <span className="mode-chip">{talqeen ? (ar ? 'ردّد مع الشيخ' : 'Repeat after') : (ar ? 'استماع وتكرار' : 'Listen & repeat')}</span>
          </span>
        </div>
        <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label={ar ? 'الإعدادات' : 'Settings'}>
          <Icon name="settings" />
        </button>
      </header>

      <div className="container session-progress">
        <ProgressBar value={verses.length ? (index + 1) / verses.length : 0} label={t.memorize.progressLabel} />
        <div className="session-progress-meta small muted">
          <span>{t.common.verse} {numberFmt(index + 1)} {t.common.of} {numberFmt(verses.length || 0)}</span>
          <span className="reciter-mini"><Icon name="headphones" size={14} /> {reciterName}</span>
          <span><Icon name="check" size={14} /> {numberFmt(memCount)} {t.common.memorized}</span>
        </div>
      </div>

      <section className="container session-stage" aria-live="polite">
        {loading && <div className="stage-card"><VerseSkeleton lines={3} /></div>}
        {error && <ErrorState error={error} onRetry={retry} />}

        {current && !finished && (
          <div className={`stage-card verse-enter ${isMem ? 'is-memorized' : ''} ${phase === 'you' ? 'is-your-turn' : ''}`} key={current.key}>
            <div className="stage-meta">
              <span className="badge badge-soft">{t.common.verse} {numberFmt(current.ayah)}</span>
              {!talqeen && player.playing && repeatVerse > 1 && (
                <span className="badge badge-soft">
                  <Icon name="repeat" size={14} /> {numberFmt(player.repeatState.verse + 1)}/{repeatVerse === LOOP ? '∞' : numberFmt(repeatVerse)}
                </span>
              )}
              {!talqeen && repeatRange > 1 && (
                <span className="badge badge-soft">{t.memorize.repeatRange} {numberFmt(player.repeatState.range + 1)}/{numberFmt(repeatRange)}</span>
              )}
              {isMem && <span className="badge badge-success"><Icon name="check" size={14} /> {t.common.memorized}</span>}
            </div>

            <QuranText text={current.text} ayah={current.ayah} size="xl" hidden={hideNow} onReveal={() => setPeek(true)} revealLabel={t.common.show} />
            {hideNow && <p className="muted small center">{t.memorize.hidden}</p>}

            {player.playing && <div className="eq" aria-hidden="true"><span /><span /><span /><span /><span /></div>}
          </div>
        )}

        {/* Talqeen turn panel */}
        {talqeen && current && !finished && (
          <TurnPanel
            ar={ar}
            phase={phase}
            voice={voice}
            playing={player.playing}
            onStart={transportPlayer.toggle}
            onDone={() => { if (phase === 'manual' || phase === 'timeout') advanceAfterTurn(); else voice.done(); }}
            onRepeat={transportPlayer.replay}
            onRetryMic={() => startYourTurn(true)}
          />
        )}

        {finished && (
          <div className="stage-card done-card verse-enter">
            <Confetti />
            <span className="done-icon"><Icon name="check" size={32} /></span>
            <h2>{t.memorize.done}</h2>
            <p className="muted">{t.memorize.doneHint}</p>
            <div className="done-actions">
              <button className="btn btn-primary" onClick={() => setMemorized(verses.map((v) => v.key), true)} disabled={memCount === verses.length}>
                <Icon name="check" /> {t.memorize.markAll}
              </button>
              <button className="btn btn-soft" onClick={() => { setFinished(false); setIndex(0); player.resetCounts(); }}>
                <Icon name="replay" /> {ar ? 'أعد المقطع' : 'Repeat range'}
              </button>
              {nextRange && (
                <Link
                  className="btn btn-ghost"
                  to={nextRange.surah
                    ? `/memorize/session?surah=${nextRange.surah}&from=1&to=5`
                    : `/memorize/session?surah=${surahN}&from=${nextRange.from}&to=${nextRange.to}`}
                >
                  {t.memorize.nextRange} <Icon name="arrow" className="flip-rtl-next" />
                </Link>
              )}
            </div>
          </div>
        )}
      </section>

      {current && (
        <footer className="session-dock">
          <div className="container dock-inner">
            {player.error && <p className="error-text small center">{t.errors.audio}</p>}
            <div className="dock-row">
              <button className={`dock-btn ${hidden ? 'is-on' : ''}`} onClick={() => setHidden((h) => !h)} aria-pressed={hidden}>
                <Icon name={hidden ? 'eye' : 'eyeOff'} />
                <span>{hidden ? t.common.show : t.common.hide}</span>
              </button>

              <Transport player={transportPlayer} canPrev={index > 0} canNext={index < verses.length - 1} onPrev={() => go(-1)} onNext={() => go(1)} />

              <button className={`dock-btn ${isMem ? 'is-success' : ''}`} onClick={() => toggleMemorized(current.key)} aria-pressed={isMem}>
                <Icon name="check" />
                <span>{isMem ? t.common.memorized : t.common.markMemorized}</span>
              </button>
            </div>
          </div>
        </footer>
      )}

      <SettingsSheet open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

/** The "sheikh / your turn" panel for talqeen mode. */
function TurnPanel({ ar, phase, voice, playing, onStart, onDone, onRepeat, onRetryMic }) {
  if (phase === null) {
    return (
      <div className="turn-panel turn-idle">
        <p>{ar ? 'الشيخ يقرأ الآية، ثم يُفتح الميكروفون لتقرأ وراءه، وعندما تنتهي ينتقل للآية التالية.' : 'The sheikh recites, then the mic opens for you to repeat; when you finish, the next verse plays.'}</p>
        <button className="btn btn-primary btn-lg" onClick={onStart}><Icon name="mic" /> {ar ? 'ابدأ التلقين' : 'Start'}</button>
      </div>
    );
  }
  if (phase === 'prepare') {
    return (
      <div className="turn-panel turn-sheikh">
        <span className="turn-icon"><Icon name="mic" size={26} /></span>
        <strong>{ar ? 'جارٍ تجهيز الميكروفون…' : 'Getting the mic ready…'}</strong>
        <span className="muted small">{ar ? 'لو ظهر سؤال من المتصفح اضغط "سماح"' : 'If the browser asks, choose "Allow"'}</span>
      </div>
    );
  }
  if (phase === 'sheikh') {
    return (
      <div className="turn-panel turn-sheikh">
        <span className="turn-icon"><Icon name="headphones" size={26} /></span>
        <strong>{ar ? 'استمع للشيخ…' : 'Listen to the sheikh…'}</strong>
        <span className="muted small turn-next">
          {playing
            ? <><Icon name="mic" size={14} /> {ar ? 'الميك جاهز — دورك أول ما يسكت الشيخ' : 'Mic ready — your turn as soon as he stops'}</>
            : (ar ? 'جارٍ التحميل…' : 'Loading…')}
        </span>
      </div>
    );
  }
  if (phase === 'manual') {
    return (
      <div className="turn-panel turn-you">
        <span className="turn-icon is-warn"><Icon name="micOff" size={26} /></span>
        <strong>{ar ? 'دورك — اقرأ الآية' : 'Your turn — recite the verse'}</strong>
        <span className="muted small">
          {voice.error === 'denied'
            ? (ar ? 'لم يُسمح بالميكروفون. اسمح به من أيقونة القفل بجوار عنوان الصفحة، أو اضغط "قرأتها" بعد القراءة.' : 'Microphone blocked. Allow it from the lock icon next to the address, or tap "Done" after reciting.')
            : (ar ? 'لا يوجد ميكروفون متاح. اضغط "قرأتها" بعد القراءة.' : 'No microphone available. Tap "Done" after reciting.')}
        </span>
        <div className="turn-actions">
          <button className="btn btn-primary" onClick={onDone}><Icon name="check" /> {ar ? 'قرأتها، التالي' : 'Done, next'}</button>
          <button className="btn btn-soft" onClick={onRetryMic}><Icon name="mic" /> {ar ? 'جرّب الميكروفون' : 'Try mic'}</button>
        </div>
      </div>
    );
  }
  if (phase === 'timeout') {
    return (
      <div className="turn-panel turn-you">
        <span className="turn-icon is-warn"><Icon name="mic" size={26} /></span>
        <strong>{ar ? 'لم أسمع صوتك' : "I didn't hear you"}</strong>
        <div className="turn-actions">
          <button className="btn btn-soft" onClick={onRepeat}><Icon name="replay" /> {ar ? 'اسمع الآية مرة أخرى' : 'Hear it again'}</button>
          <button className="btn btn-primary" onClick={onRetryMic}><Icon name="mic" /> {ar ? 'دوري مرة أخرى' : 'My turn again'}</button>
          <button className="btn btn-ghost" onClick={onDone}>{ar ? 'التالي' : 'Next'}</button>
        </div>
      </div>
    );
  }
  // 'you'
  const speaking = voice.status === 'speaking';
  return (
    <div className="turn-panel turn-you">
      <button
        type="button"
        ref={voice.orbRef}
        data-status={voice.status}
        className={`mic-orb ${speaking ? 'is-speaking' : ''}`}
        onClick={onDone}
        aria-label={ar ? 'انتهيت' : 'Done'}
      >
        <span className="mic-ring" />
        <span className="mic-ring r2" />
        <Icon name="mic" size={30} />
      </button>
      <strong>{voice.status === 'preparing' ? (ar ? 'جارٍ فتح الميكروفون…' : 'Opening the mic…') : speaking ? (ar ? 'أسمعك… أكمل' : "I'm listening… keep going") : (ar ? 'دورك! اقرأ الآية' : 'Your turn! Recite the verse')}</strong>
      <span className="muted small">{ar ? 'عندما تسكت قليلًا ينتقل الشيخ للآية التالية' : 'When you pause, the sheikh moves to the next verse'}</span>
      <div className="turn-actions">
        <button className="btn btn-soft btn-sm" onClick={onRepeat}><Icon name="replay" size={16} /> {ar ? 'اسمعها مرة أخرى' : 'Hear again'}</button>
        <button className="btn btn-ghost btn-sm" onClick={onDone}><Icon name="check" size={16} /> {ar ? 'انتهيت' : 'Done'}</button>
      </div>
    </div>
  );
}

const TURN_WAIT = { fast: 700, normal: 1000, slow: 1600 };

function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 18 }).map((_, i) => <span key={i} style={{ '--i': i }} />)}
    </div>
  );
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
