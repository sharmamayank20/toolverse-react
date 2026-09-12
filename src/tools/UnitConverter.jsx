import { useState, useEffect, useRef, useMemo } from 'react'
import CircularText from '../components/CircularText'
import { Repeat2, Star, Copy, Save, X, Search, Check, AlertCircle } from 'lucide-react'
import { unitData, regionalApprox, tempFloor, presetMap } from '../utils/unitData'

const LS_HISTORY = 'toolverse_converter_history'
const LS_FAVORITES = 'toolverse_converter_favorites'

function loadJSON(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}
function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }

function UnitConverter() {
  const [category, setCategory] = useState('Length')
  const [showFun, setShowFun] = useState(false)
  const [value, setValue] = useState('')
  const [fromUnit, setFromUnit] = useState('Meter')
  const [toUnit, setToUnit] = useState('Kilometer')
  const [precision, setPrecision] = useState(2)
  const [thousands, setThousands] = useState(false)
  const [autoCopy, setAutoCopy] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchTarget, setSearchTarget] = useState('from')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [history, setHistory] = useState(() => loadJSON(LS_HISTORY, []))
  const [favorites, setFavorites] = useState(() => loadJSON(LS_FAVORITES, []))
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [autoCopyFlash, setAutoCopyFlash] = useState(false)

  const scrollerRef = useRef(null)
  const searchWrapRef = useRef(null)

  const categories = Object.keys(unitData).filter(c => showFun || c !== 'Poetic Units')

  // close search results on outside click
  useEffect(() => {
    function handleClick(e) {
      if (!searchWrapRef.current?.contains(e.target)) setShowSearchResults(false)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  // drag-to-scroll + wheel-scroll on the category scroller
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    let isDown = false, startX = 0, startLeft = 0
    function onWheel(e) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollBy({ left: e.deltaY, behavior: 'smooth' }); e.preventDefault() }
    }
    function onDown(e) { isDown = true; startX = e.pageX; startLeft = el.scrollLeft; el.classList.add('dragging'); e.preventDefault() }
    function onUp() { isDown = false; el.classList.remove('dragging') }
    function onMove(e) { if (!isDown) return; el.scrollLeft = startLeft - (e.pageX - startX) }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    el.addEventListener('mouseleave', onUp)
    el.addEventListener('mousemove', onMove)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      el.removeEventListener('mouseleave', onUp)
      el.removeEventListener('mousemove', onMove)
    }
  }, [])

  function handleCategoryChange(cat) {
    setCategory(cat)
    const units = unitData[cat].units
    setFromUnit(units[0])
    setToUnit(units[Math.min(1, units.length - 1)])
    setSearchTerm(''); setShowSearchResults(false)
  }

  function convert(v, from, to) {
    const cat = unitData[category]
    return cat.fromBase[to](cat.toBase[from](v))
  }

  const validationError = useMemo(() => {
    if (category !== 'Temperature') return null
    const v = parseFloat(value)
    if (Number.isNaN(v)) return null
    const floor = tempFloor[fromUnit]
    if (v < floor - 1e-9) return `${fromUnit} can't go below ${floor}° — that's past absolute zero.`
    return null
  }, [category, value, fromUnit])

  const result = useMemo(() => {
    const v = parseFloat(value)
    if (value.trim() === '' || Number.isNaN(v) || validationError) return null
    const out = convert(v, fromUnit, toUnit)
    const pretty = out.toLocaleString('en-IN', { minimumFractionDigits: precision, maximumFractionDigits: precision, useGrouping: thousands })
    const notes = []
    if (regionalApprox[fromUnit]) notes.push(regionalApprox[fromUnit])
    if (regionalApprox[toUnit] && toUnit !== fromUnit) notes.push(regionalApprox[toUnit])
    return { pretty, sub: `${v} ${fromUnit} → ${toUnit}` + (notes.length ? `  •  ${notes.join(' ')}` : '') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, fromUnit, toUnit, precision, thousands, category, validationError])

  // "1 X = Y Z" reference rate, independent of whatever value is currently
  // typed — Temperature is deliberately excluded since it's an affine (not
  // purely multiplicative) conversion; "1°C = 33.8°F" would misleadingly
  // imply a ratio when the real relationship includes a fixed offset (0°C is
  // 32°F, not 0°F).
  const rate = useMemo(() => {
    if (category === 'Temperature') return null
    const out = convert(1, fromUnit, toUnit)
    return out.toLocaleString('en-IN', { maximumFractionDigits: 6, useGrouping: thousands })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUnit, toUnit, category, thousands])

  // Debounced: previously fired on every keystroke while typing a value
  // (each intermediate digit got written to the clipboard), which is both
  // wasteful and likely to clutter the OS clipboard history with values the
  // user never meant to copy. Now waits for a short pause before copying.
  useEffect(() => {
    if (!result || !autoCopy) return
    const timer = setTimeout(() => {
      navigator.clipboard?.writeText(result.pretty)
        .then(() => { setAutoCopyFlash(true); setTimeout(() => setAutoCopyFlash(false), 1200) })
        .catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [result, autoCopy])

  function commitHistory() {
    const v = parseFloat(value)
    if (Number.isNaN(v) || validationError) return
    const last = history[0]
    if (last && last.category === category && last.from === fromUnit && last.to === toUnit && String(last.value) === String(v)) return
    const pretty = convert(v, fromUnit, toUnit).toLocaleString('en-IN', { minimumFractionDigits: precision, maximumFractionDigits: precision, useGrouping: thousands })
    const next = [{ category, value: v, from: fromUnit, to: toUnit, result: pretty }, ...history].slice(0, 10)
    setHistory(next)
    saveJSON(LS_HISTORY, next)
  }

  function reloadHistoryItem(item) {
    handleCategoryChange(item.category)
    setTimeout(() => { setFromUnit(item.from); setToUnit(item.to); setValue(String(item.value)) }, 0)
  }

  const isFav = favorites.some(f => f.category === category && f.from === fromUnit && f.to === toUnit)
  function toggleFavorite() {
    let next
    if (isFav) next = favorites.filter(f => !(f.category === category && f.from === fromUnit && f.to === toUnit))
    else next = [{ category, from: fromUnit, to: toUnit }, ...favorites].slice(0, 12)
    setFavorites(next)
    saveJSON(LS_FAVORITES, next)
  }

  function removeFavorite(index, e) {
    e.stopPropagation()
    const next = favorites.filter((_, i) => i !== index)
    setFavorites(next)
    saveJSON(LS_FAVORITES, next)
  }

  function removeHistoryItem(index, e) {
    e.stopPropagation()
    const next = history.filter((_, i) => i !== index)
    setHistory(next)
    saveJSON(LS_HISTORY, next)
  }

  function applyPreset(code) {
    const preset = presetMap[code]
    if (!preset) return
    handleCategoryChange(preset.category)
    setTimeout(() => { setFromUnit(preset.from); setToUnit(preset.to) }, 0)
  }

  function handleSwap() { const a = fromUnit; setFromUnit(toUnit); setToUnit(a) }

  const searchMatches = searchTerm.trim()
    ? unitData[category].units.filter(u => u.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : []

  function selectSearchResult(u) {
    if (searchTarget === 'to') setToUnit(u); else setFromUnit(u)
    setSearchTerm(''); setShowSearchResults(false)
  }

  async function handleCopy() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.pretty)
      setCopied(true); setCopyError(false)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopyError(true)
      setTimeout(() => setCopyError(false), 2000)
    }
  }
  function handleSaveTxt() {
    if (!result) return
    const blob = new Blob([`${result.pretty} (${result.sub})`], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'conversion.txt'; a.click()
  }

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">DEV</span><span className="num">CATALOG NO. 003</span></div>
            <h1>Converter</h1>
            <p>Convert units across 13+ categories with presets, favorites, and history.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">CLIENT-SIDE</span>
              <span className="tool-chip">{unitData[category].units.length} UNITS</span>
            </div>
          </div>
          <CircularText text="CONVERTER.SYS • 13 CATEGORIES • " spinDuration={20} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>
        <div className="tool-workbench">

          <div className="panel-card">
            <div className="panel-head"><h2>Settings</h2></div>

            <label className="field-label" style={{ display: 'block', marginBottom: '8px' }}>Conversion Type</label>
            <div className="category-scroller" ref={scrollerRef}>
              {categories.map(cat => (
                <button key={cat} type="button" className={`cat-seg ${category === cat ? 'on' : ''}`} onClick={() => handleCategoryChange(cat)}>{cat}</button>
              ))}
            </div>

            <div className="field-row">
              <div className="field">
                <label>Value</label>
                <input type="number" value={value} onChange={e => setValue(e.target.value)} onBlur={commitHistory} placeholder="Enter value" />
              </div>
              <div className="field">
                <label>Precision: {precision}</label>
                <input type="range" min="0" max="8" value={precision} onChange={e => setPrecision(+e.target.value)} />
              </div>
            </div>

            {validationError && <p className="error-text">{validationError}</p>}

            <div className="field-row">
              <div className="field">
                <label>From</label>
                <select value={fromUnit} onChange={e => { setFromUnit(e.target.value); commitHistory() }}>
                  {unitData[category].units.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="field">
                <label>To</label>
                <select value={toUnit} onChange={e => { setToUnit(e.target.value); commitHistory() }}>
                  {unitData[category].units.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div className="search-wrap" ref={searchWrapRef} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="field-label" style={{ marginBottom: 0 }}>Search Units</label>
            <div className="target-toggle">
            <button type="button" className={`target-btn ${searchTarget === 'from' ? 'on' : ''}`} onClick={() => setSearchTarget('from')}>→ From</button>
            <button type="button" className={`target-btn ${searchTarget === 'to' ? 'on' : ''}`} onClick={() => setSearchTarget('to')}>→ To</button>
            </div>
            </div>

          <div className="search-input-wrap">
            <Search size={15} className="search-icon" />
    <input
      type="text"
      value={searchTerm}
      onChange={e => { setSearchTerm(e.target.value); setShowSearchResults(true) }}
      onFocus={() => setShowSearchResults(true)}
      onKeyDown={e => {
        if (e.key === 'Escape') { setSearchTerm(''); setShowSearchResults(false) }
        else if (e.key === 'Enter' && searchMatches.length > 0) selectSearchResult(searchMatches[0])
      }}
      placeholder="Search units, e.g. 'foot' or 'kelvin'"
    />
    {searchTerm && (
      <button type="button" className="search-clear-btn" onClick={() => { setSearchTerm(''); setShowSearchResults(false) }}>
        <X size={15} />
      </button>
    )}
  </div>

  {showSearchResults && searchTerm.trim() && (
    <div className="search-results">
      {searchMatches.length === 0
        ? <div className="search-empty">No matching units in this category.</div>
        : searchMatches.map(u => <button key={u} type="button" className="search-result" onClick={() => selectSearchResult(u)}>{u}</button>)}
    </div>
  )}
</div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <button type="button" className="btn-mini" onClick={handleSwap}><Repeat2 size={13} /> SWAP UNITS</button>
              {Object.keys(presetMap).map(code => (
                <button key={code} type="button" className="chip-btn" onClick={() => applyPreset(code)}>{code.replace('->', ' → ')}</button>
              ))}
            </div>

            <label className="field-label" style={{ display: 'block', marginBottom: '8px' }}>Favorites</label>
            <div className="chip-row" style={{ marginBottom: '16px' }}>
              {favorites.length === 0 ? <span className="chip-empty">No favorites yet — save one below</span> :
                favorites.map((f, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    <button type="button" className="chip-btn" onClick={() => { handleCategoryChange(f.category); setTimeout(() => { setFromUnit(f.from); setToUnit(f.to) }, 0) }}>{f.from} → {f.to}</button>
                    <button type="button" className="btn-mini" style={{ padding: '4px' }} onClick={e => removeFavorite(i, e)} aria-label={`Remove favorite ${f.from} to ${f.to}`}><X size={11} /></button>
                  </span>
                ))}
            </div>
            <button type="button" className="btn-mini" onClick={toggleFavorite} style={{ marginBottom: '20px' }}>
              <Star size={13} fill={isFav ? 'var(--acid)' : 'none'} /> {isFav ? 'SAVED' : 'SAVE CURRENT'}
            </button>

            <label className="toggle-switch"><input type="checkbox" checked={thousands} onChange={e => setThousands(e.target.checked)} /><span className="track"></span>Thousand separators</label>
            <label className="toggle-switch"><input type="checkbox" checked={autoCopy} onChange={e => setAutoCopy(e.target.checked)} /><span className="track"></span>Auto copy on change</label>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={showFun}
                onChange={e => {
                  setShowFun(e.target.checked)
                  if (!e.target.checked && category === 'Poetic Units') handleCategoryChange('Length')
                }}
              />
              <span className="track"></span>Show fun units (Poetic)
            </label>
          </div>

          <div className="panel-card">
            <div className="panel-head">
              <h2>Preview</h2>
              {autoCopyFlash && <span className="tool-chip accent">AUTO-COPIED</span>}
            </div>

            <div style={{ fontFamily: 'Anton, sans-serif', fontSize: '30px', marginBottom: '8px', wordBreak: 'break-word' }}>{result ? result.pretty : '—'}</div>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>{result ? result.sub : `0 ${category.toLowerCase()}`}</p>
            {rate && <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--muted)', marginBottom: '20px' }}>1 {fromUnit} = {rate} {toUnit}</p>}
            {!rate && <div style={{ marginBottom: '20px' }} />}

            <div className="field-row">
              <div className="kpi-tile"><span className="num">{unitData[category].units.length}</span><span className="label">Units</span></div>
              <div className="kpi-tile"><span className="num">{precision}</span><span className="label">Precision</span></div>
              <div className="kpi-tile"><span className="num">{history.length}</span><span className="label">Saved</span></div>
            </div>

            <div style={{ display: 'flex', gap: '10px', margin: '20px 0 8px' }}>
              <button type="button" className="btn-mini" onClick={handleCopy}>
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'COPIED' : 'COPY'}
              </button>
              <button type="button" className="btn-mini" onClick={handleSaveTxt}><Save size={13} /> SAVE .TXT</button>
            </div>
            {copyError && (
              <p style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--coral)', fontSize: '12px', marginBottom: '12px' }}>
                <AlertCircle size={13} /> Could not copy — select and copy manually.
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="field-label" style={{ marginBottom: 0 }}>Recent Conversions</label>
              <button type="button" className="btn-primary inline" onClick={() => { setHistory([]); saveJSON(LS_HISTORY, []) }}><X size={12} /> CLEAR</button>
            </div>
            <ul className="history-list">
              {history.length === 0
                ? <li className="chip-empty">No conversions yet</li>
                : history.map((item, i) => (
                  <li key={i} className="history-item" onClick={() => reloadHistoryItem(item)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span>{item.value} {item.from} → {item.result} {item.to}</span>
                    <button type="button" className="btn-mini" style={{ padding: '4px', flexShrink: 0 }} onClick={e => removeHistoryItem(i, e)} aria-label="Remove this history entry"><X size={11} /></button>
                  </li>
                ))}
            </ul>
          </div>

        </div>
      </main>
    </>
  )
}

export default UnitConverter