import { useState, useEffect, useRef, useCallback } from 'react'
import { Laptop, Monitor, Volume2, VolumeX, Clipboard, RotateCcw, Info } from 'lucide-react'
import CircularText from '../components/CircularText'
import Modal from '../components/Modal'
import Toast from '../components/Toast'
import KeyCap from '../components/KeyCap'
import DesktopOnlyGate from '../components/DesktopOnlyGate'
import { playClick } from '../utils/keyboardSound'
import {
  FN_ROW, FN_ROW_EXTRA, MAIN_ROWS, NAV6, ARROWS, NUMPAD, RELABEL_CODES,
  detectOS, MODIFIER_LABELS, NEVER_PREVENT, STUCK_TIMEOUT_MS, STORAGE_KEY,
} from '../utils/keyboardData'

const OS = detectOS()
const OS_LABEL = { mac: 'macOS', windows: 'Windows', linux: 'Linux', other: 'Unknown' }[OS]

function KeyboardTester() {
  const [preset, setPreset] = useState('laptop')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [held, setHeld] = useState(new Set())
  const [tested, setTested] = useState(new Set())
  const [stuck, setStuck] = useState(new Set())
  const [maxRollover, setMaxRollover] = useState(0)
  const [layoutMap, setLayoutMap] = useState(null)
  const [toast, setToast] = useState(null)
  const [showInfo, setShowInfo] = useState(false)

  const stuckTimersRef = useRef({})
  const kbWrapRef = useRef(null)
  const kbSurfaceRef = useRef(null)
  const [unitPx, setUnitPx] = useState(40)

  // load persisted session
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw)
      if (Array.isArray(data.tested)) setTested(new Set(data.tested))
      if (typeof data.maxRollover === 'number') setMaxRollover(data.maxRollover)
      if (typeof data.soundEnabled === 'boolean') setSoundEnabled(data.soundEnabled)
      if (data.preset === 'full' || data.preset === 'laptop') setPreset(data.preset)
    } catch {}
  }, [])

  const persist = useCallback((patch) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const current = raw ? JSON.parse(raw) : {}
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }))
    } catch {}
  }, [])

  // real keyboard layout relabeling, where supported
  useEffect(() => {
    if (navigator.keyboard?.getLayoutMap) {
      navigator.keyboard.getLayoutMap().then(setLayoutMap).catch(() => {})
    }
  }, [])

  function labelFor(code, fallback) {
    const mod = MODIFIER_LABELS[OS][code]
    if (mod) return mod
    if (layoutMap && RELABEL_CODES.includes(code)) {
      const ch = layoutMap.get(code)
      if (ch && ch.length === 1) return ch.toUpperCase()
    }
    return fallback
  }

  // fit the keyboard's unit size to the available width
  const fitWidth = useCallback(() => {
    const wrap = kbWrapRef.current, surface = kbSurfaceRef.current
    if (!wrap || !surface) return
    const REF_U = 40
    surface.style.setProperty('--u', REF_U + 'px')
    const naturalWidth = surface.scrollWidth
    const availableWidth = wrap.clientWidth
    if (!naturalWidth || !availableWidth) return
    const scale = availableWidth / naturalWidth
    setUnitPx(Math.max(13, Math.min(72, REF_U * scale)))
  }, [])

  useEffect(() => {
    fitWidth()
    let t
    const onResize = () => { clearTimeout(t); t = setTimeout(fitWidth, 120) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fitWidth, preset])

  function allCodes() {
    const codes = new Set()
    ;[...FN_ROW, ...(preset === 'full' ? FN_ROW_EXTRA : [])].forEach(d => { if (d.c) codes.add(d.c) })
    MAIN_ROWS.flat().forEach(d => { if (d.c && !(d.laptopHide && preset !== 'full')) codes.add(d.c) })
    ARROWS.forEach(d => codes.add(d.c))
    if (preset === 'full') { NAV6.forEach(d => codes.add(d.c)); NUMPAD.forEach(d => codes.add(d.c)) }
    return codes
  }

  function shouldPreventDefault(e) {
    if (NEVER_PREVENT.has(e.code)) return false
    if (e.code === 'F5') return false
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyR') return false
    return true
  }

  const flagStuck = useCallback((code) => {
    setHeld(prevHeld => {
      if (!prevHeld.has(code)) return prevHeld // already released, timer was stale
      setStuck(prev => new Set(prev).add(code))
      return prevHeld
    })
  }, [])

  useEffect(() => {
    function onKeyDown(e) {
      const code = e.code
      const isKnown = MAIN_ROWS.flat().some(d => d.c === code) || FN_ROW.some(d => d.c === code) ||
        FN_ROW_EXTRA.some(d => d.c === code) || ARROWS.some(d => d.c === code) ||
        NAV6.some(d => d.c === code) || NUMPAD.some(d => d.c === code)
      if (!isKnown) return
      if (shouldPreventDefault(e)) e.preventDefault()

      setHeld(prev => {
        if (prev.has(code)) return prev
        const next = new Set(prev).add(code)
        setMaxRollover(m => Math.max(m, next.size))
        if (!e.repeat && soundEnabled) playClick()
        return next
      })

      clearTimeout(stuckTimersRef.current[code])
      stuckTimersRef.current[code] = setTimeout(() => flagStuck(code), STUCK_TIMEOUT_MS)
    }

    function onKeyUp(e) {
      const code = e.code
      clearTimeout(stuckTimersRef.current[code])
      delete stuckTimersRef.current[code]
      setHeld(prev => { if (!prev.has(code)) return prev; const n = new Set(prev); n.delete(code); return n })
      setStuck(prev => { if (!prev.has(code)) return prev; const n = new Set(prev); n.delete(code); return n })
      setTested(prev => {
        const next = new Set(prev).add(code)
        persist({ tested: Array.from(next) })
        return next
      })
    }

    function releaseAllHeld() {
      Object.values(stuckTimersRef.current).forEach(clearTimeout)
      stuckTimersRef.current = {}
      setHeld(new Set())
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseAllHeld)
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAllHeld() })
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseAllHeld)
    }
  }, [soundEnabled, flagStuck, persist])

  useEffect(() => { persist({ maxRollover }) }, [maxRollover, persist])

  function handlePresetChange(p) { setPreset(p); persist({ preset: p }) }
  function handleSoundToggle() { setSoundEnabled(s => { persist({ soundEnabled: !s }); return !s }) }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 1800) }

  function handleReset() {
    setTested(new Set()); setStuck(new Set()); setHeld(new Set()); setMaxRollover(0)
    Object.values(stuckTimersRef.current).forEach(clearTimeout)
    stuckTimersRef.current = {}
    persist({ tested: [], maxRollover: 0 })
    showToast('Session reset.')
  }

  async function handleCopyReport() {
    const codes = Array.from(allCodes())
    const untested = codes.filter(c => !tested.has(c))
    const lines = [
      'Keyboard Tester — Session Report',
      `OS detected: ${OS}`,
      `Layout preset: ${preset}`,
      `Keys tested: ${tested.size} / ${codes.length}`,
      `Max simultaneous keys (rollover): ${maxRollover}`,
      `Possibly stuck keys: ${stuck.size ? Array.from(stuck).join(', ') : 'none'}`,
      `Untested keys: ${untested.length ? untested.join(', ') : 'none — every key registered'}`,
    ]
    try { await navigator.clipboard.writeText(lines.join('\n')); showToast('Report copied to clipboard.') }
    catch { showToast('Could not copy — clipboard access blocked.') }
  }

  function renderKey(def) {
    if (def.gap) return <div key={`gap-${def.gap}-${Math.random()}`} className="kb-gap" style={{ '--n': def.gap }} />
    return (
      <KeyCap
        key={def.c}
        def={{ ...def, label: labelFor(def.c, def.l) }}
        held={held.has(def.c)}
        tested={tested.has(def.c) && !held.has(def.c)}
        stuck={stuck.has(def.c)}
      />
    )
  }

  const totalKeys = allCodes().size

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">DEV</span><span className="num">CATALOG NO. 023</span></div>
            <h1>Keyboard Tester</h1>
            <p>
              Press any key and watch it light up live.{' '}
              <button type="button" className="info-btn" onClick={() => setShowInfo(true)}><Info size={13} /> How this works</button>
            </p>
            <div className="tool-chips">
              <span className="tool-chip accent">CLIENT-SIDE</span>
              <span className="tool-chip">LIVE ROLLOVER (NKRO)</span>
            </div>
          </div>
          <CircularText text="HARDWARE.SYS • INPUT ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <DesktopOnlyGate toolName="Keyboard Tester">
      <main style={{ maxWidth: '1300px', margin: '0 auto', padding: '44px 40px 100px' }}>
        <div className="panel-card">

          <div className="rail">
            <div className="rail-left">
              <span className="rail-chip">OS <b>{OS_LABEL}</b></span>
              <span className="rail-chip subtle">100% client-side</span>
              <span className="rail-chip subtle">e.code · layout-independent</span>
            </div>
            <div className="rail-right">
              <button type="button" className={`btn-mini ${preset === 'laptop' ? 'accent' : ''}`} onClick={() => handlePresetChange('laptop')}><Laptop size={13} /> LAPTOP</button>
              <button type="button" className={`btn-mini ${preset === 'full' ? 'accent' : ''}`} onClick={() => handlePresetChange('full')}><Monitor size={13} /> FULL-SIZE</button>
              <button type="button" className="btn-mini" onClick={handleSoundToggle}>{soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />} SOUND</button>
              <button type="button" className="btn-mini" onClick={handleCopyReport}><Clipboard size={13} /> COPY REPORT</button>
              <button type="button" className="btn-mini" onClick={handleReset}><RotateCcw size={13} /> RESET</button>
            </div>
          </div>

          <div className="stats-strip-compact">
            <div className="stat-compact"><span className="stat-compact-label">Keys Tested</span><span className="stat-compact-num">{tested.size} / {totalKeys}</span></div>
            <div className="stat-compact"><span className="stat-compact-label">Currently Held</span><span className="stat-compact-num">{held.size}</span></div>
            <div className="stat-compact"><span className="stat-compact-label">Max Rollover</span><span className="stat-compact-num">{maxRollover}</span></div>
            <div className="stat-compact"><span className="stat-compact-label">Stuck Keys</span><span className={`stat-compact-num ${stuck.size > 0 ? 'warn' : ''}`}>{stuck.size}</span></div>
          </div>

          {stuck.size > 0 && (
            <div className="stuck-banner">
              <span>Possible stuck key(s): <strong>{Array.from(stuck).join(', ')}</strong> — held without releasing. Could indicate a hardware issue, or you switched windows mid-press.</span>
            </div>
          )}

          <div className="kb-wrap" ref={kbWrapRef}>
            <div className="kb-surface" ref={kbSurfaceRef} style={{ '--u': `${unitPx}px` }}>
              <div className="kb-block-main">
                <div className="kb-row">{FN_ROW.concat(preset === 'full' ? FN_ROW_EXTRA : []).map(renderKey)}</div>
                <div className="kb-main">{MAIN_ROWS.map((row, i) => <div className="kb-row" key={i}>{row.map(renderKey)}</div>)}</div>
              </div>
              <div className="kb-clusters">
                <div className="kb-side">
                  {preset === 'full' && <div className="kb-nav6">{NAV6.map(renderKey)}</div>}
                  <div className="kb-arrows">{ARROWS.map(renderKey)}</div>
                </div>
                {preset === 'full' && <div className="kb-numpad">{NUMPAD.map(renderKey)}</div>}
              </div>
            </div>
          </div>

          <div className="bottom-rail">
            <div className="legend">
              <span className="legend-item"><span className="legend-swatch inactive"></span> Untested</span>
              <span className="legend-item"><span className="legend-swatch pressed"></span> Pressed now</span>
              <span className="legend-item"><span className="legend-swatch tested"></span> Tested ✓</span>
              <span className="legend-item"><span className="legend-swatch stuck"></span> Possibly stuck</span>
            </div>
            <div className="held-strip">
              {held.size === 0
                ? <span className="held-empty">No keys currently held.</span>
                : Array.from(held).map(code => <span className="held-chip" key={code}>{labelFor(code, code)}</span>)}
            </div>
          </div>

        </div>
      </main>
      </DesktopOnlyGate>

      <Toast message={toast} />

      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="How This Tool Works">
        <h4>How It Works</h4>
        <ul>
          <li>Every keypress is captured with <strong>keydown</strong>/<strong>keyup</strong> listeners on the whole page.</li>
          <li>We read <strong>e.code</strong> (physical key position) instead of <strong>e.key</strong> (the character), so results don't change with language or Shift state.</li>
          <li>Your OS is guessed from <strong>navigator.userAgent</strong> to label Ctrl/Alt/Cmd correctly.</li>
          <li>Where supported (Chromium browsers), the Keyboard API reads your actual layout to relabel letter/number keys — otherwise we assume QWERTY.</li>
          <li>Nothing is sent anywhere — everything happens in this browser tab.</li>
        </ul>
        <h4>What We Can / Can't Detect</h4>
        <ul>
          <li>Whether a physical key registers a press and release at all.</li>
          <li>How many keys your keyboard can register at once (rollover / NKRO).</li>
          <li>Keys that stay "stuck" — pressed without a release signal.</li>
          <li>Your exact keyboard model, brand, or key count aren't exposed by browsers, for privacy.</li>
          <li>The Fn key is handled in hardware on most laptops and never reaches the browser.</li>
        </ul>
        <h4>Tips</h4>
        <p>If a key doesn't light up, try it a few times — some OS-reserved shortcuts can't be intercepted by any website. Switching apps mid-press can also make a key look "stuck" for a moment; that clears automatically.</p>
      </Modal>
    </>
  )
}

export default KeyboardTester