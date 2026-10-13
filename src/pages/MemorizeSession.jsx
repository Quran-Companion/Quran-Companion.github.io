import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import { useProgress } from '../context/ProgressContext';
import { getSurah } from '../lib/quranApi';
import { useAsync } from '../hooks/useAsync';
import { useRecitation } from '../hooks/useRecitation';
import { useVoiceTurn } from '../hooks/useVoiceTurn';
import { speechSupported, useReciteCheck } from '../hooks/useReciteCheck';
import { ErrorState, VerseSkeleton } from '../components/States';
import { QuranText, toArabicDigits } from '../components/Verse';
import { Transport } from '../components/AudioControls';
import SettingsSheet, { LOOP } from '../components/SettingsSheet';
import { ProgressBar } from '../components/ProgressRing';
import { resolveReciter } from '../lib/reciters';
import { matchRecitation } from '../lib/recite';
import Icon from '../components/Icon';

export default function MemorizeSession() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const S = useSettings();
  const { t, lang, reciter, speed, numberFmt, memMode, repeatVerse, repeatRange, autoNext, hideOnTurn, turnWait, reciteStrict } = S;
  const ar = lang === 'ar';
  const talqeen = memMode === 'talqeen';
  const tasmee = memMode === 'tasmee'; // you recite from memory without stopping; mistakes are marked red as you go
  const voice = talqeen || tasmee;
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
  // Talqeen phases: null (stopped) | 'prepare' | 'sheikh' (he recites) | 'you' (listening & checking)
  //                 | 'passed' (verse recited correctly) | 'retry' (not complete) | 'manual' (no speech recognition)
  const [phase, setPhase] = useState(null);
  // Tasmee (continuous recitation)
  const [hints, setHints] = useState([]); // words of the current verse revealed with "show a word"
  const [recited, setRecited] = useState({}); // verse key → final marks (true / 'bad' / 'hint')
  const [helped, setHelped] = useState({}); // verse key → used "show a word / verse"
  const hintsRef = useRef({}); // verse key → Set of revealed word indexes
  const indexRef = useRef(index);
  indexRef.current = index;
  const versesRef = useRef([]);

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

  // ---- "your turn": speech recognition checks the recited words against the verse ----
  const mic = useVoiceTurn(); // only used to ask for microphone permission up front
  const micRef = useRef(mic);
  micRef.current = mic;
  const check = useReciteCheck({
    threshold: STRICTNESS[reciteStrict] || STRICTNESS.normal,
    pauseMs: TURN_WAIT[turnWait] || TURN_WAIT.normal,
    onSuccess: () => {
      setPhase('passed');
      clearTimeout(passTimer.current);
      passTimer.current = setTimeout(advanceAfterTurn, 700);
    },
    // Tasmee: a verse is done → keep its marks (missed words red) and follow on to the next one.
    onVerse: (i, r) => {
      const v = versesRef.current[i];
      if (!v) return;
      const shown = hintsRef.current[v.key] || new Set();
      const marks = r.matched.map((m, w) => (!r.real[w] ? true : m === 'bad' ? 'bad' : shown.has(w) ? 'hint' : m ? true : 'bad'));
      setRecited((x) => ({ ...x, [v.key]: marks }));
      if (i + 1 < versesRef.current.length) {
        indexRef.current = i + 1;
        setIndex(i + 1);
        setHints([]);
      }
    },
    onFlowEnd: () => { setPhase(null); setFinished(true); },
  });
  const checkRef = useRef(check);
  checkRef.current = check;
  const passTimer = useRef(0);
  useEffect(() => () => clearTimeout(passTimer.current), []);

  const advanceAfterTurn = () => {
    const i = indexRef.current;
    checkRef.current.stop();
    if (i >= verses.length - 1) {
      setPhase(null);
      setFinished(true);
      return;
    }
    if (tasmee) { // no speech recognition: you check yourself and move on
      indexRef.current = i + 1;
      setIndex(i + 1);
      setPhase('manual');
      return;
    }
    setPhase('sheikh');
    playerRef.current.playAt(i + 1);
  };

  // Called the moment the sheikh's audio ends (or right away in tasmee).
  const startYourTurn = useCallback((at) => {
    const v = versesRef.current[at ?? indexRef.current];
    if (!speechSupported || checkRef.current.error === 'denied' || !v) { setPhase('manual'); return; }
    setPhase('you');
    checkRef.current.start(v.text, { surah: v.surah, ayah: v.ayah });
  }, []);

  // Tasmee: listen continuously from the current verse to the end of the range.
  const startFlow = useCallback(() => {
    const i = indexRef.current;
    if (!speechSupported || checkRef.current.error === 'denied') { setPhase('manual'); return; }
    setHints([]);
    setPhase('you');
    checkRef.current.startFlow(versesRef.current.slice(i).map((v) => ({ text: v.text, ctx: { surah: v.surah, ayah: v.ayah } })), i);
  }, []);

  const markHelped = () => {
    const v = versesRef.current[indexRef.current];
    if (v) setHelped((h) => ({ ...h, [v.key]: true }));
  };
  // "Show a word": reveal the next word you haven't said yet.
  const giveHint = () => {
    const v = versesRef.current[indexRef.current];
    if (!v) return;
    const r = checkRef.current.result || matchRecitation(v.text, '', { surah: v.surah, ayah: v.ayah });
    const set = (hintsRef.current[v.key] ||= new Set());
    const w = r.matched.findIndex((m, k) => !m && r.real[k] && !set.has(k));
    if (w < 0) return;
    set.add(w);
    setHints([...set]);
    markHelped();
  };
  const showVerse = () => { setPeek((x) => !x); markHelped(); };

  // Not complete after a pause → "try again" (tasmee: paused too long → "carry on"); recognition unavailable → manual button.
  useEffect(() => {
    if (phase !== 'you') return;
    if (check.status === 'retry') setPhase('retry');
    if (check.status === 'error') setPhase('manual');
  }, [check.status, phase]);

  const player = useRecitation({
    verses,
    reciter,
    index,
    onIndexChange: setIndex,
    repeatVerse: voice ? 1 : repeatVerse,
    repeatRange: voice ? 1 : repeatRange,
    autoAdvance: voice ? false : autoNext,
    speed,
    onFinish: ({ completedRange }) => {
      if (talqeen) { if (phase !== null) startYourTurn(); return; }
      if (tasmee) return;
      if (completedRange) setFinished(true);
    },
  });
  playerRef.current = player;

  const stopTalqeen = useCallback(() => {
    clearTimeout(passTimer.current);
    checkRef.current.stop();
    micRef.current.release();
    setPhase(null);
  }, []);

  // Start: open + calibrate the mic first (permission prompt appears now, not mid-recitation),
  // then the sheikh recites. If the mic can't be used we still continue with a manual "Done" button.
  const startTalqeen = useCallback(async () => {
    setFinished(false);
    setPhase('prepare');
    // Ask for the microphone now (so no prompt interrupts later), then free it for speech recognition.
    if (speechSupported) { await micRef.current.prepare(); micRef.current.release(); }
    if (memModeRef.current === 'tasmee') { startFlow(); return; }
    setPhase('sheikh');
    playerRef.current.playAt(indexRef.current);
  }, [startFlow]);
  const memModeRef = useRef(memMode);
  memModeRef.current = memMode;

  // Switching mode mid-session stops the voice loop.
  useEffect(() => { playerRef.current?.pause(); stopTalqeen(); }, [memMode, stopTalqeen]);

  const current = verses[index];
  versesRef.current = verses;

  useEffect(() => {
    if (!current) return;
    const id = setTimeout(() => saveLastPosition({ surah: surahN, from, to, ayah: current.ayah }), 600);
    return () => clearTimeout(id);
  }, [current?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPeek(false); }, [index, phase]);

  const go = useCallback((delta) => {
    player.resetCounts();
    if (voice) { player.pause(); stopTalqeen(); }
    setFinished(false);
    setIndex((i) => clamp(i + delta, 0, verses.length - 1));
  }, [player, verses.length, voice, stopTalqeen]);

  // The big play button: in talqeen it starts/stops the whole sheikh → you → next loop.
  const talqeenActive = voice && phase !== null;
  const transportPlayer = voice
    ? {
        ...player,
        playing: talqeenActive,
        toggle: () => {
          if (talqeenActive) { player.pause(); stopTalqeen(); }
          else startTalqeen();
        },
        replay: () => { if (tasmee) return; clearTimeout(passTimer.current); checkRef.current.stop(); setPhase('sheikh'); player.playAt(index); },
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
  const hideNow = (hidden || (talqeen && hideOnTurn && phase === 'manual') || (tasmee && [null, 'prepare', 'manual'].includes(phase))) && !peek;
  // While it's your turn, words light up as you say them (and appear one by one if the verse is hidden).
  const checking = voice && ['you', 'retry', 'passed'].includes(phase);
  let marks = checking ? (check.result?.matched || []) : null;
  let maskWords = checking && (hidden || hideOnTurn || tasmee) && !peek && phase !== 'passed';
  if (tasmee && checking) {
    marks = [...marks];
    hints.forEach((w) => { if (!marks[w]) marks[w] = 'hint'; });
  }
  const isBad = (k) => (recited[k] || []).includes('bad');
  const cleanKeys = verses.filter((v) => recited[v.key] && !isBad(v.key)).map((v) => v.key);
  const badCount = verses.filter((v) => isBad(v.key)).length;
  // The verse you just finished, with its marks, shown above the current one.
  const prev = tasmee && phase === 'you' && index > 0 ? verses[index - 1] : null;
  const prevMarks = prev && recited[prev.key];
  const reciterName = (() => { const r = resolveReciter(reciter); return (ar ? r.ar : r.en).replace(/\s*\(.*\)\s*$/, ''); })();

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
            <span className="mode-chip">{tasmee ? (ar ? 'تسميع وتصحيح' : 'Recite & correct') : talqeen ? (ar ? 'ردّد مع الشيخ' : 'Repeat after') : (ar ? 'استماع وتكرار' : 'Listen & repeat')}</span>
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

        {prevMarks && !finished && (
          <div className={`prev-card ${isBad(prev.key) ? 'has-bad' : ''}`} key={`prev-${prev.key}`}>
            <span className="small muted">{isBad(prev.key) ? (ar ? 'الآية اللي فاتت — الأحمر فاتك أو غلطت فيه' : 'Previous verse — red = missed or wrong') : (ar ? 'الآية اللي فاتت ✓' : 'Previous verse ✓')}</span>
            <QuranText text={prev.text} ayah={prev.ayah} size="md" marks={prevMarks} />
          </div>
        )}

        {current && !finished && (
          <div className={`stage-card verse-enter ${isMem ? 'is-memorized' : ''} ${phase === 'you' ? 'is-your-turn' : ''}`} key={current.key}>
            <div className="stage-meta">
              <span className="badge badge-soft">{t.common.verse} {numberFmt(current.ayah)}</span>
              {!voice && player.playing && repeatVerse > 1 && (
                <span className="badge badge-soft">
                  <Icon name="repeat" size={14} /> {numberFmt(player.repeatState.verse + 1)}/{repeatVerse === LOOP ? '∞' : numberFmt(repeatVerse)}
                </span>
              )}
              {!voice && repeatRange > 1 && (
                <span className="badge badge-soft">{t.memorize.repeatRange} {numberFmt(player.repeatState.range + 1)}/{numberFmt(repeatRange)}</span>
              )}
              {isMem && <span className="badge badge-success"><Icon name="check" size={14} /> {t.common.memorized}</span>}
            </div>

            <QuranText text={current.text} ayah={current.ayah} size="xl" hidden={hideNow && !marks} onReveal={() => setPeek(true)} revealLabel={t.common.show} marks={marks} mask={maskWords} />
            {hideNow && <p className="muted small center">{t.memorize.hidden}</p>}

            {player.playing && <div className="eq" aria-hidden="true"><span /><span /><span /><span /><span /></div>}
          </div>
        )}

        {/* Talqeen turn panel */}
        {voice && current && !finished && (
          <TurnPanel
            ar={ar}
            tasmee={tasmee}
            peek={peek}
            onHint={giveHint}
            onShowVerse={showVerse}
            onSkipVerse={() => { markHelped(); checkRef.current.skipVerse(); }}
            phase={phase}
            check={check}
            playing={player.playing}
            numberFmt={numberFmt}
            onStart={transportPlayer.toggle}
            onSkip={advanceAfterTurn}
            onRepeat={transportPlayer.replay}
            onRetry={() => (tasmee ? startFlow() : startYourTurn())}
          />
        )}

        {finished && (
          <div className="stage-card done-card verse-enter">
            <Confetti />
            <span className="done-icon"><Icon name="check" size={32} /></span>
            <h2>{t.memorize.done}</h2>
            {tasmee ? (
              <>
                <p className="muted tasmee-summary">
                  {ar
                    ? `سمّعت ${numberFmt(cleanKeys.length)} من ${numberFmt(verses.length)} آية صح` + (badCount ? (badCount === 1 ? '، وآية واحدة فيها غلط (متعلّم بالأحمر).' : `، و${numberFmt(badCount)} آيات فيها غلط (متعلّم بالأحمر).`) : ' — ما شاء الله!')
                    : `${cleanKeys.length} of ${verses.length} verses right` + (badCount ? `, ${badCount} with mistakes (in red).` : ' — excellent!')}
                </p>
                <div className="recited-list">
                  {verses.map((v, i) => recited[v.key] && (
                    <div key={v.key} className={`recited-row ${isBad(v.key) ? 'has-bad' : ''}`}>
                      <QuranText text={v.text} ayah={v.ayah} size="md" marks={recited[v.key]} />
                      {(isBad(v.key) || helped[v.key]) && (
                        <button className="btn btn-soft btn-sm" onClick={() => player.playAt(i)}>
                          <Icon name="headphones" size={16} /> {ar ? 'اسمعها من الشيخ' : 'Hear it'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="muted">{t.memorize.doneHint}</p>}
            <div className="done-actions">
              {tasmee && cleanKeys.length > 0 && cleanKeys.length < verses.length && (
                <button className="btn btn-primary" onClick={() => setMemorized(cleanKeys, true)} disabled={cleanKeys.every((k) => memorized[k])}>
                  <Icon name="check" /> {ar ? 'علّم اللي سمّعته صح كمحفوظ' : 'Mark the correct ones memorized'}
                </button>
              )}
              <button className={`btn ${tasmee && cleanKeys.length < verses.length ? 'btn-soft' : 'btn-primary'}`} onClick={() => setMemorized(verses.map((v) => v.key), true)} disabled={memCount === verses.length}>
                <Icon name="check" /> {t.memorize.markAll}
              </button>
              <button className="btn btn-soft" onClick={() => { setFinished(false); setIndex(0); setRecited({}); setHelped({}); hintsRef.current = {}; player.resetCounts(); }}>
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
function TurnPanel({ ar, tasmee, peek, phase, check, playing, numberFmt, onStart, onSkip, onRepeat, onRetry, onHint, onShowVerse, onSkipVerse }) {
  const pct = Math.round((check.result?.coverage || 0) * 100);
  if (phase === null) {
    return (
      <div className="turn-panel turn-idle">
        <p>{tasmee
          ? (ar ? 'اقرأ من حفظك والميك مفتوح. مش هتنتقل للآية اللي بعدها غير لما تقول الآية كلها. الكلمة اللي تفوتها أو تغلط فيها بتنوّر بالأحمر لحد ما تقولها صح. ولو نسيت، اضغط «اظهر كلمة» أو «اظهر الآية».' : 'Recite from memory with the mic on. You move to the next verse only after saying the whole verse. A word you skip or get wrong turns red until you say it. Forgot? Tap "Show a word" or "Show the verse".')
          : (ar ? 'الشيخ يقرأ الآية، ثم تقرأها أنت وراءه. لن ينتقل للآية التالية إلا عندما تقولها صحيحة.' : 'The sheikh recites, then you repeat. It moves on only when you say the verse correctly.')}</p>
        <button className="btn btn-primary btn-lg" onClick={onStart}><Icon name="mic" /> {tasmee ? (ar ? 'ابدأ التسميع' : 'Start reciting') : (ar ? 'ابدأ التلقين' : 'Start')}</button>
        {!speechSupported && <p className="muted small">{UNSUPPORTED[ar ? 'ar' : 'en']}</p>}
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
          {playing ? <><Icon name="mic" size={14} /> {ar ? 'دورك أول ما يسكت الشيخ' : 'Your turn as soon as he stops'}</> : (ar ? 'جارٍ التحميل…' : 'Loading…')}
        </span>
      </div>
    );
  }
  if (phase === 'passed') {
    return (
      <div className="turn-panel turn-passed">
        <span className="turn-icon is-ok"><Icon name="check" size={28} /></span>
        <strong>{ar ? 'أحسنت! ✓' : 'Well done! ✓'}</strong>
        <span className="muted small">{ar ? 'الآية التالية…' : 'Next verse…'}</span>
      </div>
    );
  }
  if (phase === 'manual') {
    const reason = check.error === 'denied'
      ? (ar ? 'الميكروفون أو التعرّف على الكلام غير مسموح. اسمح به من أيقونة القفل بجوار عنوان الصفحة.' : 'Microphone / speech recognition is blocked. Allow it from the lock icon next to the address.')
      : check.error === 'network'
        ? (ar ? 'التعرّف على الكلام يحتاج إنترنت، والاتصال ضعيف الآن.' : 'Speech recognition needs internet and the connection is weak.')
        : UNSUPPORTED[ar ? 'ar' : 'en'];
    return (
      <div className="turn-panel turn-you">
        <span className="turn-icon is-warn"><Icon name="micOff" size={26} /></span>
        <strong>{ar ? 'لا يمكن التأكد من قراءتك هنا' : "Can't check your recitation here"}</strong>
        <span className="muted small">{reason}</span>
        <div className="turn-actions">
          <button className="btn btn-primary" onClick={onSkip}><Icon name="check" /> {ar ? 'قرأتها، التالي' : 'I recited it, next'}</button>
          {speechSupported && <button className="btn btn-soft" onClick={onRetry}><Icon name="mic" /> {ar ? 'جرّب تاني' : 'Try again'}</button>}
        </div>
      </div>
    );
  }
  if (phase === 'retry' && tasmee) {
    return (
      <div className="turn-panel turn-retry">
        <span className="turn-icon is-warn"><Icon name="micOff" size={26} /></span>
        <strong>{ar ? 'وقفت شوية، فقفلت الميك' : 'You paused, so the mic is off'}</strong>
        <div className="turn-actions">
          <button className="btn btn-primary" onClick={onRetry}><Icon name="mic" /> {ar ? 'كمّل من هنا' : 'Carry on from here'}</button>
          <button className={`btn ${peek ? 'btn-primary' : 'btn-soft'}`} onClick={onShowVerse}><Icon name={peek ? 'eyeOff' : 'book'} /> {peek ? (ar ? 'اخفِ الآية' : 'Hide the verse') : (ar ? 'اظهر الآية' : 'Show the verse')}</button>
        </div>
      </div>
    );
  }
  if (phase === 'retry') {
    return (
      <div className="turn-panel turn-retry">
        <span className="turn-icon is-warn"><Icon name="replay" size={26} /></span>
        <strong>{pct ? (ar ? 'لسه ناقص كلمات — حاول تاني' : 'Some words are missing — try again') : (ar ? 'لم أسمع الآية' : "I didn't hear the verse")}</strong>
        {pct > 0 && <ReciteMeter pct={pct} numberFmt={numberFmt} ar={ar} />}
        <span className="muted small">{ar ? 'الكلمات اللي اتقالت صح منوّرة في الآية.' : 'Words you said are highlighted in the verse.'}</span>
        <div className="turn-actions">
          <button className="btn btn-primary" onClick={onRetry}><Icon name="mic" /> {ar ? 'حاول تاني' : 'Try again'}</button>
          <button className="btn btn-soft" onClick={onRepeat}><Icon name="replay" /> {ar ? 'اسمع الشيخ تاني' : 'Hear it again'}</button>
          <button className="btn btn-ghost btn-sm" onClick={onSkip}>{ar ? 'تخطّي' : 'Skip'}</button>
        </div>
      </div>
    );
  }
  // 'you'
  const listening = check.status === 'listening';
  const speaking = Boolean(check.heard);
  return (
    <div className="turn-panel turn-you">
      <span className={`mic-orb ${speaking ? 'is-speaking' : ''} ${listening ? 'is-listening' : ''}`} data-status={check.status} aria-hidden="true">
        <span className="mic-ring" />
        <span className="mic-ring r2" />
        <Icon name="mic" size={30} />
      </span>
      <strong>{!listening && !speaking ? (ar ? 'ثانية…' : 'One moment…') : tasmee ? (ar ? 'سمّع الآية من حفظك' : 'Recite the verse from memory') : (ar ? 'دورك! اقرأ الآية' : 'Your turn! Recite the verse')}</strong>
      {tasmee
        ? <span className="muted small">{ar ? 'قول الآية كلها — الكلمة اللي تفوتك بتنوّر بالأحمر لحد ما تقولها' : 'Say the whole verse — a skipped word stays red until you say it'}</span>
        : speaking ? <ReciteMeter pct={pct} numberFmt={numberFmt} ar={ar} /> : <span className="muted small">{ar ? 'الكلمات هتنوّر وانت بتقولها' : 'Words light up as you say them'}</span>}
      <div className="turn-actions">
        {tasmee ? (
          <>
            <button className="btn btn-soft btn-sm" onClick={onHint} data-act="word"><Icon name="eye" size={16} /> {ar ? 'اظهر كلمة' : 'Show a word'}</button>
            <button className={`btn btn-sm ${peek ? 'btn-primary' : 'btn-soft'}`} onClick={onShowVerse} data-act="verse"><Icon name={peek ? 'eyeOff' : 'book'} size={16} /> {peek ? (ar ? 'اخفِ الآية' : 'Hide the verse') : (ar ? 'اظهر الآية' : 'Show the verse')}</button>
            <button className="btn btn-ghost btn-sm" onClick={onSkipVerse} data-act="skip">{ar ? 'تخطّي الآية' : 'Skip verse'}</button>
          </>
        ) : (
          <>
            <button className="btn btn-soft btn-sm" onClick={onRepeat}><Icon name="replay" size={16} /> {ar ? 'اسمعها تاني' : 'Hear again'}</button>
            <button className="btn btn-ghost btn-sm" onClick={onSkip}>{ar ? 'تخطّي' : 'Skip'}</button>
          </>
        )}
      </div>
    </div>
  );
}

function ReciteMeter({ pct, numberFmt, ar }) {
  return (
    <div className="recite-meter" aria-label={ar ? 'نسبة ما قيل من الآية' : 'How much of the verse was said'}>
      <span className="recite-bar"><span style={{ width: `${pct}%` }} /></span>
      <span className="small">{numberFmt(pct)}%</span>
    </div>
  );
}

const UNSUPPORTED = {
  ar: 'المتصفح ده مش بيدعم التعرّف على الكلام، فمش هقدر أتأكد إنك قلت الآية. افتح الموقع في Chrome أو Safari (لو فاتحه من ماسنجر أو فيسبوك: اضغط ⋯ ثم "فتح في المتصفح").',
  en: "This browser doesn't support speech recognition, so your recitation can't be checked. Open the site in Chrome or Safari (from Messenger/Facebook: tap ⋯ → Open in browser).",
};
const STRICTNESS = { easy: 0.5, normal: 0.7, strict: 0.9 };
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
