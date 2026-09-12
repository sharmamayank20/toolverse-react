import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileSignature, ChevronLeft, ChevronRight, Download, Loader2,
  CheckCircle2, AlertCircle, ArrowDownToLine, ShieldCheck, X,
} from 'lucide-react'
import CircularText from '../../components/CircularText'
import Modal from '../../components/Modal'
import '../../utils/pdfWorker'
import { getDocument } from 'pdfjs-dist'
import { API_BASE } from '../../config/api'
import { loadImage, exactSizeBlob, validateSignPdfFile, SIGNATURE_OVERSAMPLE } from '../../utils/signPdfHelpers'
import SignatureSidebar from './SignatureSidebar'

const DEFAULT_BOX_WIDTH_PX = 180
const MIN_BOX_WIDTH_PX = 40

function SignPdf() {
  const [file, setFile] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [renderScale, setRenderScale] = useState(1)     // px per pt, current page
  const [pageSizePts, setPageSizePts] = useState(null)   // { width, height } unscaled, current page
  const [activeBox, setActiveBox] = useState(null)       // { dataUrl, naturalW, naturalH, xPts, yPtsFromBottom, widthPts, heightPts }
  const [placements, setPlacements] = useState([])       // [{ id, page, xPts, yPtsFromBottom, widthPts, heightPts, dataUrl }]
  const [status, setStatus] = useState({ msg: 'Add a PDF to begin.', type: 'idle' })
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState(null) // { url, filename }
  const [confirmOpen, setConfirmOpen] = useState(false)

  const pdfDocRef = useRef(null)
  const canvasRef = useRef(null)
  const canvasWrapRef = useRef(null)
  const activeBoxElRef = useRef(null)
  const dragStateRef = useRef(null)
  const nextPlacementIdRef = useRef(1)
  const resizeTimerRef = useRef(null)
  const dragCounterRef = useRef(0)
  const fileInputRef = useRef(null)

  // --- Load & render ---
  async function handleFile(f) {
    const check = validateSignPdfFile(f)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }

    setStatus({ msg: 'Loading PDF...', type: 'loading' })
    setProgress(20)

    try {
      const buf = await f.arrayBuffer()
      const pdfDoc = await getDocument({ data: buf }).promise
      pdfDocRef.current = pdfDoc

      setFile(f)
      setNumPages(pdfDoc.numPages)
      setPlacements([])
      setActiveBox(null)
      setResult(null)

      await renderPage(1)
      setStatus({ msg: 'Create a signature, drag it into place, then click Place on this page.', type: 'idle' })
      setProgress(0)
    } catch (err) {
      console.error('PDF load error:', err)
      setStatus({ msg: `Error loading PDF: ${err.message}`, type: 'error' })
      setProgress(0)
    }
  }

  async function renderPage(pageNum) {
    const pdfDoc = pdfDocRef.current
    if (!pdfDoc) return
    const page = await pdfDoc.getPage(pageNum)
    const unscaled = page.getViewport({ scale: 1 })

    const containerWidth = canvasWrapRef.current?.clientWidth || 700
    const dpr = window.devicePixelRatio || 1
    const scale = Math.min(containerWidth / unscaled.width, 1.6)
    const viewport = page.getViewport({ scale })

    const canvas = canvasRef.current
    canvas.width = Math.round(viewport.width * dpr)
    canvas.height = Math.round(viewport.height * dpr)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    await page.render({ canvasContext: ctx, viewport }).promise

    setRenderScale(scale)
    setPageSizePts({ width: unscaled.width, height: unscaled.height })
    setCurrentPage(pageNum)
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

  function goToPage(delta) {
    const next = currentPage + delta
    if (next < 1 || next > numPages) return
    renderPage(next)
  }

  // --- Signature -> active box ---
  async function handleSignatureReady(dataUrl) {
    const img = await loadImage(dataUrl)
    setActiveBox(prev => {
      if (prev) return { ...prev, dataUrl, naturalW: img.naturalWidth, naturalH: img.naturalHeight }
      if (!pageSizePts) return prev
      const widthPts = DEFAULT_BOX_WIDTH_PX / renderScale
      const heightPts = widthPts * (img.naturalHeight / img.naturalWidth)
      return {
        dataUrl,
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
        xPts: (pageSizePts.width - widthPts) / 2,
        yPtsFromBottom: (pageSizePts.height - heightPts) / 2,
        widthPts,
        heightPts,
      }
    })
  }

  function handleSignatureCleared() {
    setActiveBox(null)
  }

  // --- Active box geometry (points <-> px) ---
  function boxPxRect(box) {
    if (!box || !pageSizePts) return null
    return {
      left: box.xPts * renderScale,
      top: (pageSizePts.height - box.yPtsFromBottom - box.heightPts) * renderScale,
      width: box.widthPts * renderScale,
      height: box.heightPts * renderScale,
    }
  }

  function pxRectToPts(rect) {
    return {
      xPts: rect.left / renderScale,
      yPtsFromBottom: pageSizePts.height - (rect.top + rect.height) / renderScale,
      widthPts: rect.width / renderScale,
      heightPts: rect.height / renderScale,
    }
  }

  function handleBoxPointerDown(e, mode) {
    e.stopPropagation()
    const rect = boxPxRect(activeBox)
    dragStateRef.current = {
      mode, // 'move' | 'resize'
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: rect,
      aspect: activeBox.naturalW / activeBox.naturalH,
    }
    e.target.setPointerCapture(e.pointerId)
  }

  function handleBoxPointerMove(e) {
    const drag = dragStateRef.current
    if (!drag || !activeBoxElRef.current) return
    const dx = e.clientX - drag.startClientX
    const dy = e.clientY - drag.startClientY
    const canvasW = canvasRef.current.clientWidth
    const canvasH = canvasRef.current.clientHeight
    const el = activeBoxElRef.current

    if (drag.mode === 'move') {
      let left = drag.startRect.left + dx
      let top = drag.startRect.top + dy
      left = Math.max(0, Math.min(left, canvasW - drag.startRect.width))
      top = Math.max(0, Math.min(top, canvasH - drag.startRect.height))
      el.style.left = `${left}px`
      el.style.top = `${top}px`
    } else if (drag.mode === 'resize') {
      let width = Math.max(MIN_BOX_WIDTH_PX, drag.startRect.width + dx)
      width = Math.min(width, canvasW - drag.startRect.left)
      const height = width / drag.aspect
      el.style.width = `${width}px`
      el.style.height = `${height}px`
    }
  }

  function handleBoxPointerUp() {
    const drag = dragStateRef.current
    if (!drag || !activeBoxElRef.current) { dragStateRef.current = null; return }
    const el = activeBoxElRef.current
    const finalRect = {
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
      width: parseFloat(el.style.width),
      height: parseFloat(el.style.height),
    }
    const pts = pxRectToPts(finalRect)
    setActiveBox(prev => prev ? { ...prev, ...pts } : prev)
    dragStateRef.current = null
  }

  function handleSizeSliderChange(px) {
    setActiveBox(prev => {
      if (!prev) return prev
      const widthPts = px / renderScale
      const heightPts = widthPts * (prev.naturalH / prev.naturalW)
      return { ...prev, widthPts, heightPts }
    })
  }

  function handlePlaceOnPage() {
    if (!activeBox || !pageSizePts) return
    setPlacements(prev => [...prev, {
      id: nextPlacementIdRef.current++,
      page: currentPage,
      xPts: activeBox.xPts,
      yPtsFromBottom: activeBox.yPtsFromBottom,
      widthPts: activeBox.widthPts,
      heightPts: activeBox.heightPts,
      dataUrl: activeBox.dataUrl,
    }])
    setStatus({ msg: `Placed on page ${currentPage}. Drag to reposition, or place again elsewhere.`, type: 'idle' })
  }

  function handleRemovePlacement(id) {
    setPlacements(prev => prev.filter(p => p.id !== id))
  }

  // --- Reset / change PDF ---
  function resetAll() {
    pdfDocRef.current = null
    setFile(null)
    setNumPages(0)
    setCurrentPage(1)
    setPageSizePts(null)
    setActiveBox(null)
    setPlacements([])
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setStatus({ msg: 'Add a PDF to begin.', type: 'idle' })
    setProgress(0)
  }

  function handleChangePdfClick() {
    if (placements.length > 0 || activeBox) { setConfirmOpen(true); return }
    resetAll()
  }

  function confirmChangePdf() {
    setConfirmOpen(false)
    resetAll()
  }

  // --- Generate: sequential, chained — each call's output PDF is the next call's input ---
  async function handleGenerate() {
    if (placements.length === 0) { setStatus({ msg: 'Place at least one signature first.', type: 'error' }); return }

    setGenerating(true)
    setResult(null)
    setStatus({ msg: `Applying signature 1 of ${placements.length}...`, type: 'loading' })
    setProgress(10)

    try {
      let workingBlob = file
      for (let i = 0; i < placements.length; i++) {
        const p = placements[i]
        setStatus({ msg: `Applying signature ${i + 1} of ${placements.length}...`, type: 'loading' })
        setProgress(10 + Math.round((i / placements.length) * 80))

        const sigBlob = await exactSizeBlob(p.dataUrl, p.widthPts, p.heightPts)

        const formData = new FormData()
        formData.append('pdf', workingBlob, file.name)
        formData.append('signature', sigBlob, 'signature.png')
        formData.append('pages', String(p.page))
        formData.append('position', 'manual')
        formData.append('x', String(Math.round(p.xPts)))
        formData.append('y', String(Math.round(p.yPtsFromBottom)))
        // exactSizeBlob renders at SIGNATURE_OVERSAMPLE pixels per point for
        // print/zoom quality; the backend uses the image's raw pixel count
        // as its point size, so this tells it to scale that back down —
        // physical placement size is unchanged, only resolution went up.
        formData.append('scale', String(100 / SIGNATURE_OVERSAMPLE))

        const response = await fetch(`${API_BASE}/api/sign-pdf`, { method: 'POST', body: formData })
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          throw new Error(errData.error || `Server error on signature ${i + 1}: ${response.status}`)
        }
        workingBlob = await response.blob()
      }

      const url = URL.createObjectURL(workingBlob)
      const base = (file.name || 'document.pdf').replace(/\.pdf$/i, '') || 'document'
      const filename = `${base}-signed.pdf`

      setProgress(100)
      setStatus({ msg: 'Signed PDF ready!', type: 'success' })
      setResult({ url, filename })

      const tempLink = document.createElement('a')
      tempLink.href = url
      tempLink.download = filename
      tempLink.click()
    } catch (err) {
      console.error('Sign failed:', err)
      setStatus({ msg: `Error: ${err.message}`, type: 'error' })
      setProgress(0)
    } finally {
      setGenerating(false)
    }
  }

  function handleDownload() {
    if (!result) return
    const a = document.createElement('a')
    a.href = result.url
    a.download = result.filename
    a.click()
  }

  const activeRect = boxPxRect(activeBox)
  const currentPagePlacements = placements.filter(p => p.page === currentPage)

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">PDF</span><span className="num">CATALOG NO. 104</span></div>
            <h1>Sign PDF</h1>
            <p>See the page, drop your signature exactly where it belongs.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">SERVER-SIDE</span>
              <span className="tool-chip">UP TO 20MB</span>
            </div>
          </div>
          <CircularText text="SIGN.SYS • PDF ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '44px 40px 100px', width: '100%' }}>

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
                  <div className="upload-icon-wrap"><FileSignature size={28} /></div>
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
                <h2>Document</h2>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button type="button" className="btn-mini" onClick={() => goToPage(-1)} disabled={currentPage <= 1} aria-label="Previous page"><ChevronLeft size={13} /></button>
                  <span className="tool-chip">Page {currentPage} / {numPages}</span>
                  <button type="button" className="btn-mini" onClick={() => goToPage(1)} disabled={currentPage >= numPages} aria-label="Next page"><ChevronRight size={13} /></button>
                  <button type="button" className="btn-mini" onClick={handleChangePdfClick}>CHANGE PDF</button>
                </div>
              </div>

              <div className="esig-viewer-scroll" ref={canvasWrapRef}>
                <div className="esig-page-wrap">
                  <canvas ref={canvasRef}></canvas>

                  {currentPagePlacements.map(p => {
                    const rect = boxPxRect(p)
                    if (!rect) return null
                    return (
                      <div key={p.id} className="esig-box placed" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
                        <img src={p.dataUrl} alt="Placed signature" />
                        <button type="button" className="esig-box-remove" aria-label="Remove this placement" onClick={() => handleRemovePlacement(p.id)}><X size={12} /></button>
                      </div>
                    )
                  })}

                  {activeBox && activeRect && (
                    <div
                      ref={activeBoxElRef}
                      className="esig-box active"
                      style={{ left: activeRect.left, top: activeRect.top, width: activeRect.width, height: activeRect.height }}
                      onPointerDown={e => handleBoxPointerDown(e, 'move')}
                      onPointerMove={handleBoxPointerMove}
                      onPointerUp={handleBoxPointerUp}
                      onPointerCancel={handleBoxPointerUp}
                    >
                      <img src={activeBox.dataUrl} alt="Signature preview" />
                      <button type="button" className="esig-box-remove" aria-label="Cancel this signature" onClick={() => setActiveBox(null)}><X size={12} /></button>
                      <div
                        className="esig-box-resize"
                        onPointerDown={e => handleBoxPointerDown(e, 'resize')}
                        onPointerMove={handleBoxPointerMove}
                        onPointerUp={handleBoxPointerUp}
                        onPointerCancel={handleBoxPointerUp}
                      />
                    </div>
                  )}
                </div>
              </div>
              <p className="whisper-line" style={{ marginTop: '10px' }}>Drag the signature box to position it. Drag the corner handle to resize. Click Place on this page when it looks right.</p>
            </div>

            <div className="esig-sidebar">
              <SignatureSidebar onSignatureReady={handleSignatureReady} onSignatureCleared={handleSignatureCleared} />

              <div className="panel-card">
                <div className="panel-head"><h3>Preview & Place</h3></div>

                {activeBox ? (
                  <>
                    <div className="esig-preview-box"><img src={activeBox.dataUrl} alt="Signature preview" /></div>
                    <div className="field" style={{ marginBottom: '14px' }}>
                      <label>Size</label>
                      <input type="range" min={MIN_BOX_WIDTH_PX} max="420" value={Math.round(activeBox.widthPts * renderScale)} onChange={e => handleSizeSliderChange(Number(e.target.value))} />
                    </div>
                    <button type="button" className="btn-primary" onClick={handlePlaceOnPage}>Place on this page</button>
                  </>
                ) : (
                  <p className="whisper-line">Create a signature above to preview and place it.</p>
                )}

                <div style={{ borderTop: '2px solid var(--fg)', marginTop: '16px', paddingTop: '16px' }}>
                  <div className="panel-head" style={{ marginBottom: '10px', paddingBottom: '0', border: 'none' }}>
                    <h4 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '14px', fontWeight: 700 }}>Placements</h4>
                    <span className="tool-chip">{placements.length}</span>
                  </div>
                  {placements.length === 0 ? (
                    <p className="whisper-line">None yet — create a signature and place it on the document.</p>
                  ) : (
                    <div className="esig-placements-list">
                      {placements.map(p => (
                        <div key={p.id} className="esig-placement-item">
                          <img src={p.dataUrl} alt="" className="esig-placement-thumb" />
                          <span>Page {p.page}</span>
                          <button type="button" className="btn-mini mpdf-icon-btn" aria-label="Remove placement" onClick={() => handleRemovePlacement(p.id)}><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '2px solid var(--fg)', marginTop: '16px', paddingTop: '16px' }}>
                  <div className={`status-line ${status.type}`} style={{ marginBottom: '10px' }}>
                    {status.type === 'loading' && <Loader2 size={14} className="rotating-icon" />}
                    {status.type === 'success' && <CheckCircle2 size={14} />}
                    {status.type === 'error' && <AlertCircle size={14} />}
                    <span>{status.msg}</span>
                  </div>
                  <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div>

                  <button type="button" className="btn-primary" style={{ marginTop: '16px' }} onClick={handleGenerate} disabled={generating || placements.length === 0}>
                    {generating ? 'GENERATING...' : 'Generate Signed PDF'}
                  </button>

                  {result && (
                    <button type="button" className="btn-primary" style={{ marginTop: '10px' }} onClick={handleDownload}>
                      <Download size={16} /> Download signed PDF
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Discard signatures?">
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', marginBottom: '20px' }}>
          Changing the PDF will clear every signature you've placed. This can't be undone.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-mini" onClick={() => setConfirmOpen(false)}>CANCEL</button>
          <button type="button" className="btn-primary inline" onClick={confirmChangePdf}>CHANGE PDF</button>
        </div>
      </Modal>
    </>
  )
}

export default SignPdf