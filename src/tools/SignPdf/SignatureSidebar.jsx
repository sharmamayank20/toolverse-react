import { useState, useRef, useEffect } from 'react'
import { Type, PenTool, ImageUp, Stamp, Trash2 } from 'lucide-react'
import { textToDataUrl, generateStampDataUrl, validateSignatureImage } from '../../utils/signPdfHelpers'

const TABS = [
  { id: 'type', label: 'TYPE', icon: Type },
  { id: 'draw', label: 'DRAW', icon: PenTool },
  { id: 'upload', label: 'UPLOAD', icon: ImageUp },
  { id: 'stamp', label: 'STAMP', icon: Stamp },
]

const TYPE_FONTS = [
  { value: "'Dancing Script', cursive", label: 'Dancing Script' },
  { value: "'Pacifico', cursive", label: 'Pacifico' },
  { value: "'Caveat', cursive", label: 'Caveat' },
  { value: "'Great Vibes', cursive", label: 'Great Vibes' },
  { value: "'JetBrains Mono', monospace", label: 'Mono (plain)' },
]

const STAMP_PRESETS = ['APPROVED', 'REJECTED', 'CONFIDENTIAL', 'DRAFT', 'PAID', 'custom']
const STAMP_COLORS = [
  { value: '#c0392b', label: 'Red' },
  { value: '#1e6f46', label: 'Green' },
  { value: '#1a5276', label: 'Blue' },
  { value: '#2c2c2c', label: 'Black' },
]

// Debounces rapid input (typing, color picking) before regenerating a
// signature preview — avoids re-rendering a canvas on every keystroke.
function useDebouncedCallback(fn, ms) {
  const timerRef = useRef(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  return (...args) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fnRef.current(...args), ms)
  }
}

function SignatureSidebar({ onSignatureReady, onSignatureCleared }) {
  const [activeTab, setActiveTab] = useState('type')

  // Type tab
  const [typeText, setTypeText] = useState('')
  const [typeFont, setTypeFont] = useState(TYPE_FONTS[0].value)
  const [typeColor, setTypeColor] = useState('#1a1a2e')

  // Draw tab
  const drawPadRef = useRef(null)
  const drawColorRef = useRef('#1a1a2e')
  const [drawColor, setDrawColor] = useState('#1a1a2e')
  const drawingRef = useRef(false)
  const lastPosRef = useRef(null)
  const drawPadSizedRef = useRef(false)

  // Stamp tab
  const [stampPreset, setStampPreset] = useState('APPROVED')
  const [stampCustomText, setStampCustomText] = useState('')
  const [stampColor, setStampColor] = useState(STAMP_COLORS[0].value)

  useEffect(() => { drawColorRef.current = drawColor }, [drawColor])

  const debouncedTypeUpdate = useDebouncedCallback(async (text, font, color) => {
    if (!text.trim()) { onSignatureCleared(); return }
    const dataUrl = await textToDataUrl(text.trim(), font, color)
    onSignatureReady(dataUrl)
  }, 150)

  useEffect(() => {
    if (activeTab === 'type') debouncedTypeUpdate(typeText, typeFont, typeColor)
  }, [typeText, typeFont, typeColor, activeTab])

  const debouncedStampUpdate = useDebouncedCallback((preset, customText, color) => {
    const text = preset === 'custom' ? (customText.trim().toUpperCase() || 'STAMP') : preset
    onSignatureReady(generateStampDataUrl(text, color))
  }, 150)

  useEffect(() => {
    if (activeTab === 'stamp') debouncedStampUpdate(stampPreset, stampCustomText, stampColor)
  }, [stampPreset, stampCustomText, stampColor, activeTab])

  // devicePixelRatio alone (1 on plenty of desktop monitors) leaves the
  // pad's internal buffer no bigger than its on-screen CSS size — fine
  // until exactSizeBlob later scales the drawing up to fill a placement
  // box, at which point a 1x source turns blocky. This extra factor gives
  // the stroke real resolution to scale up from, independent of the
  // screen it was drawn on.
  const DRAW_PAD_OVERSAMPLE = 3

  function sizeDrawPad() {
    const pad = drawPadRef.current
    if (!pad) return
    const dpr = (window.devicePixelRatio || 1) * DRAW_PAD_OVERSAMPLE
    const rect = pad.getBoundingClientRect()
    const cssWidth = rect.width || pad.parentElement?.clientWidth || 260
    const cssHeight = rect.height || 150

    pad.width = cssWidth * dpr
    pad.height = cssHeight * dpr
    pad.style.width = `${cssWidth}px`
    pad.style.height = `${cssHeight}px`

    const ctx = pad.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    drawPadSizedRef.current = true
  }

  useEffect(() => {
    // The pad has zero size while its tab is hidden (display:none), so it
    // can only be sized correctly once the tab is actually visible.
    if (activeTab === 'draw' && !drawPadSizedRef.current) sizeDrawPad()
  }, [activeTab])

  function drawPos(e) {
    const rect = drawPadRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handleDrawPointerDown(e) {
    if (!drawPadSizedRef.current) sizeDrawPad()
    drawingRef.current = true
    lastPosRef.current = drawPos(e)
    drawPadRef.current.setPointerCapture(e.pointerId)
  }

  function handleDrawPointerMove(e) {
    if (!drawingRef.current) return
    const p = drawPos(e)
    const ctx = drawPadRef.current.getContext('2d')
    ctx.strokeStyle = drawColorRef.current
    ctx.beginPath()
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastPosRef.current = p
    updateDrawPreview()
  }

  const updateDrawPreview = useDebouncedCallback(() => {
    onSignatureReady(drawPadRef.current.toDataURL('image/png'))
  }, 150)

  function handleDrawPointerUp() {
    if (drawingRef.current) updateDrawPreview()
    drawingRef.current = false
  }

  function handleDrawClear() {
    const pad = drawPadRef.current
    const dpr = window.devicePixelRatio || 1
    const ctx = pad.getContext('2d')
    ctx.clearRect(0, 0, pad.width / dpr, pad.height / dpr)
    onSignatureCleared()
  }

  async function handleImageFile(file) {
    const check = validateSignatureImage(file)
    if (!check.ok) return
    const reader = new FileReader()
    reader.onload = () => onSignatureReady(reader.result)
    reader.readAsDataURL(file)
  }

  function handleTabChange(tabId) {
    setActiveTab(tabId)
  }

  return (
    <div className="panel-card">
      <div className="panel-head"><h3>Signature</h3></div>

      <div className="esig-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`btn-mini ${activeTab === tab.id ? 'pressed' : ''}`}
            aria-pressed={activeTab === tab.id}
            onClick={() => handleTabChange(tab.id)}
          >
            <tab.icon size={13} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'type' && (
        <div>
          <div className="field" style={{ marginBottom: '14px' }}>
            <label>Signature text</label>
            <input type="text" value={typeText} onChange={e => setTypeText(e.target.value)} placeholder="e.g., Tejas Parmar" maxLength={60} />
          </div>
          <div className="field" style={{ marginBottom: '14px' }}>
            <label>Style</label>
            <select value={typeFont} onChange={e => setTypeFont(e.target.value)}>
              {TYPE_FONTS.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: '14px' }}>
            <label>Color</label>
            <input type="color" value={typeColor} onChange={e => setTypeColor(e.target.value)} style={{ height: '40px', padding: '4px' }} />
          </div>
        </div>
      )}

      {activeTab === 'draw' && (
        <div>
          <p className="whisper-line" style={{ marginBottom: '10px' }}>Draw with your mouse or finger.</p>
          <canvas
            ref={drawPadRef}
            className="esig-draw-pad"
            onPointerDown={handleDrawPointerDown}
            onPointerMove={handleDrawPointerMove}
            onPointerUp={handleDrawPointerUp}
            onPointerLeave={handleDrawPointerUp}
            onPointerCancel={handleDrawPointerUp}
          />
          <div className="field" style={{ marginBottom: '14px' }}>
            <label>Ink color</label>
            <input type="color" value={drawColor} onChange={e => setDrawColor(e.target.value)} style={{ height: '40px', padding: '4px' }} />
          </div>
          <button type="button" className="btn-mini" onClick={handleDrawClear}><Trash2 size={13} /> CLEAR</button>
        </div>
      )}

      {activeTab === 'upload' && (
        <div>
          <div
            className="dropzone"
            onClick={() => document.getElementById('sigImageInput').click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleImageFile(e.dataTransfer.files[0]) }}
            style={{ textAlign: 'center', minHeight: '160px' }}
          >
            <div className="dropzone-content">
              <div className="upload-icon-wrap"><ImageUp size={24} /></div>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>Drag & drop an image</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--muted)' }}>
                or <span style={{ color: 'var(--cobalt)', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 700 }}>click to browse</span>
              </div>
              <div className="format-pills">
                <span className="format-pill">PNG</span>
                <span className="format-pill">JPG</span>
              </div>
            </div>
            <input id="sigImageInput" type="file" accept="image/png,image/jpeg" hidden onChange={e => e.target.files[0] && handleImageFile(e.target.files[0])} />
          </div>
          <p className="whisper-line" style={{ marginTop: '10px' }}>Transparent PNG recommended.</p>
        </div>
      )}

      {activeTab === 'stamp' && (
        <div>
          <div className="field" style={{ marginBottom: '14px' }}>
            <label>Preset</label>
            <select value={stampPreset} onChange={e => setStampPreset(e.target.value)}>
              {STAMP_PRESETS.map(p => <option key={p} value={p}>{p === 'custom' ? 'Custom text…' : p}</option>)}
            </select>
          </div>
          {stampPreset === 'custom' && (
            <div className="field" style={{ marginBottom: '14px' }}>
              <label>Custom text</label>
              <input type="text" value={stampCustomText} onChange={e => setStampCustomText(e.target.value)} maxLength={24} placeholder="e.g., REVIEWED" />
            </div>
          )}
          <div className="field" style={{ marginBottom: '14px' }}>
            <label>Stamp color</label>
            <select value={stampColor} onChange={e => setStampColor(e.target.value)}>
              {STAMP_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

export default SignatureSidebar