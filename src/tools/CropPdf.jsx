import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Crop, ChevronLeft, ChevronRight, RotateCcw, Download, Loader2, CheckCircle2, AlertCircle, ArrowDownToLine, ShieldCheck } from 'lucide-react'
import CircularText from '../components/CircularText'
import Modal from '../components/Modal'
import '../utils/pdfWorker'
import { getDocument } from 'pdfjs-dist'
import { API_BASE } from '../config/api'
import { MAX_FILE_BYTES, validateCropPdfFile, computeClampedCrop, clampCropToPage, anyCropSet } from '../utils/cropPdfHelpers'

const ZERO_CROP = { top: 0, bottom: 0, left: 0, right: 0 }

function CropPdf() {
  const [file, setFile] = useState(null)
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageWidthPts, setPageWidthPts] = useState(0)
  const [pageHeightPts, setPageHeightPts] = useState(0)
  const [renderScale, setRenderScale] = useState(1)
  const [perPageCrops, setPerPageCrops] = useState({}) // { [page]: {top,bottom,left,right} }
  const [applyToAll, setApplyToAll] = useState(true)
  const [pageJump, setPageJump] = useState(1)
  const [pageLoading, setPageLoading] = useState(false)
  const [status, setStatus] = useState({ msg: 'Add a PDF to begin.', type: 'idle' })
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const pdfDocRef = useRef(null)
  const canvasRef = useRef(null)
  const viewerScrollRef = useRef(null)
  const dragStateRef = useRef(null)
  const dragPreviewCropRef = useRef(null)
  const renderScaleRef = useRef(1)
  const resizeTimerRef = useRef(null)
  const dragCounterRef = useRef(0)
  const fileInputRef = useRef(null)

  const overlayRefs = { top: useRef(null), bottom: useRef(null), left: useRef(null), right: useRef(null) }
  const handleRefs = { top: useRef(null), bottom: useRef(null), left: useRef(null), right: useRef(null) }

  const currentCrop = perPageCrops[currentPage] || ZERO_CROP
  const originalW = Math.round(pageWidthPts)
  const originalH = Math.round(pageHeightPts)
  const newW = Math.max(0, originalW - currentCrop.left - currentCrop.right)
  const newH = Math.max(0, originalH - currentCrop.top - currentCrop.bottom)

  async function handleFile(f) {
    const check = validateCropPdfFile(f)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }

    setStatus({ msg: 'Loading PDF...', type: 'loading' })
    setProgress(20)

    try {
      const buf = await f.arrayBuffer()
      const pdfDoc = await getDocument({ data: buf }).promise
      pdfDocRef.current = pdfDoc

      setFile(f)
      setTotalPages(pdfDoc.numPages)
      setPerPageCrops({})

      await renderPage(1)
      setStatus({ msg: 'PDF loaded. Drag edges or enter values to crop.', type: 'idle' })
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
    setPageLoading(true)

    try {
      const page = await pdfDoc.getPage(num)
      const unscaled = page.getViewport({ scale: 1 })

      const scrollEl = viewerScrollRef.current
      const availableWidth = Math.max(240, (scrollEl?.clientWidth || 700) - 36)
      const availableHeight = Math.max(280, Math.round(window.innerHeight * 0.78) - 36)
      let scale = Math.min(availableWidth / unscaled.width, availableHeight / unscaled.height)
      scale = Math.min(scale, 3)
      scale = Math.max(scale, 0.2)

      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(viewport.width * dpr)
      canvas.height = Math.round(viewport.height * dpr)
      canvas.style.width = `${Math.round(viewport.width)}px`
      canvas.style.height = `${Math.round(viewport.height)}px`
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      await page.render({ canvasContext: ctx, viewport }).promise

      renderScaleRef.current = scale
      setRenderScale(scale)
      setPageWidthPts(unscaled.width)
      setPageHeightPts(unscaled.height)
      setCurrentPage(num)
      setPageJump(num)

      setPerPageCrops(prev => {
        const existing = prev[num] || ZERO_CROP
        const clamped = clampCropToPage(existing, unscaled.width, unscaled.height)
        return { ...prev, [num]: clamped }
      })
    } catch (err) {
      console.error('Page render error:', err)
      setStatus({ msg: `Error rendering page: ${err.message}`, type: 'error' })
    } finally {
      setPageLoading(false)
    }
  }

  function goToPage(num) {
    if (num < 1 || num > totalPages) return
    renderPage(num)
  }

  function handlePageJumpGo() {
    const target = parseInt(pageJump, 10) || 1
    if (target >= 1 && target <= totalPages) renderPage(target)
    else setStatus({ msg: `Invalid page number. Must be between 1 and ${totalPages}.`, type: 'error' })
  }

  function paintCrop(crop) {
    const s = renderScaleRef.current
    if (overlayRefs.top.current) overlayRefs.top.current.style.height = `${crop.top * s}px`
    if (overlayRefs.bottom.current) overlayRefs.bottom.current.style.height = `${crop.bottom * s}px`
    if (overlayRefs.left.current) overlayRefs.left.current.style.width = `${crop.left * s}px`
    if (overlayRefs.right.current) overlayRefs.right.current.style.width = `${crop.right * s}px`
    if (handleRefs.top.current) handleRefs.top.current.style.top = `${crop.top * s}px`
    if (handleRefs.bottom.current) handleRefs.bottom.current.style.bottom = `${crop.bottom * s}px`
    if (handleRefs.left.current) handleRefs.left.current.style.left = `${crop.left * s}px`
    if (handleRefs.right.current) handleRefs.right.current.style.right = `${crop.right * s}px`
  }

  function clientPosFor(e, side) {
    return (side === 'top' || side === 'bottom') ? e.clientY : e.clientX
  }

  function handleDragStart(side, e) {
    e.preventDefault()
    dragStateRef.current = { side, startClientPos: clientPosFor(e, side), startCropPt: currentCrop[side] }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleDragMove(e) {
    const drag = dragStateRef.current
    if (!drag) return
    e.preventDefault()
    const clientPos = clientPosFor(e, drag.side)
    const deltaPx = (drag.side === 'top' || drag.side === 'left') ? (clientPos - drag.startClientPos) : (drag.startClientPos - clientPos)
    const deltaPt = deltaPx / renderScaleRef.current
    const newCrop = computeClampedCrop(currentCrop, drag.side, drag.startCropPt + deltaPt, pageWidthPts, pageHeightPts)
    paintCrop(newCrop)
    dragPreviewCropRef.current = newCrop
  }

  function handleDragEnd() {
    if (!dragStateRef.current) return
    dragStateRef.current = null
    if (dragPreviewCropRef.current) {
      const finalCrop = dragPreviewCropRef.current
      dragPreviewCropRef.current = null
      setPerPageCrops(prev => ({ ...prev, [currentPage]: finalCrop }))
    }
  }

  function handleNumericChange(side, rawValue) {
    const value = Math.max(0, parseInt(rawValue, 10) || 0)
    const newCrop = computeClampedCrop(currentCrop, side, value, pageWidthPts, pageHeightPts)
    setPerPageCrops(prev => ({ ...prev, [currentPage]: newCrop }))
  }

  function handleResetCrop() {
    setPerPageCrops(prev => ({ ...prev, [currentPage]: { ...ZERO_CROP } }))
    setStatus({ msg: 'Crop values reset for current page.', type: 'idle' })
  }

  function resetAll() {
    pdfDocRef.current = null
    setFile(null)
    setTotalPages(1)
    setCurrentPage(1)
    setPageWidthPts(0)
    setPageHeightPts(0)
    setPerPageCrops({})
    if (fileInputRef.current) fileInputRef.current.value = ''
    setStatus({ msg: 'Add a PDF to begin.', type: 'idle' })
    setProgress(0)
  }

  function handleChangePdfClick() {
    if (anyCropSet(perPageCrops)) { setConfirmOpen(true); return }
    resetAll()
  }

  function confirmChangePdf() {
    setConfirmOpen(false)
    resetAll()
  }

  async function handleDownload() {
    if (!pdfDocRef.current || !file) { setStatus({ msg: 'No PDF loaded.', type: 'error' }); return }

    const hasCrop = applyToAll
      ? (currentCrop.top > 0 || currentCrop.bottom > 0 || currentCrop.left > 0 || currentCrop.right > 0)
      : anyCropSet(perPageCrops)

    if (!hasCrop) { setStatus({ msg: 'No crop values set. Drag edges or enter values.', type: 'error' }); return }

    setDownloading(true)
    setStatus({ msg: 'Preparing cropped PDF...', type: 'loading' })
    setProgress(50)

    try {
      const formData = new FormData()
      formData.append('pdf', file)
      formData.append('applyToAll', applyToAll)

      if (applyToAll) {
        formData.append('cropTop', Math.round(currentCrop.top))
        formData.append('cropBottom', Math.round(currentCrop.bottom))
        formData.append('cropLeft', Math.round(currentCrop.left))
        formData.append('cropRight', Math.round(currentCrop.right))
      } else {
        formData.append('perPageCrops', JSON.stringify(perPageCrops))
      }

      setStatus({ msg: 'Uploading to server...', type: 'loading' })
      setProgress(70)

      const response = await fetch(`${API_BASE}/api/crop-pdf`, { method: 'POST', body: formData })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Server error: ${response.status}`)
      }

      setStatus({ msg: 'Preparing download...', type: 'loading' })
      setProgress(90)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const filename = (file.name || 'document.pdf').replace(/\.pdf$/i, '') + '-cropped.pdf'

      const tempLink = document.createElement('a')
      tempLink.href = url
      tempLink.download = filename
      tempLink.click()

      setProgress(100)
      setStatus({ msg: 'Cropped PDF downloaded!', type: 'success' })
    } catch (err) {
      console.error('Crop failed:', err)
      setStatus({ msg: `Error: ${err.message}`, type: 'error' })
      setProgress(0)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">PDF</span><span className="num">CATALOG NO. 106</span></div>
            <h1>Crop PDF</h1>
            <p>Visually crop PDF pages by dragging edges or entering precise values.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">SERVER-SIDE</span>
              <span className="tool-chip">UP TO 20MB</span>
            </div>
          </div>
          <CircularText text="CROP.SYS • PDF ENGINE • " spinDuration={18} onHover="speedUp" />
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
                  <div className="upload-icon-wrap"><Crop size={28} /></div>
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
                <h2>Crop Editor</h2>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button type="button" className="btn-mini" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page"><ChevronLeft size={13} /></button>
                  <span className="tool-chip">Page {currentPage} / {totalPages}</span>
                  <button type="button" className="btn-mini" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Next page"><ChevronRight size={13} /></button>
                  <button type="button" className="btn-mini" onClick={handleChangePdfClick}>CHANGE PDF</button>
                </div>
              </div>

              <div className="ecrop-viewer-scroll" ref={viewerScrollRef}>
                {pageLoading && (
                  <div className="ecrop-loading">
                    <Loader2 size={28} className="rotating-icon" />
                    <p>Loading page preview...</p>
                  </div>
                )}
                <div className={`ecrop-container ${pageLoading ? 'hidden' : ''}`}>
                  <canvas ref={canvasRef}></canvas>

                  <div ref={handleRefs.top} className="ecrop-handle top" style={{ top: currentCrop.top * renderScale }}
                    onPointerDown={e => handleDragStart('top', e)} onPointerMove={handleDragMove} onPointerUp={handleDragEnd} onPointerCancel={handleDragEnd} />
                  <div ref={handleRefs.bottom} className="ecrop-handle bottom" style={{ bottom: currentCrop.bottom * renderScale }}
                    onPointerDown={e => handleDragStart('bottom', e)} onPointerMove={handleDragMove} onPointerUp={handleDragEnd} onPointerCancel={handleDragEnd} />
                  <div ref={handleRefs.left} className="ecrop-handle left" style={{ left: currentCrop.left * renderScale }}
                    onPointerDown={e => handleDragStart('left', e)} onPointerMove={handleDragMove} onPointerUp={handleDragEnd} onPointerCancel={handleDragEnd} />
                  <div ref={handleRefs.right} className="ecrop-handle right" style={{ right: currentCrop.right * renderScale }}
                    onPointerDown={e => handleDragStart('right', e)} onPointerMove={handleDragMove} onPointerUp={handleDragEnd} onPointerCancel={handleDragEnd} />

                  <div ref={overlayRefs.top} className="ecrop-overlay top" style={{ height: currentCrop.top * renderScale }} />
                  <div ref={overlayRefs.bottom} className="ecrop-overlay bottom" style={{ height: currentCrop.bottom * renderScale }} />
                  <div ref={overlayRefs.left} className="ecrop-overlay left" style={{ width: currentCrop.left * renderScale }} />
                  <div ref={overlayRefs.right} className="ecrop-overlay right" style={{ width: currentCrop.right * renderScale }} />
                </div>
              </div>
              <p className="whisper-line" style={{ marginTop: '10px' }}>Drag any edge handle to crop, or dial in exact values on the right. Shaded areas show what will be removed.</p>
            </div>

            <div className="panel-card">
              <div className="panel-head">
                <h3>Crop</h3>
                <button type="button" className="btn-mini" onClick={handleResetCrop}><RotateCcw size={13} /> RESET PAGE</button>
              </div>

              <div className="field-row" style={{ marginBottom: '10px' }}>
                <div className="field">
                  <label>Top (pt)</label>
                  <input type="number" min="0" value={Math.round(currentCrop.top)} onChange={e => handleNumericChange('top', e.target.value)} />
                </div>
                <div className="field">
                  <label>Bottom (pt)</label>
                  <input type="number" min="0" value={Math.round(currentCrop.bottom)} onChange={e => handleNumericChange('bottom', e.target.value)} />
                </div>
              </div>
              <div className="field-row" style={{ marginBottom: '16px' }}>
                <div className="field">
                  <label>Left (pt)</label>
                  <input type="number" min="0" value={Math.round(currentCrop.left)} onChange={e => handleNumericChange('left', e.target.value)} />
                </div>
                <div className="field">
                  <label>Right (pt)</label>
                  <input type="number" min="0" value={Math.round(currentCrop.right)} onChange={e => handleNumericChange('right', e.target.value)} />
                </div>
              </div>

              <div className="field" style={{ marginBottom: '16px' }}>
                <label>Jump to page</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="number" min="1" max={totalPages} value={pageJump} onChange={e => setPageJump(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePageJumpGo()} style={{ flex: 1 }} />
                  <button type="button" className="btn-mini" onClick={handlePageJumpGo}>GO</button>
                </div>
              </div>

              <div className="field" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', textTransform: 'none', fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'var(--fg)', fontWeight: 500 }}>
                  <input type="checkbox" checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)} style={{ width: '16px', height: '16px' }} />
                  Apply crop to all pages
                </label>
                <p className="whisper-line">If unchecked, only each page's own crop is used — set them by navigating between pages.</p>
              </div>

              <div className="field-row" style={{ marginBottom: '16px' }}>
                <div className="ecrop-size-tile"><span className="num">{originalW} × {originalH}</span><span className="label">Original (pt)</span></div>
                <div className="ecrop-size-tile"><span className="num">{newW} × {newH}</span><span className="label">Cropped (pt)</span></div>
              </div>

              <div style={{ borderTop: '2px solid var(--fg)', paddingTop: '16px' }}>
                <div className={`status-line ${status.type}`} style={{ marginBottom: '10px' }}>
                  {status.type === 'loading' && <Loader2 size={14} className="rotating-icon" />}
                  {status.type === 'success' && <CheckCircle2 size={14} />}
                  {status.type === 'error' && <AlertCircle size={14} />}
                  <span>{status.msg}</span>
                </div>
                <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div>

                <button type="button" className="btn-primary" style={{ marginTop: '16px' }} onClick={handleDownload} disabled={downloading}>
                  <Download size={16} /> {downloading ? 'DOWNLOADING...' : 'Download Cropped PDF'}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Discard crop values?">
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', marginBottom: '20px' }}>
          Changing the PDF will clear every crop value you've set. This can't be undone.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-mini" onClick={() => setConfirmOpen(false)}>CANCEL</button>
          <button type="button" className="btn-primary inline" onClick={confirmChangePdf}>CHANGE PDF</button>
        </div>
      </Modal>
    </>
  )
}

export default CropPdf