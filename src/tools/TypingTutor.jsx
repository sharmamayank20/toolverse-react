import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Type, BookOpen, PenLine, Volume2, VolumeX, RotateCcw, Info, Trophy } from 'lucide-react'
import CircularText from '../components/CircularText'
import Modal from '../components/Modal'
import Toast from '../components/Toast'
import DesktopOnlyGate from '../components/DesktopOnlyGate'
import { generateWordText, pickParagraph } from '../utils/typingData'
import { playTypingClick } from '../utils/keyboardSound'

const HISTORY_KEY = 'toolverse_typingtutor_history'
const BEST_KEY = 'toolverse_typingtutor_bests'
const MAX_HISTORY = 12

function loadJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }

function TypingTutor() {
  const [mode, setMode] = useState('time')
  const [timeDuration, setTimeDuration] = useState(15)
  const [wordCount, setWordCount] = useState(25)
  const [punctuationEnabled, setPunctuationEnabled] = useState(false)
  const [numbersEnabled, setNumbersEnabled] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [customText, setCustomText] = useState('')

  const [targetText, setTargetText] = useState('')
  const [charStates, setCharStates] = useState([])
  const [caretIndex, setCaretIndex] = useState(0)
  const [sourceLabel, setSourceLabel] = useState('Random paragraph')
  const [focused, setFocused] = useState(false)

  const [testStarted, setTestStarted] = useState(false)
  const [testFinished, setTestFinished] = useState(false)
  const [secondsElapsed, setSecondsElapsed] = useState(0)
  const [totalKeystrokes, setTotalKeystrokes] = useState(0)
  const [correctKeystrokes, setCorrectKeystrokes] = useState(0)
  const [incorrectKeystrokes, setIncorrectKeystrokes] = useState(0)
  const [mistakeMap, setMistakeMap] = useState({})
  const [wpmSamples, setWpmSamples] = useState([])
  const [isNewBest, setIsNewBest] = useState(false)
  const [finalStats, setFinalStats] = useState(null)
  const [history, setHistory] = useState(() => loadJSON(HISTORY_KEY, []))
  const [toast, setToast] = useState(null)
  const [showInfo, setShowInfo] = useState(false)

  const startTimeRef = useRef(0)
  const timerRef = useRef(null)
  const inputRef = useRef(null)
  const charRefs = useRef([])
  const viewportRef = useRef(null)
  const resultsRef = useRef(null)
  const scrollToCaretRef = useRef(null)

  const modeKey = useCallback(() => {
    if (mode === 'time') return `time-${timeDuration}`
    if (mode === 'words') return `words-${wordCount}`
    if (mode === 'quote') return 'quote'
    return 'custom'
  }, [mode, timeDuration, wordCount])

  const best = loadJSON(BEST_KEY, {})[modeKey()] || 0

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 1800) }

  const loadNewText = useCallback(() => {
    let text
    if (mode === 'quote') { text = pickParagraph(); setSourceLabel('Random paragraph') }
    else if (mode === 'words') { text = generateWordText(wordCount, numbersEnabled, punctuationEnabled); setSourceLabel(`${wordCount} random words`) }
    else if (mode === 'custom') { return } // custom text is loaded explicitly via handleUseCustom, never auto-generated
    else { text = generateWordText(220, numbersEnabled, punctuationEnabled); setSourceLabel(`${timeDuration}s random words`) }
    setTargetText(text)
    setCharStates(new Array(text.length).fill('pending'))
    setCaretIndex(0)
  }, [mode, wordCount, timeDuration, numbersEnabled, punctuationEnabled])

  const resetTestState = useCallback(() => {
    setTestStarted(false); setTestFinished(false); setSecondsElapsed(0)
    setTotalKeystrokes(0); setCorrectKeystrokes(0); setIncorrectKeystrokes(0)
    setMistakeMap({}); setWpmSamples([]); setIsNewBest(false); setFinalStats(null)
    clearInterval(timerRef.current)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

const [remeasureTick, setRemeasureTick] = useState(0)

useEffect(() => {
  document.fonts?.ready?.then(() => { setRemeasureTick(t => t + 1); scrollToCaretRef.current?.('auto') })
  let resizeTimer
  function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { setRemeasureTick(t => t + 1); scrollToCaretRef.current?.('auto') }, 150) }
  window.addEventListener('resize', onResize)
  return () => { window.removeEventListener('resize', onResize); clearTimeout(resizeTimer) }
}, [])
  // FIX 4: single source of truth — whenever mode/duration/wordCount/difficulty
  // actually changes, reset + regenerate. No more stale-closure setTimeout calls.
  useEffect(() => {
    if (mode === 'custom') return
    resetTestState()
    loadNewText()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, timeDuration, wordCount])

  function elapsedMinutes() { return Math.max((performance.now() - startTimeRef.current) / 60000, 1 / 600) }
  function netWpm(correct = correctKeystrokes) { return Math.round((correct / 5) / elapsedMinutes()) }
  function rawWpm(total = totalKeystrokes) { return Math.round((total / 5) / elapsedMinutes()) }
  function accuracy(correct = correctKeystrokes, total = totalKeystrokes) { return total === 0 ? 100 : Math.round((correct / total) * 100) }

  const correctKeystrokesRef = useRef(0)
  const totalKeystrokesRef = useRef(0)
  const incorrectKeystrokesRef = useRef(0)
  const mistakeMapRef = useRef({})
  useEffect(() => { correctKeystrokesRef.current = correctKeystrokes }, [correctKeystrokes])
  useEffect(() => { totalKeystrokesRef.current = totalKeystrokes }, [totalKeystrokes])
  useEffect(() => { incorrectKeystrokesRef.current = incorrectKeystrokes }, [incorrectKeystrokes])
  useEffect(() => { mistakeMapRef.current = mistakeMap }, [mistakeMap])

  function computeConsistency() {
    if (wpmSamples.length < 2) return 100
    const values = wpmSamples.map(s => s.wpm).filter(v => v >= 0)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    if (mean === 0) return 100
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length
    const cv = Math.sqrt(variance) / mean
    return Math.max(0, Math.min(100, Math.round(100 - cv * 100)))
  }

  function finishTest(finalCorrect, finalTotal, finalIncorrect) {
    setTestFinished(true)
    clearInterval(timerRef.current)
    if (inputRef.current) inputRef.current.blur()

    const finalNet = netWpm(finalCorrect)
    const finalRaw = rawWpm(finalTotal)
    const finalAcc = accuracy(finalCorrect, finalTotal)
    setFinalStats({ net: finalNet, raw: finalRaw, acc: finalAcc, total: finalTotal })

    const bests = loadJSON(BEST_KEY, {})
    const key = modeKey()
    const wasBest = mode !== 'custom' && finalNet > (bests[key] || 0)
    if (wasBest) { bests[key] = finalNet; saveJSON(BEST_KEY, bests) }
    setIsNewBest(wasBest)
    if (wasBest) showToast('New personal best!')

    const modeLabel = { time: `Time ${timeDuration}s`, words: `Words ${wordCount}`, quote: 'Paragraph', custom: 'Custom' }[mode]
    const entry = { when: new Date().toISOString(), mode: modeLabel, netWpm: finalNet, accuracy: finalAcc, consistency: computeConsistency() }
    const nextHistory = [entry, ...history].slice(0, MAX_HISTORY)
    setHistory(nextHistory)
    saveJSON(HISTORY_KEY, nextHistory)
  }

  // FIX 3: auto-scroll to results the moment the test finishes
  useEffect(() => {
    if (testFinished) {
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    }
  }, [testFinished])

  function startTest() {
    setTestStarted(true)
    startTimeRef.current = performance.now()
    setSecondsElapsed(0)
    timerRef.current = setInterval(() => {
      setSecondsElapsed(s => {
        const next = s + 1
        setWpmSamples(prev => [...prev, { t: next, wpm: netWpm(correctKeystrokesRef.current) }])
        if (mode === 'time' && next >= timeDuration) {
          setTimeout(() => finishTest(correctKeystrokesRef.current, totalKeystrokesRef.current, incorrectKeystrokesRef.current), 0)
        }
        return next
      })
    }, 1000)
  }

  function handleInput(e) {
    if (testFinished) return
    let value = e.target.value
    if (value.length > targetText.length) { value = value.slice(0, targetText.length); e.target.value = value }
    const prevLen = caretIndex

    if (!testStarted && value.length > 0) startTest()

    let newCorrect = correctKeystrokes, newIncorrect = incorrectKeystrokes, newTotal = totalKeystrokes
    const newMistakes = { ...mistakeMap }
    const newStates = [...charStates]

    if (value.length > prevLen) {
      for (let i = prevLen; i < value.length; i++) {
        const expected = targetText[i]
        newTotal++
        if (value[i] === expected) { newCorrect++; newStates[i] = 'correct' }
        else { newIncorrect++; newMistakes[expected] = (newMistakes[expected] || 0) + 1; newStates[i] = 'incorrect' }
      }
    } else if (value.length < prevLen) {
      for (let i = value.length; i < prevLen; i++) newStates[i] = 'pending'
    }

    setCharStates(newStates)
    setCaretIndex(value.length)
    setCorrectKeystrokes(newCorrect); setIncorrectKeystrokes(newIncorrect); setTotalKeystrokes(newTotal); setMistakeMap(newMistakes)

    const doneByLength = value.length >= targetText.length
    if (doneByLength && mode !== 'time') {
      finishTest(newCorrect, newTotal, newIncorrect)
    } else if (doneByLength && mode === 'time') {
      const extra = generateWordText(80, numbersEnabled, punctuationEnabled)
      setTargetText(prev => prev + ' ' + extra)
      setCharStates(prev => [...prev, ...new Array(extra.length + 1).fill('pending')])
    }
  }

  function handleKeyDownOnInput(e) {
    if (soundEnabled && !e.repeat && (e.key.length === 1 || e.key === 'Backspace')) playTypingClick()
  }

  // FIX 4 continued: handlers now ONLY set state — the effect above handles regeneration
  function handleModeChange(m) { setMode(m) }
  function handleTimeChange(d) { setTimeDuration(d) }
  function handleWordsChange(w) { setWordCount(w) }
  function regenerateWithDifficulty(punctuation, numbers) {
  resetTestState()
  let text
  if (mode === 'words') { text = generateWordText(wordCount, numbers, punctuation); setSourceLabel(`${wordCount} random words`) }
  else { text = generateWordText(220, numbers, punctuation); setSourceLabel(`${timeDuration}s random words`) }
  setTargetText(text)
  setCharStates(new Array(text.length).fill('pending'))
  setCaretIndex(0)
}

function togglePunctuation() {
  const next = !punctuationEnabled
  setPunctuationEnabled(next)
  regenerateWithDifficulty(next, numbersEnabled)
}
function toggleNumbers() {
  const next = !numbersEnabled
  setNumbersEnabled(next)
  regenerateWithDifficulty(punctuationEnabled, next)
}

  function handleRestart() {
    resetTestState()
    if (mode === 'custom') {
      setTargetText(t => t); setCharStates(new Array(targetText.length).fill('pending')); setCaretIndex(0)
      showToast('Restarted.')
    } else {
      loadNewText()
      showToast('Restarted with new text.')
    }
  }
  function handleTryAgain() {
    const keep = targetText
    resetTestState()
    setTargetText(keep)
    setCharStates(new Array(keep.length).fill('pending'))
    setCaretIndex(0)
    inputRef.current?.focus({ preventScroll: true })
  }
  function handleNewText() {
    resetTestState()
    if (mode === 'custom') { showToast('Paste new custom text below.') }
    else loadNewText()
    inputRef.current?.focus({ preventScroll: true })
  }
  function handleUseCustom() {
    const text = customText.trim()
    if (!text) { showToast('Paste some text first.'); return }
    resetTestState()
    setTargetText(text)
    setCharStates(new Array(text.length).fill('pending'))
    setCaretIndex(0)
    setSourceLabel('Custom text')
    inputRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    function onTab(e) {
      if (e.key === 'Tab' && document.activeElement?.id !== 'customTextArea') {
        e.preventDefault()
        if (mode === 'custom') handleTryAgain(); else handleRestart()
        inputRef.current?.focus({ preventScroll: true })
        showToast('Restarted (Tab).')
      }
    }
    window.addEventListener('keydown', onTab)
    return () => window.removeEventListener('keydown', onTab)
  })

  // Line detection: measure each character's real offsetTop after every text/layout change.
  // This reads the browser's actual, already-correct wrap — it's not simulated or guessed.
  // The earlier version of this exact approach looked broken for long paragraphs, but the
  // real cause turned out to be unrelated: the browser's native "scroll focused element into
  // view" behavior was yanking the box to the bottom on click (now fixed via preventScroll +
  // pinning the hidden input's position). This measurement itself was fine all along.
  const [lineOfChar, setLineOfChar] = useState([])

  useLayoutEffect(() => {
    const els = charRefs.current
    if (!els.length) return
    const tops = els.map(el => (el ? el.offsetTop : null))
    const uniqueTops = []
    tops.forEach(t => { if (t != null && !uniqueTops.includes(t)) uniqueTops.push(t) })
    uniqueTops.sort((a, b) => a - b)
    setLineOfChar(tops.map(t => (t == null ? 0 : uniqueTops.indexOf(t))))
  }, [targetText, charStates.length, remeasureTick])

  const currentLine = lineOfChar[caretIndex] ?? lineOfChar[Math.max(0, caretIndex - 1)] ?? 0
  // Defensive: if measurement hasn't caught up to the current text yet, don't blur anything
  // rather than blurring everything (an empty/short array would make every lookup fail).
  const linesMeasured = lineOfChar.length >= targetText.length && targetText.length > 0

  // Scroll-follow: keep whichever character is at the caret centered in the box. Explicitly
  // targeting viewportRef (the actual .type-surface container) and computing scrollTop from
  // real geometry (offsetTop/offsetHeight/clientHeight) avoids relying on scrollIntoView's
  // automatic "nearest scrollable ancestor" detection, which is inconsistent across browsers
  // when the container uses overflow:hidden instead of auto/scroll — that's why the box
  // wasn't advancing as typing reached the bottom of the visible area.
  function scrollToCaret(behavior = 'auto') {
    const el = charRefs.current[caretIndex] || charRefs.current[Math.max(0, caretIndex - 1)]
    const container = viewportRef.current
    if (!el || !container) return
    const target = Math.max(0, el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2)
    if (behavior === 'smooth' && container.scrollTo) container.scrollTo({ top: target, behavior: 'smooth' })
    else container.scrollTop = target
  }
  scrollToCaretRef.current = scrollToCaret

  useEffect(() => {
    scrollToCaret(testStarted ? 'smooth' : 'auto')
  }, [caretIndex, targetText])

  const focusMode = testStarted && !testFinished
  const progressText = mode === 'time'
    ? `${Math.max(0, timeDuration - secondsElapsed)}s`
    : mode === 'words'
      ? `${Math.min(caretIndex ? targetText.slice(0, caretIndex).split(' ').length : 0, wordCount)}/${wordCount}`
      : `${targetText.length ? Math.min(100, Math.round((caretIndex / targetText.length) * 100)) : 0}%`

  const words = targetText.split(' ')
  let charIdx = 0
  let elIdx = 0

  return (
    <>
      <AnimatePresence initial={false}>
        {!focusMode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="tool-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
                <div>
                  <div className="tool-crumb"><span className="cat">DEV</span><span className="num">CATALOG NO. 025</span></div>
                  <h1>Typing Tutor</h1>
                  <p>
                    Type fast, type clean, see exactly where you slow down.{' '}
                    <button type="button" className="info-btn" onClick={() => setShowInfo(true)}><Info size={13} /> How this works</button>
                  </p>
                  <div className="hero-badges">
                    <span className="hero-badge"><b>Live</b> WPM & accuracy</span>
                    <span className="hero-badge"><b>65+</b> rotating paragraphs</span>
                    <span className="hero-badge"><b>100%</b> client-side</span>
                  </div>
                </div>
                <CircularText text="TYPING.SYS • WPM ENGINE • " spinDuration={18} onHover="speedUp" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <DesktopOnlyGate toolName="Typing Tutor">
      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px 40px 100px' }}>

        <div className="type-rail-sticky">
          <div className="mode-rail">
            <button type="button" className={`btn-mini ${mode === 'time' ? 'accent' : ''}`} onClick={() => handleModeChange('time')}><Clock size={13} /> TIME</button>
            <button type="button" className={`btn-mini ${mode === 'words' ? 'accent' : ''}`} onClick={() => handleModeChange('words')}><Type size={13} /> WORDS</button>
            <button type="button" className={`btn-mini ${mode === 'quote' ? 'accent' : ''}`} onClick={() => handleModeChange('quote')}><BookOpen size={13} /> PARAGRAPH</button>
            <button type="button" className={`btn-mini ${mode === 'custom' ? 'accent' : ''}`} onClick={() => handleModeChange('custom')}><PenLine size={13} /> CUSTOM</button>

            <div className="rail-sep"></div>

            {mode === 'time' && [15, 30, 60].map(d => (
              <button key={d} type="button" className={`btn-mini ${timeDuration === d ? 'accent' : ''}`} onClick={() => handleTimeChange(d)}>{d}S</button>
            ))}
            {mode === 'words' && [25, 50, 100].map(w => (
              <button key={w} type="button" className={`btn-mini ${wordCount === w ? 'accent' : ''}`} onClick={() => handleWordsChange(w)}>{w}</button>
            ))}
            {(mode === 'time' || mode === 'words') && (
              <>
                <div className="rail-sep"></div>
                <button type="button" aria-pressed={punctuationEnabled} className={`btn-mini ${punctuationEnabled ? 'accent' : ''}`} onClick={togglePunctuation}>PUNCTUATION</button>
                <button type="button" aria-pressed={numbersEnabled} className={`btn-mini ${numbersEnabled ? 'accent' : ''}`} onClick={toggleNumbers}>NUMBERS</button>
              </>
            )}

            <div className="rail-sep"></div>
            <button type="button" className="btn-mini" onClick={() => setSoundEnabled(s => !s)}>{soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}</button>
            <button type="button" className="btn-mini" onClick={handleRestart}><RotateCcw size={13} /></button>
            <span className="tool-chip" style={{ marginLeft: 'auto' }}>{best > 0 ? `Best: ${best} WPM` : 'Best: — WPM'}</span>
          </div>

          <div className="stats-focus">
            <div className="cell"><span className="cell-label">WPM</span><span className="cell-num">{testFinished ? (finalStats?.net ?? 0) : (testStarted ? netWpm() : 0)}</span></div>
            <div className="cell"><span className="cell-label">Accuracy</span><span className="cell-num">{testFinished ? (finalStats?.acc ?? 100) : (testStarted ? accuracy() : 100)}%</span></div>
            <div className="cell"><span className="cell-label">{mode === 'time' ? 'Time Left' : 'Progress'}</span><span className="cell-num">{progressText}</span></div>
            <div className="cell"><span className="cell-label">Errors</span><span className="cell-num">{incorrectKeystrokes}</span></div>
          </div>
        </div>

        {mode === 'custom' && !testStarted && (
          <div className="panel-card" style={{ marginBottom: '20px' }}>
            <textarea
              id="customTextArea"
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              placeholder="Paste any paragraph, speech, or code snippet you want to practice typing…"
              maxLength={2000}
              style={{ width: '100%', minHeight: '100px', background: 'var(--bg)', border: '2px solid var(--fg)', color: 'var(--fg)', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', padding: '12px', marginBottom: '12px' }}
            />
            <button type="button" className="btn-primary inline" onClick={handleUseCustom}>USE THIS TEXT</button>
          </div>
        )}

        <div className="type-surface" ref={viewportRef} onClick={() => inputRef.current?.focus({ preventScroll: true })}>
          {!focused && !testFinished && (
            <div className="type-hint">Click here (or press any key) to <b>&nbsp;focus&nbsp;</b> and start typing.</div>
          )}
          <div className="text-display-viewport">
            <div className="text-display">
              {words.map((word, wi) => {
                const wordEl = (
                  <span key={wi}>
                    {Array.from(word).map((ch) => {
                      const i = charIdx++
                      const myElIdx = elIdx++
                      const isCurrent = i === caretIndex
                      const isCurrentLine = !linesMeasured || lineOfChar[i] === currentLine
                      return (
                        <span
                          key={i}
                          ref={el => { charRefs.current[myElIdx] = el }}
                          className={`char ${charStates[i] || ''} ${isCurrent ? 'current' : ''} ${!isCurrentLine ? 'blur-char' : ''}`}
                        >
                          {ch}
                        </span>
                      )
                    })}
                  </span>
                )
                const spaceI = charIdx
                const mySpaceElIdx = elIdx
                charIdx++; elIdx++
                const isCurrentSpace = spaceI === caretIndex
                const isCurrentLine = !linesMeasured || lineOfChar[spaceI] === currentLine
                return (
                  <span key={`w-${wi}`}>
                    {wordEl}
                    {wi < words.length - 1 && (
                      <span
                        ref={el => { charRefs.current[mySpaceElIdx] = el }}
                        className={`char space-char ${charStates[spaceI] || ''} ${isCurrentSpace ? 'current' : ''} ${!isCurrentLine ? 'blur-char' : ''}`}
                      > </span>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
          <input
            ref={inputRef}
            className="hidden-input"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onInput={handleInput}
            onKeyDown={handleKeyDownOnInput}
            onPaste={e => e.preventDefault()}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </div>

        <AnimatePresence>
          {testFinished && (
            <motion.div
              ref={resultsRef}
              className="panel-card"
              style={{ marginTop: '24px' }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="panel-head"><h2>Results</h2><span className="tool-chip">{{ time: `Time — ${timeDuration}s`, words: `Words — ${wordCount}`, quote: 'Paragraph', custom: 'Custom Text' }[mode]}</span></div>

              <div className="results-hero">
                <div className="result-kpi hi">
                  <div className="result-kpi-label">Net WPM</div>
                  <div className="result-kpi-num">{finalStats?.net ?? 0}</div>
                  <div className="result-kpi-sub" style={isNewBest ? { color: 'var(--cobalt)' } : {}}>{isNewBest ? <><Trophy size={11} style={{ display: 'inline' }} /> new best!</> : 'accounts for errors'}</div>
                </div>
                <div className="result-kpi"><div className="result-kpi-label">Raw WPM</div><div className="result-kpi-num">{finalStats?.raw ?? 0}</div><div className="result-kpi-sub">everything typed</div></div>
                <div className="result-kpi"><div className="result-kpi-label">Accuracy</div><div className="result-kpi-num">{finalStats?.acc ?? 100}%</div><div className="result-kpi-sub">{finalStats?.total ?? totalKeystrokes} keystrokes</div></div>
                <div className="result-kpi"><div className="result-kpi-label">Consistency</div><div className="result-kpi-num">{computeConsistency()}%</div><div className="result-kpi-sub">speed steadiness</div></div>
              </div>

              <WpmGraph samples={wpmSamples} />

              <div className="heatmap-wrap">
                <div>
                  <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '13px', textTransform: 'uppercase', marginBottom: '10px' }}>Most Missed Keys</h3>
                  <ul className="heat-list">
                    {Object.keys(mistakeMap).length === 0 ? <li className="heat-empty">No mistakes recorded — clean run.</li> :
                      Object.entries(mistakeMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([ch, count], i, arr) => (
                        <li className="heat-row" key={ch}>
                          <span className="heat-key">{ch === ' ' ? '␣' : ch}</span>
                          <span className="heat-bar-track"><span className="heat-bar-fill" style={{ width: `${(count / arr[0][1]) * 100}%` }}></span></span>
                          <span className="heat-count">{count}</span>
                        </li>
                      ))}
                  </ul>
                </div>
                <div>
                  <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '13px', textTransform: 'uppercase', marginBottom: '10px' }}>Session Summary</h3>
                  <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6 }}>
                    {correctKeystrokes} correct and {incorrectKeystrokes} incorrect keystrokes across {Math.max(secondsElapsed, 1)}s.{' '}
                    {computeConsistency() >= 80 ? 'Your pace stayed impressively steady throughout.' : computeConsistency() >= 55 ? 'Your pace wavered a little — worth another run to smooth it out.' : 'Your speed varied a lot during this run — try a shorter mode to build a steadier rhythm.'}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-primary inline" onClick={handleTryAgain}><RotateCcw size={14} /> TRY SAME TEXT</button>
                <button type="button" className="btn-mini" onClick={handleNewText}>NEW TEXT</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!focusMode && (
          <div className="panel-card" style={{ marginTop: '24px' }}>
            <div className="panel-head"><h2>Session History</h2><span className="tool-chip">Stored on this device</span></div>
            {history.length === 0 ? (
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)' }}>No tests yet — finish one above and it'll show up here.</p>
            ) : (
              <table className="history-table">
                <thead><tr><th>When</th><th>Mode</th><th>Net WPM</th><th>Accuracy</th><th>Consistency</th></tr></thead>
                <tbody>
                  {history.map((entry, i) => {
                    const d = new Date(entry.when)
                    const when = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                    return <tr key={i}><td>{when}</td><td>{entry.mode}</td><td>{entry.netWpm}</td><td>{entry.accuracy}%</td><td>{entry.consistency}%</td></tr>
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

      </main>
      </DesktopOnlyGate>

      <Toast message={toast} />

      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="How This Tool Works">
        <h4>The Numbers</h4>
        <ul>
          <li><strong>Net WPM</strong> = (correct characters ÷ 5) ÷ minutes elapsed — the industry-standard formula, penalizing errors.</li>
          <li><strong>Raw WPM</strong> = every character typed ÷ 5 ÷ minutes, mistakes included — shows your raw hand speed.</li>
          <li><strong>Accuracy</strong> = correct keystrokes ÷ total keystrokes, including ones you later backspaced over.</li>
          <li><strong>Consistency</strong> compares your WPM across 1-second samples — steadier pacing scores higher, even at the same average speed.</li>
        </ul>
        <h4>How It Works</h4>
        <ul>
          <li>Text renders as individual character elements so each one can be colored the instant you type it.</li>
          <li>A hidden input captures real keystrokes — this correctly handles Shift, Caps Lock, and your actual keyboard layout.</li>
          <li>Every test result stays in this browser's local storage — nothing is sent anywhere.</li>
          <li>Paragraphs are pulled from a rotating local pool so you rarely see the same one twice in a row.</li>
        </ul>
        <h4>Good to Know</h4>
        <p>Pasting into the typing box is disabled to keep results honest. Mistyped characters can be fixed with Backspace — accuracy still counts the original mistake. Press <strong>Tab</strong> anytime to instantly restart with fresh text. Your best Net WPM per mode is saved on this device.</p>
      </Modal>
    </>
  )
}

function WpmGraph({ samples }) {
  if (samples.length === 0) return <div className="graph-wrap" style={{ height: '160px' }} />
  const w = 600, h = 160, pad = 32
  const maxWpm = Math.max(...samples.map(s => s.wpm), 10)
  const maxT = Math.max(...samples.map(s => s.t), 1)
  const points = samples.map(s => `${pad + (s.t / maxT) * (w - pad - 10)},${h - pad - (s.wpm / maxWpm) * (h - pad * 2)}`).join(' ')

  const yTicks = 4
  const xTickEvery = Math.max(1, Math.ceil(maxT / 6))

  return (
    <div className="graph-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '160px' }}>
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const val = Math.round((maxWpm / yTicks) * (yTicks - i))
          const y = pad - 10 + (i / yTicks) * (h - pad - 10)
          return (
            <g key={i}>
              <line x1={pad} x2={w - 10} y1={y} y2={y} stroke="var(--fg)" strokeOpacity="0.12" strokeWidth="1" />
              <text x={pad - 8} y={y + 3} textAnchor="end" fontSize="10" fontFamily="JetBrains Mono, monospace" fill="var(--muted)">{val}</text>
            </g>
          )
        })}

        {Array.from({ length: Math.floor(maxT / xTickEvery) + 1 }, (_, i) => {
          const t = i * xTickEvery
          const x = pad + (t / maxT) * (w - pad - 10)
          return (
            <text key={i} x={x} y={h - 6} textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono, monospace" fill="var(--muted)">{t}s</text>
          )
        })}

        <text x={pad} y={14} fontSize="10" fontFamily="JetBrains Mono, monospace" fill="var(--cobalt)" fontWeight="700">WPM</text>

        <polyline points={points} fill="none" stroke="var(--cobalt)" strokeWidth="2.5" strokeLinejoin="round" />
        {samples.map((s, i) => (
          <circle key={i} cx={pad + (s.t / maxT) * (w - pad - 10)} cy={h - pad - (s.wpm / maxWpm) * (h - pad * 2)} r="3" fill="var(--acid)" />
        ))}
      </svg>
    </div>
  )
}

export default TypingTutor