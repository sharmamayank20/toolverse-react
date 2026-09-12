import { useState, useRef } from 'react'
import { FileText, Camera, Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import CircularText from '../../components/CircularText'
import { useOpenCvReady } from '../../utils/useOpenCvReady'
import { API_BASE } from '../../config/api'
import {
  QUALITY_PRESETS, loadImageFromFile, defaultCorners,
  detectCornersOnCanvas, extractCroppedCanvas, renderPageFinalCanvas, resizeCanvasToMaxDim,
} from '../../utils/scanToPdfHelpers'
import CameraCapture from './CameraCapture'
import CropAdjust from './CropAdjust'
import PagesWorkbench from './PagesWorkbench'

const MAX_PAGES = 40

function buildThumb(croppedCanvas, rotation, filter, cv) {
  const finalCanvas = renderPageFinalCanvas({ rawCanvas: croppedCanvas, rotation, filter }, cv)
  return finalCanvas.toDataURL('image/jpeg', 0.85)
}

function ScanToPdf() {
  const { cvReady, cv, scanner, statusMsg: cvStatusMsg } = useOpenCvReady()

  const [stage, setStage] = useState('source') // 'source' | 'camera' | 'adjust' | 'workbench'
  const [pageMode, setPageMode] = useState('document') // 'document' | 'photo'
  const [facingMode, setFacingMode] = useState('environment')
  const [pages, setPages] = useState([])
  const [selectedPageId, setSelectedPageId] = useState(null)
  const [pendingShot, setPendingShot] = useState(null) // { canvas, corners }
  const [editTargetPageId, setEditTargetPageId] = useState(null)
  const [quality, setQuality] = useState('balanced')
  const [uploading, setUploading] = useState(false)

  const [status, setStatus] = useState({ msg: 'Add pages to begin.', type: 'idle' })
  const [progress, setProgress] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState(null) // { url, filename }

  const nextPageIdRef = useRef(1)
  const uploadInputRef = useRef(null)

  function makePage({ originalCanvas, corners, rotation = 0, filter = 'original' }) {
    const croppedCanvas = corners ? extractCroppedCanvas(originalCanvas, corners, scanner) : originalCanvas
    return {
      id: nextPageIdRef.current++,
      originalCanvas,
      corners,
      croppedCanvas,
      rotation,
      filter,
      thumbSrc: buildThumb(croppedCanvas, rotation, filter, cv),
    }
  }

  function recomputePage(page, patch) {
    const merged = { ...page, ...patch }
    const cornersChanged = patch.corners !== undefined || patch.originalCanvas !== undefined
    const croppedCanvas = cornersChanged
      ? (merged.corners ? extractCroppedCanvas(merged.originalCanvas, merged.corners, scanner) : merged.originalCanvas)
      : page.croppedCanvas
    return {
      ...merged,
      croppedCanvas,
      thumbSrc: buildThumb(croppedCanvas, merged.rotation, merged.filter, cv),
    }
  }

  // --- Source stage ---
  function handleUseCamera() {
    if (pages.length >= MAX_PAGES) { setStatus({ msg: `Maximum ${MAX_PAGES} pages reached.`, type: 'error' }); return }
    setEditTargetPageId(null)
    setStage('camera')
  }

  async function handleUploadFiles(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    if (pages.length + files.length > MAX_PAGES) {
      setStatus({ msg: `That would exceed the ${MAX_PAGES}-page limit.`, type: 'error' })
      return
    }

    setUploading(true)
    setStatus({ msg: `Processing ${files.length} photo${files.length === 1 ? '' : 's'}...`, type: 'loading' })

    const newPages = []
    for (const file of files) {
      try {
        const img = await loadImageFromFile(file)
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d').drawImage(img, 0, 0)

        let corners = null
        if (pageMode === 'document') {
          corners = cvReady ? detectCornersOnCanvas(canvas, scanner, cv) : null
          // No forced default-margin crop for silent batch uploads —
          // if detection fails, keep the full photo rather than
          // guessing a crop the user never reviewed.
        }
        newPages.push(makePage({ originalCanvas: canvas, corners }))
      } catch (err) {
        console.error('Upload processing error:', err)
      }
    }

    setPages(prev => [...prev, ...newPages])
    setUploading(false)
    if (uploadInputRef.current) uploadInputRef.current.value = ''
    setStatus({ msg: `Added ${newPages.length} page${newPages.length === 1 ? '' : 's'}.`, type: 'idle' })
    setStage('workbench')
    if (newPages.length && !selectedPageId) setSelectedPageId(newPages[0].id)
  }

  // --- Camera stage ---
  function handleCapture(shotCanvas) {
    if (pageMode === 'photo') {
      commitCapture(shotCanvas, null)
    } else {
      const detected = cvReady ? detectCornersOnCanvas(shotCanvas, scanner, cv) : null
      setPendingShot({ canvas: shotCanvas, corners: detected || defaultCorners(shotCanvas.width, shotCanvas.height) })
      setStage('adjust')
    }
  }

  function commitCapture(canvas, corners) {
    if (editTargetPageId != null) {
      setPages(prev => prev.map(p => p.id === editTargetPageId
        ? recomputePage(p, { originalCanvas: canvas, corners, rotation: 0 })
        : p))
      setEditTargetPageId(null)
      setStage('workbench')
    } else {
      const newPage = makePage({ originalCanvas: canvas, corners })
      setPages(prev => [...prev, newPage])
      setSelectedPageId(newPage.id)
      // Fresh multi-page capture keeps looping back to the camera —
      // only an explicit retake/re-crop of an existing page returns
      // to the workbench.
      setStage('camera')
    }
  }

  function handleDoneCapturing() {
    if (pages.length === 0) {
      setStatus({ msg: 'Capture at least one page first.', type: 'error' })
      return
    }
    setStage('workbench')
    if (!selectedPageId) setSelectedPageId(pages[0].id)
  }

  function handleCancelCamera() {
    setEditTargetPageId(null)
    setStage(pages.length > 0 ? 'workbench' : 'source')
  }

  // --- Adjust stage ---
  function handleConfirmCrop(corners) {
    commitCapture(pendingShot.canvas, corners)
    setPendingShot(null)
  }

  function handleRetakeFromAdjust() {
    setPendingShot(null)
    setStage('camera')
  }

  // --- Workbench actions ---
  function handleReorder(domIds) {
    setPages(prev => domIds.map(id => prev.find(p => p.id === id)).filter(Boolean))
  }

  function handleRotate(pageId) {
    setPages(prev => prev.map(p => p.id === pageId ? recomputePage(p, { rotation: (p.rotation + 90) % 360 }) : p))
  }

  function handleApplyFilter(pageId, filter) {
    setPages(prev => prev.map(p => p.id === pageId ? recomputePage(p, { filter }) : p))
  }

  function handleApplyFilterToAll(filter) {
    setPages(prev => prev.map(p => recomputePage(p, { filter })))
  }

  function handleRecrop(pageId) {
    const page = pages.find(p => p.id === pageId)
    if (!page) return
    setEditTargetPageId(pageId)
    setPendingShot({ canvas: page.originalCanvas, corners: page.corners || defaultCorners(page.originalCanvas.width, page.originalCanvas.height) })
    setStage('adjust')
  }

  function handleRetakePage(pageId) {
    setEditTargetPageId(pageId)
    setStage('camera')
  }

  function handleDeletePage(pageId) {
    setPages(prev => {
      const next = prev.filter(p => p.id !== pageId)
      if (selectedPageId === pageId) setSelectedPageId(next[0]?.id || null)
      return next
    })
  }

  function handleAddPage() {
    setEditTargetPageId(null)
    setStage('source')
  }

  function handleDiscardAll() {
    setPages([])
    setSelectedPageId(null)
    setPendingShot(null)
    setEditTargetPageId(null)
    setResult(null)
    setStatus({ msg: 'Add pages to begin.', type: 'idle' })
    setProgress(0)
    setStage('source')
  }

  // --- Generate ---
  async function handleGenerate() {
    if (pages.length === 0) { setStatus({ msg: 'Add at least one page first.', type: 'error' }); return }

    setGenerating(true)
    setResult(null)
    setStatus({ msg: 'Preparing pages...', type: 'loading' })
    setProgress(10)

    try {
      const preset = QUALITY_PRESETS[quality]
      const formData = new FormData()
      let hasUntouchedPages = false

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        if (page.filter === 'original') hasUntouchedPages = true
        setProgress(10 + Math.round((i / pages.length) * 60))

        const finalCanvas = renderPageFinalCanvas({ rawCanvas: page.croppedCanvas, rotation: page.rotation, filter: page.filter }, cv)
        const resized = resizeCanvasToMaxDim(finalCanvas, preset.maxDim)
        const blob = await new Promise(resolve => resized.toBlob(resolve, 'image/jpeg', preset.jpegQuality))
        formData.append('files', blob, `page-${i + 1}.jpg`)
      }

      formData.append('quality', quality)
      formData.append('hasUntouchedPages', String(hasUntouchedPages))

      setStatus({ msg: 'Uploading to server...', type: 'loading' })
      setProgress(75)

      const response = await fetch(`${API_BASE}/api/scan-to-pdf`, { method: 'POST', body: formData })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Server error: ${response.status}`)
      }

      setStatus({ msg: 'Preparing download...', type: 'loading' })
      setProgress(90)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const filename = 'scanned-document.pdf'

      const tempLink = document.createElement('a')
      tempLink.href = url
      tempLink.download = filename
      tempLink.click()

      setProgress(100)
      setStatus({ msg: 'PDF generated!', type: 'success' })
      setResult({ url, filename })
    } catch (err) {
      console.error('Generate failed:', err)
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

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">PDF</span><span className="num">CATALOG NO. 109</span></div>
            <h1>Scan to PDF</h1>
            <p>Point your camera at any page. We'll find the edges, straighten it, and build your PDF.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">CLIENT-SIDE</span>
              <span className="tool-chip">UP TO {MAX_PAGES} PAGES</span>
            </div>
          </div>
          <CircularText text="SCAN.SYS • DOC ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '44px 40px 100px' }}>

        {stage === 'source' && (
          <div className="upload-stage" style={{ maxWidth: '620px', margin: '0 auto' }}>
            <div className="panel-card">
              <div className="panel-head">
                <h2>Add a page</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span className="tool-chip">Runs in your browser</span>
                </div>
              </div>

              <div className="field" style={{ marginBottom: '16px' }}>
                <label>Page Style</label>
                <div className="escan-mode-toggle">
                  <button type="button" className={`btn-mini ${pageMode === 'document' ? 'pressed' : ''}`} aria-pressed={pageMode === 'document'} onClick={() => setPageMode('document')} style={{ flex: 1, justifyContent: 'center', flexDirection: 'column', padding: '12px 8px', height: 'auto' }}>
                    <strong style={{ display: 'block' }}>DOCUMENT</strong>
                    <span style={{ fontWeight: 400, fontSize: '10px', opacity: 0.85 }}>auto-crop & straighten</span>
                  </button>
                  <button type="button" className={`btn-mini ${pageMode === 'photo' ? 'pressed' : ''}`} aria-pressed={pageMode === 'photo'} onClick={() => setPageMode('photo')} style={{ flex: 1, justifyContent: 'center', flexDirection: 'column', padding: '12px 8px', height: 'auto' }}>
                    <strong style={{ display: 'block' }}>PHOTO</strong>
                    <span style={{ fontWeight: 400, fontSize: '10px', opacity: 0.85 }}>keep as captured</span>
                  </button>
                </div>
              </div>

              <div className="escan-source-grid">
                <button type="button" className="dropzone" onClick={handleUseCamera} style={{ minHeight: '160px', textAlign: 'center' }}>
                  <div className="dropzone-content">
                    <div className="upload-icon-wrap"><Camera size={26} /></div>
                    <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '14px' }}>Use Camera</div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>Capture pages live</div>
                  </div>
                </button>
                <button type="button" className="dropzone" onClick={() => uploadInputRef.current?.click()} style={{ minHeight: '160px', textAlign: 'center' }} disabled={uploading}>
                  <div className="dropzone-content">
                    {uploading ? (
                      <>
                        <Loader2 size={26} className="rotating-icon" />
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>{status.msg}</div>
                      </>
                    ) : (
                      <>
                        <div className="upload-icon-wrap"><Upload size={26} /></div>
                        <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '14px' }}>Upload Photos</div>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>Pick existing photos</div>
                      </>
                    )}
                  </div>
                </button>
                <input ref={uploadInputRef} type="file" accept="image/png,image/jpeg" multiple hidden onChange={e => handleUploadFiles(e.target.files)} />
              </div>

              <p className="whisper-line">{cvStatusMsg}</p>

              {pages.length > 0 && (
                <button type="button" className="btn-mini" style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }} onClick={() => setStage('workbench')}>
                  <FileText size={13} /> Back to {pages.length} page{pages.length === 1 ? '' : 's'}
                </button>
              )}
            </div>
          </div>
        )}

        {stage === 'camera' && (
          <div style={{ maxWidth: '760px', margin: '0 auto' }}>
            <CameraCapture
              scanner={scanner}
              cv={cv}
              cvReady={cvReady}
              pages={pages}
              facingMode={facingMode}
              onSwitchCamera={() => setFacingMode(m => m === 'environment' ? 'user' : 'environment')}
              onCapture={handleCapture}
              onDone={handleDoneCapturing}
              onCancel={handleCancelCamera}
            />
          </div>
        )}

        {stage === 'adjust' && pendingShot && (
          <div style={{ maxWidth: '760px', margin: '0 auto' }}>
            <CropAdjust
              shotCanvas={pendingShot.canvas}
              initialCorners={pendingShot.corners}
              scanner={scanner}
              cv={cv}
              onConfirm={handleConfirmCrop}
              onRetake={handleRetakeFromAdjust}
            />
          </div>
        )}

        {stage === 'workbench' && (
          <PagesWorkbench
            pages={pages}
            selectedPageId={selectedPageId}
            onSelectPage={setSelectedPageId}
            onReorder={handleReorder}
            onAddPage={handleAddPage}
            onRotate={handleRotate}
            onApplyFilter={handleApplyFilter}
            onApplyFilterToAll={handleApplyFilterToAll}
            onRecrop={handleRecrop}
            onRetakePage={handleRetakePage}
            onDeletePage={handleDeletePage}
            quality={quality}
            onQualityChange={setQuality}
            status={status}
            progress={progress}
            generating={generating}
            onGenerate={handleGenerate}
            result={result}
            onDownload={handleDownload}
            onDiscardAll={handleDiscardAll}
          />
        )}

      </main>
    </>
  )
}

export default ScanToPdf
