import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Droplets, ChevronLeft, ChevronRight, ImageUp, X, Download, Loader2,
  CheckCircle2, AlertCircle, ArrowDownToLine, ShieldCheck, RotateCcw,
} from 'lucide-react'
import CircularText from '../components/CircularText'
import Modal from '../components/Modal'
import '../utils/pdfWorker'
import { getDocument } from 'pdfjs-dist'
import { API_BASE } from '../config/api'
import { parseRangesToSet } from '../utils/splitPdfHelpers'
import {
  DEFAULTS, TEXT_PRESETS, POSITION_KEYS, MARGIN_TEXT_PT, MARGIN_IMAGE_PT,
  validateWatermarkPdfFile, validateWatermarkImageFile,
  presetAnchor, nearestPresetFor, pxToPt, ptToPx, tileAcrossPage, hasCustomSettings,
} from '../utils/watermarkPdfHelpers'

const FONT_STACKS = {
  'Helvetica': "Helvetica, Arial, sans-serif",
  'Times-Roman': "'Times New Roman', Georgia, serif",
  'Courier': "'Courier New', monospace",
}
const TILE_MULT = { compact: 1.3, normal: 1.8, spaced: 2.5 }

function WatermarkPdf() {
  const [file, setFile] = useState(null)
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageWidthPts, setPageWidthPts] = useState(0)
  const [pageHeightPts, setPageHeightPts] = useState(0)
  const [renderScale, setRenderScale] = useState(1)

  const [settings, setSettings] = useState({ ...DEFAULTS })
  const [watermarkImageFile, setWatermarkImageFile] = useState(null)
  const [watermarkImageEl, setWatermarkImageEl] = useState(null)
  const [customAnchorPt, setCustomAnchorPt] = useState(null)
  const [pagesCustomText, setPagesCustomText] = useState('')

  const [status, setStatus] = useState({ msg: 'Add a PDF to begin.', type: 'idle' })
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState(null) // { url, filename }
  const [confirmOpen, setConfirmOpen] = useState(false)

  const pdfDocRef = useRef(null)
  const pageCanvasRef = useRef(null)
  const wmCanvasRef = useRef(null)
  const viewerScrollRef = useRef(null)
  const dragStateRef = useRef(null)
  const resizeTimerRef = useRef(null)
  const dragCounterRef = useRef(0)
  const fileInputRef = useRef(null)
  const imageInputRef = useRef(null)

  const isPageIncluded = (pageNum) => {
    if (settings.pagesMode === 'all') return true
    const set = parseRangesToSet(pagesCustomText, totalPages)
    return set.size ? set.has(pageNum) : true
  }

  function update(patch) {
    setSettings(prev => ({ ...prev, ...patch }))
  }

  async function handleFile(f) {
    const check = validateWatermarkPdfFile(f)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }

    setStatus({ msg: 'Loading PDF...', type: 'loading' })
    setProgress(20)

    try {
      const buf = await f.arrayBuffer()
      const pdfDoc = await getDocument({ data: buf }).promise
      pdfDocRef.current = pdfDoc

      setFile(f)
      setTotalPages(pdfDoc.numPages)
      setResult(null)

      await renderPage(1)
      setStatus({ msg: 'PDF loaded. Adjust the watermark on the right to preview it live.', type: 'idle' })
      setProgress(0)
    } catch (err) {
      console.error('PDF load error:', err)
      setStatus({ msg: `Error loading PDF: ${err.message}`, type: 'error' })
      setProgress(0)
    }
  }

  async function renderPage(num) {
    const pdfDoc = pdfDocRef.current
    if (!pdfDoc) return

    try {
      const page = await pdfDoc.getPage(num)
      const unscaled = page.getViewport({ scale: 1 })

      const scrollEl = viewerScrollRef.current
      const availableWidth = Math.max(240, (scrollEl?.clientWidth || 700) - 36)
      const availableHeight = Math.max(280, Math.round(window.innerHeight * 0.84) - 36)
      let scale = Math.min(availableWidth / unscaled.width, availableHeight / unscaled.height)
      scale = Math.min(scale, 3)
      scale = Math.max(scale, 0.2)

      const viewport = page.getViewport({ scale })
      const cssW = Math.round(viewport.width)
      const cssH = Math.round(viewport.height)
      const dpr = window.devicePixelRatio || 1

      const pageCanvas = pageCanvasRef.current
      pageCanvas.width = Math.round(cssW * dpr)
      pageCanvas.height = Math.round(cssH * dpr)
      pageCanvas.style.width = `${cssW}px`
      pageCanvas.style.height = `${cssH}px`
      const pageCtx = pageCanvas.getContext('2d')
      pageCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      await page.render({ canvasContext: pageCtx, viewport }).promise

      const wmCanvas = wmCanvasRef.current
      wmCanvas.width = Math.round(cssW * dpr)
      wmCanvas.height = Math.round(cssH * dpr)
      wmCanvas.style.width = `${cssW}px`
      wmCanvas.style.height = `${cssH}px`

      setPageWidthPts(unscaled.width)
      setPageHeightPts(unscaled.height)
      setRenderScale(scale)
      setCurrentPage(num)
    } catch (err) {
      console.error('Page render error:', err)
      setStatus({ msg: `Error rendering page: ${err.message}`, type: 'error' })
    }
  }

  function goToPage(num) {
    if (num < 1 || num > totalPages) return
    renderPage(num)
  }

  useEffect(() => {
    function handleResize() {
      clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = setTimeout(() => {
        if (pdfDocRef.current) renderPage(currentPage)
      }, 250)
    }
    window.addEventListener('resize', handleResize)
    return () => { window.removeEventListener('resize', handleResize); clearTimeout(resizeTimerRef.current) }
  }, [currentPage])

  function previewCssFont(sizePx) {
    const stack = FONT_STACKS[settings.fontFamily] || FONT_STACKS.Helvetica
    return `${settings.fontItalic ? 'italic' : 'normal'} ${settings.fontBold ? 'bold' : 'normal'} ${sizePx}px ${stack}`
  }

  function drawTextBlock(ctx, cx, cy, lines, fontSizePx, color, rotationRad) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rotationRad)
    ctx.font = previewCssFont(fontSizePx)
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lineHeight = fontSizePx * 1.2
    const totalH = lineHeight * (lines.length - 1)
    lines.forEach((line, i) => {
      ctx.fillText(line, 0, (totalH / 2) - (i * lineHeight))
    })
    ctx.restore()
  }

  function drawImageAt(ctx, cx, cy, imgEl, imgWpx, imgHpx, rotationRad) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rotationRad)
    ctx.drawImage(imgEl, -imgWpx / 2, -imgHpx / 2, imgWpx, imgHpx)
    ctx.restore()
  }

  function drawHandle(ctx, anchor) {
    const rootStyle = getComputedStyle(document.documentElement)
    ctx.save()
    ctx.globalAlpha = 1
    ctx.fillStyle = rootStyle.getPropertyValue('--hl-bg').trim() || '#2440FF'
    ctx.strokeStyle = rootStyle.getPropertyValue('--fg').trim() || '#0D0D0F'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(anchor.x, anchor.y, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  // overrideAnchorPt lets drag paint directly without touching React
  // state on every pointermove (same performance pattern as Sign/Crop
  // PDF) — committed to state only once, on pointer-up.
  function drawWatermarkPreview(overrideAnchorPt) {
    const wmCanvas = wmCanvasRef.current
    if (!wmCanvas || !pdfDocRef.current) return
    const dpr = window.devicePixelRatio || 1
    const ctx = wmCanvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const cssW = pageWidthPts * renderScale
    const cssH = pageHeightPts * renderScale
    ctx.clearRect(0, 0, cssW, cssH)

    if (!isPageIncluded(currentPage)) return

    const rotationRad = -settings.rotation * Math.PI / 180
    const anchorPtValue = overrideAnchorPt !== undefined ? overrideAnchorPt : customAnchorPt
    const currentAnchorPx = (marginPx) => anchorPtValue ? ptToPx(anchorPtValue, pageHeightPts, renderScale) : presetAnchor(settings.position, cssW, cssH, marginPx)

    ctx.save()
    ctx.globalAlpha = settings.opacity / 100

    if (settings.watermarkType === 'image') {
      if (watermarkImageEl) {
        const img = watermarkImageEl
        const maxDimPt = Math.min(pageWidthPts, pageHeightPts) * 0.3
        const scale = Math.min(maxDimPt / img.naturalWidth, maxDimPt / img.naturalHeight, 1.0)
        const imgWpx = img.naturalWidth * scale * renderScale
        const imgHpx = img.naturalHeight * scale * renderScale

        if (settings.layout === 'mosaic') {
          const mult = TILE_MULT[settings.tileSpacing] || 1.8
          tileAcrossPage(cssW, cssH, imgWpx * mult, imgHpx * mult, (cx, cy) => drawImageAt(ctx, cx, cy, img, imgWpx, imgHpx, rotationRad))
        } else {
          const marginPx = MARGIN_IMAGE_PT * renderScale
          const anchor = currentAnchorPx(marginPx)
          drawImageAt(ctx, anchor.x, anchor.y, img, imgWpx, imgHpx, rotationRad)
          drawHandle(ctx, anchor)
        }
      } else {
        const marginPx = MARGIN_IMAGE_PT * renderScale
        const drawPlaceholder = (cx, cy) => {
          ctx.save()
          ctx.globalAlpha = Math.max(settings.opacity / 100, 0.5)
          ctx.strokeStyle = '#7a8073'
          ctx.setLineDash([6, 5])
          ctx.strokeRect(cx - 70, cy - 45, 140, 90)
          ctx.fillStyle = '#7a8073'
          ctx.font = `${13 * renderScale}px 'JetBrains Mono', monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('image watermark', cx, cy)
          ctx.restore()
        }
        if (settings.layout === 'mosaic') {
          const mult = TILE_MULT[settings.tileSpacing] || 1.8
          tileAcrossPage(cssW, cssH, 140 * mult, 90 * mult, drawPlaceholder)
        } else {
          const anchor = currentAnchorPx(marginPx)
          drawPlaceholder(anchor.x, anchor.y)
          drawHandle(ctx, anchor)
        }
      }
    } else {
      const lines = (settings.watermarkText.trim() || 'CONFIDENTIAL').split('\n')
      const fontSizePx = settings.fontSize * renderScale

      if (settings.layout === 'mosaic') {
        const mult = TILE_MULT[settings.tileSpacing] || 1.8
        ctx.font = previewCssFont(fontSizePx)
        const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width), fontSizePx)
        const tileW = maxLineW * mult
        const tileH = Math.max(fontSizePx * 1.2 * lines.length, fontSizePx) * mult
        tileAcrossPage(cssW, cssH, tileW, tileH, (cx, cy) => drawTextBlock(ctx, cx, cy, lines, fontSizePx, settings.textColor, rotationRad))
      } else {
        const marginPx = MARGIN_TEXT_PT * renderScale
        const anchor = currentAnchorPx(marginPx)
        drawTextBlock(ctx, anchor.x, anchor.y, lines, fontSizePx, settings.textColor, rotationRad)
        drawHandle(ctx, anchor)
      }
    }

    ctx.restore()
  }

  // Redraw whenever anything the preview depends on changes.
  useEffect(() => {
    drawWatermarkPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, watermarkImageEl, customAnchorPt, currentPage, renderScale, pageWidthPts, pageHeightPts, pagesCustomText])

  // --- Drag to reposition (single layout only) ---
  const draggable = settings.layout !== 'mosaic' && isPageIncluded(currentPage)

  function handleDragStart(e) {
    if (!pdfDocRef.current || !draggable) return
    e.preventDefault()
    const cssW = pageWidthPts * renderScale
    const cssH = pageHeightPts * renderScale
    const marginPx = (settings.watermarkType === 'image' ? MARGIN_IMAGE_PT : MARGIN_TEXT_PT) * renderScale
    const anchor = customAnchorPt ? ptToPx(customAnchorPt, pageHeightPts, renderScale) : presetAnchor(settings.position, cssW, cssH, marginPx)
    const rect = wmCanvasRef.current.getBoundingClientRect()
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    dragStateRef.current = { offsetX: pos.x - anchor.x, offsetY: pos.y - anchor.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleDragMove(e) {
    const drag = dragStateRef.current
    if (!drag) return
    e.preventDefault()
    const cssW = pageWidthPts * renderScale
    const cssH = pageHeightPts * renderScale
    const rect = wmCanvasRef.current.getBoundingClientRect()
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const x = Math.max(0, Math.min(cssW, pos.x - drag.offsetX))
    const y = Math.max(0, Math.min(cssH, pos.y - drag.offsetY))
    const newAnchorPt = pxToPt(x, y, pageHeightPts, renderScale)
    drawWatermarkPreview(newAnchorPt)
    dragStateRef.current.lastAnchorPt = newAnchorPt
  }

  function handleDragEnd() {
    const drag = dragStateRef.current
    if (!drag) return
    dragStateRef.current = null
    if (drag.lastAnchorPt) setCustomAnchorPt(drag.lastAnchorPt)
  }

  const nearestPositionLabel = (() => {
    if (!customAnchorPt || settings.layout === 'mosaic') return null
    const cssW = pageWidthPts * renderScale
    const cssH = pageHeightPts * renderScale
    const marginPx = (settings.watermarkType === 'image' ? MARGIN_IMAGE_PT : MARGIN_TEXT_PT) * renderScale
    return nearestPresetFor(ptToPx(customAnchorPt, pageHeightPts, renderScale), cssW, cssH, marginPx)
  })()

  async function handleWatermarkImageChange(f) {
    const check = validateWatermarkImageFile(f)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); if (imageInputRef.current) imageInputRef.current.value = ''; return }
    try {
      const url = URL.createObjectURL(f)
      const img = new Image()
      img.onload = () => { setWatermarkImageFile(f); setWatermarkImageEl(img); setStatus({ msg: 'Watermark image selected.', type: 'idle' }) }
      img.onerror = () => { setStatus({ msg: 'Could not read that image.', type: 'error' }); if (imageInputRef.current) imageInputRef.current.value = '' }
      img.src = url
    } catch (err) {
      setStatus({ msg: 'Could not read that image.', type: 'error' })
    }
  }

  function handlePositionSelect(key) {
    update({ position: key })
    setCustomAnchorPt(null)
  }

  function resetSettings() {
    setSettings({ ...DEFAULTS })
    setCustomAnchorPt(null)
    setWatermarkImageFile(null)
    setWatermarkImageEl(null)
    setPagesCustomText('')
    if (imageInputRef.current) imageInputRef.current.value = ''
    setStatus({ msg: 'Watermark settings reset to defaults.', type: 'idle' })
  }

  function resetAll() {
    pdfDocRef.current = null
    setFile(null)
    setTotalPages(1)
    setCurrentPage(1)
    setResult(null)
    resetSettings()
    if (fileInputRef.current) fileInputRef.current.value = ''
    setStatus({ msg: 'Add a PDF to begin.', type: 'idle' })
    setProgress(0)
  }

  function handleChangePdfClick() {
    if (hasCustomSettings(settings, watermarkImageFile, customAnchorPt)) { setConfirmOpen(true); return }
    resetAll()
  }

  function confirmChangePdf() {
    setConfirmOpen(false)
    resetAll()
  }

  async function handleApply() {
    const check = validateWatermarkPdfFile(file)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }
    if (settings.watermarkType === 'image' && !watermarkImageFile) {
      setStatus({ msg: 'Choose a watermark image first, or switch to Text Watermark.', type: 'error' })
      return
    }
    if (settings.pagesMode === 'custom') {
      const set = parseRangesToSet(pagesCustomText, totalPages)
      if (!pagesCustomText.trim() || set.size === 0) {
        setStatus({ msg: 'Enter a valid page range (e.g. 1,3,5-9), or switch to All pages.', type: 'error' })
        return
      }
    }

    let position = settings.position
    if (customAnchorPt && settings.layout === 'single') {
      const cssW = pageWidthPts * renderScale
      const cssH = pageHeightPts * renderScale
      const marginPx = (settings.watermarkType === 'image' ? MARGIN_IMAGE_PT : MARGIN_TEXT_PT) * renderScale
      position = nearestPresetFor(ptToPx(customAnchorPt, pageHeightPts, renderScale), cssW, cssH, marginPx)
    }

    setApplying(true)
    setResult(null)
    setStatus({ msg: 'Preparing PDF...', type: 'loading' })
    setProgress(15)

    try {
      const formData = new FormData()
      formData.append('pdf', file)
      formData.append('watermarkType', settings.watermarkType)
      formData.append('watermarkText', settings.watermarkText.trim() || 'CONFIDENTIAL')
      formData.append('fontFamily', settings.fontFamily)
      formData.append('bold', String(settings.fontBold))
      formData.append('italic', String(settings.fontItalic))
      formData.append('fontSize', String(settings.fontSize))
      formData.append('textColor', settings.textColor)
      formData.append('position', position)
      formData.append('layout', settings.layout)
      formData.append('tileSpacing', settings.tileSpacing)
      formData.append('opacity', String(settings.opacity))
      formData.append('rotation', String(settings.rotation))
      formData.append('layer', settings.layer)
      formData.append('pages', settings.pagesMode === 'custom' ? pagesCustomText : 'all')
      if (settings.watermarkType === 'image' && watermarkImageFile) {
        formData.append('watermarkImage', watermarkImageFile)
      }

      setStatus({ msg: 'Uploading to server...', type: 'loading' })
      setProgress(35)

      const response = await fetch(`${API_BASE}/api/watermark-pdf`, { method: 'POST', body: formData })

      setStatus({ msg: 'Applying watermark...', type: 'loading' })
      setProgress(65)

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Server error: ${response.status}`)
      }

      setStatus({ msg: 'Preparing download...', type: 'loading' })
      setProgress(85)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const base = (file.name || 'document.pdf').replace(/\.pdf$/i, '') || 'document'
      const filename = `${base}-watermarked.pdf`

      setProgress(100)
      setStatus({ msg: 'Watermark applied!', type: 'success' })
      setResult({ url, filename })

      const tempLink = document.createElement('a')
      tempLink.href = url
      tempLink.download = filename
      tempLink.click()
    } catch (err) {
      console.error('Watermark failed:', err)
      setStatus({ msg: `Error: ${err.message}`, type: 'error' })
      setProgress(0)
    } finally {
      setApplying(false)
    }
  }

  function handleDownload() {
    if (!result) return
    const a = document.createElement('a')
    a.href = result.url
    a.download = result.filename
    a.click()
  }

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">PDF</span><span className="num">CATALOG NO. 108</span></div>
            <h1>Watermark PDF</h1>
            <p>Add custom text or image watermarks to your PDF documents.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">SERVER-SIDE</span>
              <span className="tool-chip">UP TO 20MB</span>
            </div>
          </div>
          <CircularText text="WATERMARK.SYS • PDF ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '44px 40px 100px' }}>

        {!file ? (
          <div className="upload-stage" style={{ maxWidth: '620px', margin: '0 auto' }}>
            <div
              className={`dropzone ${dragging ? 'drag' : ''}`}
              onClick={() => { if (status.type !== 'loading') fileInputRef.current?.click() }}
              onDragEnter={e => { e.preventDefault(); if (status.type === 'loading') return; dragCounterRef.current += 1; setDragging(true) }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={e => { e.preventDefault(); dragCounterRef.current -= 1; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragging(false) } }}
              onDrop={e => { e.preventDefault(); dragCounterRef.current = 0; setDragging(false); if (status.type === 'loading') return; if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
              style={{ textAlign: 'center' }}
            >
              {status.type === 'loading' ? (
                <div className="dropzone-loading">
                  <Loader2 size={32} className="rotating-icon" />
                  <div className="dropzone-loading-text">{status.msg}</div>
                </div>
              ) : (
                <div className="dropzone-content">
                  <div className="upload-icon-wrap"><Droplets size={28} /></div>
                  <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', marginBottom: '6px' }}>Drag & drop a PDF</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)' }}>
                    or <span style={{ color: 'var(--cobalt)', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 700 }}>click to browse</span>
                  </div>
                  <div className="format-pills">
                    <span className="format-pill">PDF</span>
                    <span className="format-pill size">≤ 20MB</span>
                  </div>
                </div>
              )}
              <AnimatePresence>
                {dragging && (
                  <motion.div className="drop-overlay" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
                    <div className="drop-overlay-icon"><ArrowDownToLine size={26} /></div>
                    <div className="drop-overlay-text">Drop to load</div>
                  </motion.div>
                )}
              </AnimatePresence>
              <input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
            </div>
            <div className="privacy-badge">
              <ShieldCheck size={22} />
              <span>Files are automatically deleted from the server within 15 minutes.</span>
            </div>
          </div>
        ) : (
          <div className="pdf-viewer-grid">
            <div className="panel-card">
              <div className="panel-head">
                <h2>Preview</h2>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="btn-mini" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page"><ChevronLeft size={13} /></button>
                  <span className="tool-chip">Page {currentPage} / {totalPages}{!isPageIncluded(currentPage) ? ' (not watermarked)' : ''}</span>
                  <button type="button" className="btn-mini" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Next page"><ChevronRight size={13} /></button>
                  <button type="button" className="btn-mini" onClick={resetSettings}><RotateCcw size={13} /> RESET SETTINGS</button>
                  <button type="button" className="btn-mini" onClick={handleChangePdfClick}>CHANGE PDF</button>
                </div>
              </div>

              <div className="ecrop-viewer-scroll" ref={viewerScrollRef}>
                <div className="ewtm-page-wrap">
                  <canvas ref={pageCanvasRef}></canvas>
                  <canvas
                    ref={wmCanvasRef}
                    className={`ewtm-wm-canvas ${draggable ? '' : 'not-draggable'}`}
                    onPointerDown={handleDragStart}
                    onPointerMove={handleDragMove}
                    onPointerUp={handleDragEnd}
                    onPointerCancel={handleDragEnd}
                  ></canvas>
                </div>
              </div>

              {nearestPositionLabel && (
                <div className="ewtm-custom-pos-note">
                  Custom position (dragged) — applies as <strong>{nearestPositionLabel.replace('-', ' ')}</strong>.
                  <button type="button" className="link-btn" onClick={() => setCustomAnchorPt(null)}>Snap back to grid</button>
                </div>
              )}

              <p className="whisper-line" style={{ marginTop: '10px' }}>Drag the watermark to reposition it, or adjust any setting on the right — the preview updates instantly either way.</p>
            </div>

            <div className="panel-card">
              <div className="panel-head"><h3>Watermark</h3></div>

              <div className="field" style={{ marginBottom: '14px' }}>
                <label>Watermark Type</label>
                <select value={settings.watermarkType} onChange={e => update({ watermarkType: e.target.value })}>
                  <option value="text">Text Watermark</option>
                  <option value="image">Image Watermark</option>
                </select>
              </div>

              {settings.watermarkType === 'text' ? (
                <>
                  <div className="field" style={{ marginBottom: '10px' }}>
                    <label>Watermark Text</label>
                    <textarea rows={2} maxLength={200} placeholder="CONFIDENTIAL" value={settings.watermarkText} onChange={e => update({ watermarkText: e.target.value })}
                      style={{ width: '100%', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', background: 'var(--bg)', border: '2px solid var(--fg)', color: 'var(--fg)', padding: '10px 12px', resize: 'vertical', minHeight: '56px' }} />
                    <p className="whisper-line">Use a line break for multi-line text.</p>
                  </div>

                  <div className="ewtm-preset-chips" style={{ marginBottom: '14px' }}>
                    {TEXT_PRESETS.map(preset => (
                      <button key={preset} type="button" className="tool-chip" style={{ cursor: 'pointer', background: 'none' }} onClick={() => update({ watermarkText: preset })}>{preset}</button>
                    ))}
                  </div>

                  <div className="field-row" style={{ marginBottom: '10px' }}>
                    <div className="field">
                      <label>Font</label>
                      <select value={settings.fontFamily} onChange={e => update({ fontFamily: e.target.value })}>
                        <option value="Helvetica">Helvetica</option>
                        <option value="Times-Roman">Times</option>
                        <option value="Courier">Courier</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Size</label>
                      <input type="number" min={8} max={200} value={settings.fontSize} onChange={e => update({ fontSize: Math.max(8, Math.min(200, parseInt(e.target.value, 10) || 40)) })} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                      <input type="checkbox" checked={settings.fontBold} onChange={e => update({ fontBold: e.target.checked })} /> Bold
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                      <input type="checkbox" checked={settings.fontItalic} onChange={e => update({ fontItalic: e.target.checked })} /> Italic
                    </label>
                  </div>

                  <div className="field" style={{ marginBottom: '14px' }}>
                    <label>Text Color</label>
                    <input type="color" value={settings.textColor} onChange={e => update({ textColor: e.target.value })} style={{ height: '40px', padding: '4px' }} />
                  </div>
                </>
              ) : (
                <div className="field" style={{ marginBottom: '14px' }}>
                  <label>Watermark Image</label>
                  {watermarkImageEl ? (
                    <div className="ewtm-image-chip">
                      <img src={watermarkImageEl.src} alt="Watermark preview" />
                      <span>{watermarkImageFile?.name}</span>
                      <button type="button" className="btn-mini mpdf-icon-btn" aria-label="Remove watermark image" onClick={() => { setWatermarkImageFile(null); setWatermarkImageEl(null); if (imageInputRef.current) imageInputRef.current.value = '' }}><X size={12} /></button>
                    </div>
                  ) : (
                    <div className="dropzone" style={{ minHeight: '140px', textAlign: 'center' }} onClick={() => imageInputRef.current?.click()}>
                      <div className="dropzone-content">
                        <div className="upload-icon-wrap"><ImageUp size={22} /></div>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--muted)' }}>Click to choose PNG or JPG</div>
                      </div>
                    </div>
                  )}
                  <input ref={imageInputRef} type="file" accept="image/png,image/jpeg" hidden onChange={e => e.target.files[0] && handleWatermarkImageChange(e.target.files[0])} />
                  <p className="whisper-line">Transparent PNG recommended.</p>
                </div>
              )}

              <div className="field" style={{ marginBottom: '14px' }}>
                <label>Layout</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className={`btn-mini ${settings.layout === 'single' ? 'pressed' : ''}`} aria-pressed={settings.layout === 'single'} onClick={() => update({ layout: 'single' })} style={{ flex: 1, justifyContent: 'center' }}>SINGLE</button>
                  <button type="button" className={`btn-mini ${settings.layout === 'mosaic' ? 'pressed' : ''}`} aria-pressed={settings.layout === 'mosaic'} onClick={() => update({ layout: 'mosaic' })} style={{ flex: 1, justifyContent: 'center' }}>MOSAIC</button>
                </div>
              </div>

              {settings.layout === 'single' ? (
                <div className="field" style={{ marginBottom: '14px' }}>
                  <label>Position</label>
                  <div className="ewtm-pos-grid">
                    {POSITION_KEYS.map(key => (
                      <button key={key} type="button" className={`ewtm-pos-btn ${settings.position === key && !customAnchorPt ? 'active' : ''}`} title={key.replace('-', ' ')} onClick={() => handlePositionSelect(key)} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="field" style={{ marginBottom: '14px' }}>
                  <label>Tile Spacing</label>
                  <select value={settings.tileSpacing} onChange={e => update({ tileSpacing: e.target.value })}>
                    <option value="compact">Compact</option>
                    <option value="normal">Normal</option>
                    <option value="spaced">Spaced</option>
                  </select>
                </div>
              )}

              <div className="field" style={{ marginBottom: '14px' }}>
                <label>Opacity ({settings.opacity}%)</label>
                <input type="range" min="0" max="100" value={settings.opacity} onChange={e => update({ opacity: Number(e.target.value) })} />
              </div>

              <div className="field" style={{ marginBottom: '14px' }}>
                <label>Rotation ({settings.rotation}°)</label>
                <input type="range" min="0" max="360" value={settings.rotation} onChange={e => update({ rotation: Number(e.target.value) })} />
              </div>

              <div className="field" style={{ marginBottom: '14px' }}>
                <label>Layer</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className={`btn-mini ${settings.layer === 'front' ? 'pressed' : ''}`} aria-pressed={settings.layer === 'front'} onClick={() => update({ layer: 'front' })} style={{ flex: 1, justifyContent: 'center' }}>IN FRONT</button>
                  <button type="button" className={`btn-mini ${settings.layer === 'back' ? 'pressed' : ''}`} aria-pressed={settings.layer === 'back'} onClick={() => update({ layer: 'back' })} style={{ flex: 1, justifyContent: 'center' }}>BEHIND</button>
                </div>
              </div>

              <div className="field" style={{ marginBottom: '14px' }}>
                <label>Pages</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: settings.pagesMode === 'custom' ? '8px' : 0 }}>
                  <button type="button" className={`btn-mini ${settings.pagesMode === 'all' ? 'pressed' : ''}`} aria-pressed={settings.pagesMode === 'all'} onClick={() => update({ pagesMode: 'all' })} style={{ flex: 1, justifyContent: 'center' }}>ALL PAGES</button>
                  <button type="button" className={`btn-mini ${settings.pagesMode === 'custom' ? 'pressed' : ''}`} aria-pressed={settings.pagesMode === 'custom'} onClick={() => update({ pagesMode: 'custom' })} style={{ flex: 1, justifyContent: 'center' }}>CUSTOM</button>
                </div>
                {settings.pagesMode === 'custom' && (
                  <>
                    <input type="text" placeholder="e.g. 1,3,5-9" value={pagesCustomText} onChange={e => setPagesCustomText(e.target.value)} />
                    <p className="whisper-line">Comma-separated pages and ranges.</p>
                  </>
                )}
              </div>

              <div style={{ borderTop: '2px solid var(--fg)', paddingTop: '16px' }}>
                <div className={`status-line ${status.type}`} style={{ marginBottom: '10px' }}>
                  {status.type === 'loading' && <Loader2 size={14} className="rotating-icon" />}
                  {status.type === 'success' && <CheckCircle2 size={14} />}
                  {status.type === 'error' && <AlertCircle size={14} />}
                  <span>{status.msg}</span>
                </div>
                <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div>

                <button type="button" className="btn-primary" style={{ marginTop: '16px' }} onClick={handleApply} disabled={applying}>
                  {applying ? 'APPLYING...' : 'Apply Watermark'}
                </button>

                {result && (
                  <button type="button" className="btn-primary" style={{ marginTop: '10px' }} onClick={handleDownload}>
                    <Download size={16} /> Download watermarked PDF
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </main>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Discard watermark settings?">
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', marginBottom: '20px' }}>
          Changing the PDF will clear your watermark settings. This can't be undone.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-mini" onClick={() => setConfirmOpen(false)}>CANCEL</button>
          <button type="button" className="btn-primary inline" onClick={confirmChangePdf}>CHANGE PDF</button>
        </div>
      </Modal>
    </>
  )
}

export default WatermarkPdf