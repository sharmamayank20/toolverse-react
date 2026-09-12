import { useState, useRef, useEffect } from 'react'
import { removeBackground } from '@imgly/background-removal'
import {
  Image as ImageIcon, Sparkles, Download, X, CheckCircle2, AlertCircle,
  Loader2, ArrowDownToLine, ShieldCheck, Upload, Eraser, Brush, Undo2, RefreshCw, GitCompare, Check
} from 'lucide-react'
import CircularText from '../components/CircularText'
import { motion, AnimatePresence } from 'framer-motion'

const MAX_SIZE = 10 * 1024 * 1024
const VALID_TYPES = ['image/jpeg', 'image/jpg', 'image/png']
const MAX_UNDO_STEPS = 15
const SWATCHES = [
  { id: 'transparent', label: 'None' },
  { id: '#FFFFFF', label: 'White' },
  { id: '#000000', label: 'Black' },
  { id: '#FF0000', label: 'Red' },
  { id: '#00FF00', label: 'Green' },
  { id: '#0000FF', label: 'Blue' },
]
// Exposed as a real choice instead of the hardcoded 'medium' the legacy
// version shipped with — same three models the library already offers.
const QUALITY_OPTIONS = [
  { id: 'isnet_quint8', label: 'Fast' },
  { id: 'isnet_fp16', label: 'Balanced' },
  { id: 'isnet', label: 'Best' },
]

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`
}

// Paints one circular, soft-edged stamp directly into the canvas's pixel data.
// 'erase' fades alpha toward 0; 'restore' blends the original (full-opacity)
// pixel back in — both use the same falloff curve so strokes feel consistent.
// Only reads/writes the stamp's bounding box, not the whole canvas, so this
// stays fast even on large photos.
function paintStamp(ctx, cx, cy, radius, mode, originalData, canvasWidth, canvasHeight) {
  const x0 = Math.max(0, Math.floor(cx - radius))
  const y0 = Math.max(0, Math.floor(cy - radius))
  const x1 = Math.min(canvasWidth, Math.ceil(cx + radius))
  const y1 = Math.min(canvasHeight, Math.ceil(cy + radius))
  const w = x1 - x0, h = y1 - y0
  if (w <= 0 || h <= 0) return

  const imgData = ctx.getImageData(x0, y0, w, h)
  const data = imgData.data
  const featherStart = radius * 0.7

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x0 + x, py = y0 + y
      const dx = px - cx, dy = py - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > radius) continue
      const strength = dist > featherStart ? 1 - (dist - featherStart) / (radius - featherStart) : 1
      const idx = (y * w + x) * 4

      if (mode === 'erase') {
        data[idx + 3] = Math.round(data[idx + 3] * (1 - strength))
      } else {
        const srcIdx = (py * canvasWidth + px) * 4
        data[idx] = Math.round(data[idx] * (1 - strength) + originalData.data[srcIdx] * strength)
        data[idx + 1] = Math.round(data[idx + 1] * (1 - strength) + originalData.data[srcIdx + 1] * strength)
        data[idx + 2] = Math.round(data[idx + 2] * (1 - strength) + originalData.data[srcIdx + 2] * strength)
        data[idx + 3] = Math.round(data[idx + 3] * (1 - strength) + originalData.data[srcIdx + 3] * strength)
      }
    }
  }
  ctx.putImageData(imgData, x0, y0)
}

function BackgroundRemover() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [originalURL, setOriginalURL] = useState(null)
  const [processedURL, setProcessedURL] = useState(null)

  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState({ msg: 'Upload an image to begin background removal.', type: 'idle' })

  const [bgType, setBgType] = useState('color') // 'color' | 'image'
  const [bgColor, setBgColor] = useState('transparent')
  const [bgImageURL, setBgImageURL] = useState(null)
  const [quality, setQuality] = useState('isnet_fp16')
  const [sliderValue, setSliderValue] = useState(50)
  const [dragging, setDragging] = useState(false)

  // Touch-up: 'compare' shows the before/after slider; 'brush' lets the user
  // paint directly on the result to restore or erase areas by hand.
  const [editMode, setEditMode] = useState('compare')
  const [brushMode, setBrushMode] = useState('erase') // 'erase' | 'restore'
  const [brushSize, setBrushSize] = useState(40) // 1–100 scale, resolved to real px against image size
  const [canUndo, setCanUndo] = useState(false)
  const [cursorPos, setCursorPos] = useState(null) // client-space, for the live brush-size preview ring
  const [aspectRatio, setAspectRatio] = useState(4 / 3) // matched to the real photo once loaded

  const dragCounterRef = useRef(0)
  const bgFileInputRef = useRef(null)
  const isMountedRef = useRef(true)
  const resultCanvasRef = useRef(null)
  const originalImageDataRef = useRef(null)
  const undoStackRef = useRef([])
  const isPaintingRef = useRef(false)
  const lastPointRef = useRef(null)

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  // Object URLs aren't revoked by the browser automatically — in a static
  // multi-page site this barely matters (full reload between tools), but
  // this is now a persistent SPA, so stale URLs from a previous image would
  // otherwise leak for the life of the tab.
  function revokeIfBlobURL(url) {
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
  }

  function handleFile(file) {
    if (!file) return
    if (!VALID_TYPES.includes(file.type)) {
      setStatus({ msg: 'Invalid file type. Please upload a JPG or PNG image.', type: 'error' })
      return
    }
    if (file.size > MAX_SIZE) {
      setStatus({ msg: 'File exceeds 10 MB.', type: 'error' })
      return
    }
    revokeIfBlobURL(originalURL)
    revokeIfBlobURL(processedURL)
    setSelectedFile(file)
    setOriginalURL(URL.createObjectURL(file))
    setProcessedURL(null)
    setProgress(0)
    setStatus({ msg: `Image loaded: ${file.name}`, type: 'idle' })
  }

  function handleBgImageFile(file) {
    if (!file) return
    if (!VALID_TYPES.includes(file.type)) { setStatus({ msg: 'Invalid background image type.', type: 'error' }); return }
    if (file.size > MAX_SIZE) { setStatus({ msg: 'Background image exceeds 10 MB.', type: 'error' }); return }
    revokeIfBlobURL(bgImageURL)
    setBgImageURL(URL.createObjectURL(file))
  }

  async function handleRemoveBackground() {
    if (!selectedFile || isProcessing) return
    setIsProcessing(true)
    setStatus({ msg: 'Removing background... this may take a few seconds.', type: 'loading' })
    setProgress(5)

    try {
      const blob = await removeBackground(selectedFile, {
        model: quality,
        output: { format: 'image/png', quality: 1 },
        progress: (key, current, total) => {
          if (!isMountedRef.current) return
          const pct = total ? Math.round((current / total) * 100) : 0
          if (key.startsWith('fetch:')) {
            setStatus({ msg: `Downloading AI model (first time only)... ${pct}%`, type: 'loading' })
            setProgress(5 + pct * 0.55) // 5–60%
          } else if (key.startsWith('compute:')) {
            setStatus({ msg: 'Removing background...', type: 'loading' })
            setProgress(60 + pct * 0.35) // 60–95%
          }
        },
      })
      if (!isMountedRef.current) return

      revokeIfBlobURL(processedURL)
      setProcessedURL(URL.createObjectURL(blob))
      setProgress(100)
      setSliderValue(50)
      setStatus({ msg: 'Background removed successfully.', type: 'success' })
    } catch (err) {
      if (!isMountedRef.current) return
      console.error('Background removal error:', err)
      setStatus({ msg: `Error: ${err.message}`, type: 'error' })
      setProgress(0)
    } finally {
      if (isMountedRef.current) setIsProcessing(false)
    }
  }

  function handleDownload() {
    const canvas = resultCanvasRef.current
    if (!canvas) return
    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `removed-bg-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
      setStatus({ msg: 'Downloaded transparent PNG.', type: 'success' })
    }, 'image/png')
  }

  // Once a result exists, load both images (at their real pixel resolution)
  // into the editable canvas and grab a full-opacity copy of the original's
  // pixel data — that's the source the "restore" brush blends back in.
  useEffect(() => {
    if (!processedURL || !originalURL) return
    let cancelled = false

    Promise.all([
      new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = originalURL }),
      new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = processedURL }),
    ]).then(([origImg, resultImg]) => {
      if (cancelled || !isMountedRef.current) return
      const canvas = resultCanvasRef.current
      if (!canvas) return

      const w = resultImg.naturalWidth, h = resultImg.naturalHeight
      canvas.width = w
      canvas.height = h
      setAspectRatio(w / h)
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(resultImg, 0, 0, w, h)

      const origCanvas = document.createElement('canvas')
      origCanvas.width = w
      origCanvas.height = h
      const origCtx = origCanvas.getContext('2d')
      // Original may differ slightly in size from the processed output in rare
      // cases — draw it stretched to the same dimensions so brush sampling
      // always lines up pixel-for-pixel with the canvas we're painting on.
      origCtx.drawImage(origImg, 0, 0, w, h)
      originalImageDataRef.current = origCtx.getImageData(0, 0, w, h)

      undoStackRef.current = []
      setCanUndo(false)
      setEditMode('compare')
    }).catch(err => console.error('Failed to load images for editing:', err))

    return () => { cancelled = true }
  }, [processedURL, originalURL])

  function getCanvasPoint(e) {
    const canvas = resultCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY, clientX, clientY }
  }

  function currentBrushRadius() {
    const canvas = resultCanvasRef.current
    if (!canvas) return 20
    const minDim = Math.min(canvas.width, canvas.height)
    // 1–100 slider maps to roughly 0.5%–20% of the image's shorter side, so
    // the brush feels the same relative size on a phone photo or a DSLR shot.
    return minDim * (0.005 + (brushSize / 100) * 0.195)
  }

  function pushUndoSnapshot() {
    const canvas = resultCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height)
    undoStackRef.current.push(snapshot)
    if (undoStackRef.current.length > MAX_UNDO_STEPS) undoStackRef.current.shift()
    setCanUndo(true)
  }

  function handlePointerDown(e) {
    if (editMode !== 'brush') return
    const canvas = resultCanvasRef.current
    const point = getCanvasPoint(e)
    if (!canvas || !point || !originalImageDataRef.current) return
    e.preventDefault()
    pushUndoSnapshot()
    isPaintingRef.current = true
    lastPointRef.current = point
    const ctx = canvas.getContext('2d')
    paintStamp(ctx, point.x, point.y, currentBrushRadius(), brushMode, originalImageDataRef.current, canvas.width, canvas.height)
  }

  function handlePointerMove(e) {
    if (editMode === 'brush') setCursorPos(getCanvasPoint(e))
    if (!isPaintingRef.current) return
    const canvas = resultCanvasRef.current
    const point = getCanvasPoint(e)
    if (!canvas || !point) return
    e.preventDefault()
    const ctx = canvas.getContext('2d')
    const last = lastPointRef.current || point
    const radius = currentBrushRadius()
    // Stamp along the segment from the last point so fast strokes don't leave gaps.
    const dist = Math.hypot(point.x - last.x, point.y - last.y)
    const steps = Math.max(1, Math.ceil(dist / (radius * 0.35)))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      paintStamp(ctx, last.x + (point.x - last.x) * t, last.y + (point.y - last.y) * t, radius, brushMode, originalImageDataRef.current, canvas.width, canvas.height)
    }
    lastPointRef.current = point
  }

  function handlePointerUp() {
    isPaintingRef.current = false
    lastPointRef.current = null
  }

  function handleUndo() {
    const canvas = resultCanvasRef.current
    const snapshot = undoStackRef.current.pop()
    if (!canvas || !snapshot) return
    canvas.getContext('2d').putImageData(snapshot, 0, 0)
    setCanUndo(undoStackRef.current.length > 0)
  }

  function handleResetEdits() {
    const canvas = resultCanvasRef.current
    if (!canvas || !processedURL) return
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      undoStackRef.current = []
      setCanUndo(false)
    }
    img.src = processedURL
  }

  function handleReset() {
    revokeIfBlobURL(originalURL)
    revokeIfBlobURL(processedURL)
    revokeIfBlobURL(bgImageURL)
    setSelectedFile(null); setOriginalURL(null); setProcessedURL(null)
    setBgType('color'); setBgColor('transparent'); setBgImageURL(null)
    setSliderValue(50); setProgress(0); setEditMode('compare')
    setAspectRatio(4 / 3)
    originalImageDataRef.current = null
    undoStackRef.current = []
    setCanUndo(false)
    setStatus({ msg: 'Upload an image to begin background removal.', type: 'idle' })
  }

  // Style applied behind the transparent result canvas, so the preview shows
  // how it'd look against a background — the downloaded PNG is unaffected
  // and always keeps true transparency regardless of this choice.
  const afterLayerStyle = bgType === 'image' && bgImageURL
    ? { backgroundImage: `url(${bgImageURL})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : bgType === 'color' && bgColor !== 'transparent'
      ? { backgroundColor: bgColor }
      : {}
  const showCheckerboard = bgType === 'color' && bgColor === 'transparent'

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">MEDIA</span><span className="num">CATALOG NO. 027</span></div>
            <h1>Background Remover</h1>
            <p>AI-powered background removal — drop an image and get a clean, transparent PNG in seconds, entirely in your browser.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">CLIENT-SIDE</span>
              <span className="tool-chip">UP TO 10MB</span>
              <span className="tool-chip">PNG OUTPUT</span>
            </div>
          </div>
          <CircularText text="VISION.SYS • ISNET ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>
        <div className="tool-workbench">

          <div className="panel-card">
            <div className="panel-head">
              <h2>Upload Image</h2>
              <span className="tool-chip accent">AI POWERED</span>
            </div>

            {!selectedFile ? (
              <>
                <div
                  className={`dropzone ${dragging ? 'drag' : ''}`}
                  onClick={() => document.getElementById('bgRemoveFileInput').click()}
                  onDragEnter={e => { e.preventDefault(); dragCounterRef.current += 1; setDragging(true) }}
                  onDragOver={e => e.preventDefault()}
                  onDragLeave={e => { e.preventDefault(); dragCounterRef.current -= 1; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragging(false) } }}
                  onDrop={e => { e.preventDefault(); dragCounterRef.current = 0; setDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
                  style={{ textAlign: 'center' }}
                >
                  <div className="dropzone-content">
                    <div className="upload-icon-wrap"><ImageIcon size={28} /></div>
                    <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', marginBottom: '6px' }}>Drag & drop an image</div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)' }}>
                      or <span style={{ color: 'var(--cobalt)', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 700 }}>click to browse</span>
                    </div>
                    <div className="format-pills">
                      <span className="format-pill">JPG</span>
                      <span className="format-pill">PNG</span>
                      <span className="format-pill size">≤ 10MB</span>
                    </div>
                  </div>
                  <AnimatePresence>
                    {dragging && (
                      <motion.div className="drop-overlay" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
                        <div className="drop-overlay-icon"><ArrowDownToLine size={26} /></div>
                        <div className="drop-overlay-text">Drop to upload</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <input id="bgRemoveFileInput" type="file" accept="image/jpeg,image/jpg,image/png" hidden onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
                </div>
                <div className="privacy-badge">
                  <ShieldCheck size={22} />
                  <span>Runs entirely on your device — the AI model downloads once and your images never leave your browser.</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ border: '2px solid var(--fg)', background: 'var(--bg)', padding: '10px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <img src={originalURL} alt="Selected" style={{ width: '56px', height: '56px', objectFit: 'cover', border: '2px solid var(--fg)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedFile.name}</div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--muted)' }}>{formatFileSize(selectedFile.size)}</div>
                  </div>
                  <button type="button" className="btn-mini" onClick={handleReset} disabled={isProcessing}><X size={13} /> CHANGE</button>
                </div>

                <div className="field" style={{ marginBottom: '16px' }}>
                  <label>Model Quality</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {QUALITY_OPTIONS.map(q => (
                      <button
                        key={q.id}
                        type="button"
                        className={`btn-mini ${quality === q.id ? 'bgremove-pressed' : ''}`}
                        style={{ flex: 1, justifyContent: 'center' }}
                        onClick={() => setQuality(q.id)}
                        disabled={isProcessing}
                        aria-pressed={quality === q.id}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field" style={{ marginBottom: '16px' }}>
                  <label>Preview Background</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <button type="button" className={`btn-mini ${bgType === 'color' ? 'bgremove-pressed' : ''}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setBgType('color')} aria-pressed={bgType === 'color'}>SOLID COLOR</button>
                    <button type="button" className={`btn-mini ${bgType === 'image' ? 'bgremove-pressed' : ''}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setBgType('image')} aria-pressed={bgType === 'image'}>CUSTOM IMAGE</button>
                  </div>

                  {bgType === 'color' ? (
                    <div className="bgremove-swatch-row">
                      {SWATCHES.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          title={s.label}
                          aria-label={s.label}
                          aria-pressed={bgColor === s.id}
                          className={`bgremove-swatch ${s.id === 'transparent' ? 'checkerboard' : ''} ${bgColor === s.id ? 'active' : ''}`}
                          style={s.id === 'transparent' ? undefined : { background: s.id }}
                          onClick={() => setBgColor(s.id)}
                        >
                          {bgColor === s.id && <span className="bgremove-swatch-check"><Check size={11} /></span>}
                        </button>
                      ))}
                      <button
                        type="button"
                        title="Custom color"
                        aria-label="Custom color"
                        className={`bgremove-swatch bgremove-swatch-custom ${!SWATCHES.some(s => s.id === bgColor) ? 'active' : ''}`}
                      >
                        <input type="color" value={bgColor.startsWith('#') ? bgColor : '#D7FF3E'} onChange={e => setBgColor(e.target.value)} aria-label="Pick custom background color" />
                        {!SWATCHES.some(s => s.id === bgColor) ? <span className="bgremove-swatch-check"><Check size={11} /></span> : <Upload size={14} />}
                      </button>
                    </div>
                  ) : (
                    bgImageURL ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img src={bgImageURL} alt="Custom background" style={{ width: '80px', height: '80px', objectFit: 'cover', border: '2px solid var(--fg)' }} />
                        <button type="button" className="btn-mini" style={{ position: 'absolute', top: '4px', right: '4px', padding: '4px' }} onClick={() => { revokeIfBlobURL(bgImageURL); setBgImageURL(null) }} aria-label="Remove background image"><X size={12} /></button>
                      </div>
                    ) : (
                      <button type="button" className="btn-mini" onClick={() => bgFileInputRef.current?.click()}>
                        <Upload size={13} /> CHOOSE FILE
                      </button>
                    )
                  )}
                  <input ref={bgFileInputRef} type="file" accept="image/jpeg,image/jpg,image/png" hidden onChange={e => e.target.files[0] && handleBgImageFile(e.target.files[0])} />
                  <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: 'var(--muted)', marginTop: '8px' }}>Preview only — the downloaded PNG always keeps true transparency.</p>
                </div>

                <button type="button" className="btn-primary" onClick={handleRemoveBackground} disabled={isProcessing}>
                  {isProcessing ? <Loader2 size={14} className="rotating-icon" /> : <Sparkles size={14} />}
                  {isProcessing ? 'Processing...' : 'Remove Background'}
                </button>
              </>
            )}
          </div>

          <div className="panel-card">
            <div className="panel-head">
              <h2>Result</h2>
              <span className="tool-chip">PNG</span>
            </div>

            <div className={`status-line ${status.type}`} style={{ marginBottom: '12px' }}>
              {status.type === 'loading' && <Loader2 size={14} className="rotating-icon" />}
              {status.type === 'success' && <CheckCircle2 size={14} />}
              {status.type === 'error' && <AlertCircle size={14} />}
              <span>{status.msg}</span>
            </div>
            <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${progress}%` }} /></div>

            {processedURL ? (
              <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <button type="button" className={`btn-mini ${editMode === 'compare' ? 'bgremove-pressed' : ''}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setEditMode('compare')} aria-pressed={editMode === 'compare'}>
                    <GitCompare size={13} /> COMPARE
                  </button>
                  <button type="button" className={`btn-mini ${editMode === 'brush' ? 'bgremove-pressed' : ''}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setEditMode('brush')} aria-pressed={editMode === 'brush'}>
                    <Brush size={13} /> TOUCH UP
                  </button>
                </div>

                <div
                  className="bgremove-compare"
                  style={{ cursor: editMode === 'brush' ? 'none' : 'default', aspectRatio }}
                  onMouseLeave={() => setCursorPos(null)}
                >
                  {editMode === 'compare' && (
                    <div className="bgremove-compare-layer">
                      <img src={originalURL} alt="Before" />
                      <span className="bgremove-compare-label" style={{ left: '8px' }}>BEFORE</span>
                    </div>
                  )}

                  <div
                    className="bgremove-compare-layer"
                    style={editMode === 'compare' ? { ...afterLayerStyle, clipPath: `inset(0 ${100 - sliderValue}% 0 0)` } : afterLayerStyle}
                  >
                    {showCheckerboard && <div className="bgremove-checkerboard-bg" />}
                    <canvas
                      ref={resultCanvasRef}
                      style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', touchAction: editMode === 'brush' ? 'none' : 'auto' }}
                      onMouseDown={handlePointerDown}
                      onMouseMove={handlePointerMove}
                      onMouseUp={handlePointerUp}
                      onTouchStart={handlePointerDown}
                      onTouchMove={handlePointerMove}
                      onTouchEnd={handlePointerUp}
                    />
                    {editMode === 'compare' && <span className="bgremove-compare-label" style={{ right: '8px' }}>AFTER</span>}
                  </div>

                  {editMode === 'compare' && (
                    <>
                      <div className="bgremove-compare-line" style={{ left: `${sliderValue}%` }} />
                      <div className="bgremove-compare-handle" style={{ left: `${sliderValue}%` }}>⇔</div>
                      <input
                        type="range" min="0" max="100" value={sliderValue}
                        className="bgremove-compare-slider"
                        onChange={e => setSliderValue(Number(e.target.value))}
                        aria-label="Before/after comparison slider"
                      />
                    </>
                  )}

                  {editMode === 'brush' && cursorPos && resultCanvasRef.current && (() => {
                    const rect = resultCanvasRef.current.getBoundingClientRect()
                    const displayScale = rect.width / resultCanvasRef.current.width
                    const diameter = currentBrushRadius() * 2 * displayScale
                    const ringColor = brushMode === 'erase' ? 'var(--coral)' : 'var(--cobalt)'
                    return (
                      <svg
                        className="bgremove-brush-cursor"
                        width={diameter} height={diameter}
                        style={{ left: cursorPos.clientX - rect.left, top: cursorPos.clientY - rect.top }}
                      >
                        <circle cx={diameter / 2} cy={diameter / 2} r={diameter / 2 - 1} fill={ringColor} fillOpacity="0.12" stroke={ringColor} strokeWidth="2" />
                      </svg>
                    )
                  })()}
                </div>

                {editMode === 'brush' && (
                  <div style={{ border: '2px solid var(--fg)', padding: '12px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <button type="button" className={`btn-mini ${brushMode === 'restore' ? 'bgremove-pressed' : ''}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setBrushMode('restore')} aria-pressed={brushMode === 'restore'}>
                        <Brush size={13} /> RESTORE
                      </button>
                      <button type="button" className={`btn-mini ${brushMode === 'erase' ? 'bgremove-pressed' : ''}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setBrushMode('erase')} aria-pressed={brushMode === 'erase'}>
                        <Eraser size={13} /> ERASE
                      </button>
                    </div>
                    <div className="field" style={{ marginBottom: '10px' }}>
                      <label>Brush Size</label>
                      <input type="range" min="1" max="100" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} style={{ width: '100%' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" className="btn-mini" onClick={handleUndo} disabled={!canUndo} style={{ flex: 1, justifyContent: 'center' }}><Undo2 size={13} /> UNDO</button>
                      <button type="button" className="btn-mini" onClick={handleResetEdits} style={{ flex: 1, justifyContent: 'center' }}><RefreshCw size={13} /> RESET EDITS</button>
                    </div>
                    <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: 'var(--muted)', marginTop: '10px' }}>
                      Restore brings back the original photo where the AI removed too much. Erase clears areas it left behind.
                    </p>
                  </div>
                )}

                <button type="button" className="btn-primary" onClick={handleDownload} style={{ marginBottom: '16px' }}>
                  <Download size={14} /> Download Transparent PNG
                </button>
              </>
            ) : (
              <div style={{ border: '2px dashed var(--fg)', padding: '30px 14px', textAlign: 'center', marginBottom: '16px' }}>
                <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)' }}>
                  {selectedFile ? 'Click "Remove Background" to process this image.' : 'Your before/after comparison will appear here.'}
                </p>
              </div>
            )}

            <div className="field-row" style={{ marginBottom: '16px' }}>
              <div className="kpi-tile">
                <span className="num" style={{ fontSize: '15px' }}>{isProcessing ? 'Working' : processedURL ? 'Complete' : 'Ready'}</span>
                <span className="label">Status</span>
              </div>
              <div className="kpi-tile">
                <span className="num" style={{ fontSize: '15px' }}>PNG</span>
                <span className="label">Output Format</span>
              </div>
            </div>

            <div style={{ border: '2px dashed var(--fg)', padding: '14px' }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>How it works</div>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--fg)' }}>AI-powered:</strong> uses a neural network (ISNet) for professional results.<br />
                <strong style={{ color: 'var(--fg)' }}>Fast:</strong> processes images in seconds, right in your browser.<br />
                <strong style={{ color: 'var(--fg)' }}>Private:</strong> runs entirely on your device.<br />
                First use downloads the AI model — cached after that, instant on repeat visits.
              </p>
            </div>
          </div>

        </div>
      </main>
    </>
  )
}

export default BackgroundRemover
