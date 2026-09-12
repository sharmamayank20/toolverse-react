import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Download, Loader2, CheckCircle2, AlertCircle, ArrowDownToLine, ShieldCheck } from 'lucide-react'
import CircularText from '../components/CircularText'
import '../utils/pdfWorker'
import { getDocument } from 'pdfjs-dist'
import { API_BASE } from '../config/api'
import { formatBytes, computeSizeComparison, validatePdfFile, COMPRESSION_LEVELS } from '../utils/compressPdfMath'

// Renders onto an off-DOM canvas and returns a data URL, rather than
// drawing onto a DOM canvas ref — the workbench's <canvas> doesn't exist
// yet at the point this runs (it only mounts after `file` state updates
// and React re-renders), so a ref-based approach would race and silently
// no-op. Matches OcrExtractor's toDataURL() pattern for the same reason.
async function renderThumbnail(pdfDoc) {
  const page = await pdfDoc.getPage(1)
  const unscaled = page.getViewport({ scale: 1 })

  const dpr = window.devicePixelRatio || 1
  const targetCssWidth = 56
  const scale = (targetCssWidth * dpr) / unscaled.width
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)

  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise

  return canvas.toDataURL('image/png')
}

function CompressPdf() {
  const [file, setFile] = useState(null)
  const [originalSize, setOriginalSize] = useState(0)
  const [pageCount, setPageCount] = useState(0)
  const [level, setLevel] = useState('medium')
  const [status, setStatus] = useState({ msg: 'Add a PDF to begin.', type: 'idle' })
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [result, setResult] = useState(null) // { url, filename, newSize, reductionPct, fillPct }
  const [thumbSrc, setThumbSrc] = useState(null)

  const dragCounterRef = useRef(0)
  const fileInputRef = useRef(null)

  async function handleFile(f) {
    const check = validatePdfFile(f)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }

    setStatus({ msg: 'Reading PDF...', type: 'loading' })
    setProgress(15)

    try {
      const buf = await f.arrayBuffer()
      const pdfDoc = await getDocument({ data: buf }).promise

      const thumb = await renderThumbnail(pdfDoc)

      setFile(f)
      setOriginalSize(f.size || 0)
      setPageCount(pdfDoc.numPages)
      setResult(null)
      setThumbSrc(thumb)

      setStatus({ msg: 'Ready to compress.', type: 'idle' })
      setProgress(0)
    } catch (err) {
      console.error('PDF load error:', err)
      setStatus({ msg: `That file couldn't be read as a PDF: ${err.message}`, type: 'error' })
      setProgress(0)
    }
  }

  function handleChangePdf() {
    if (result?.url) URL.revokeObjectURL(result.url)
    setFile(null)
    setOriginalSize(0)
    setPageCount(0)
    setResult(null)
    setThumbSrc(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setStatus({ msg: 'Add a PDF to begin.', type: 'idle' })
    setProgress(0)
  }

  async function handleCompress() {
    const check = validatePdfFile(file)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }

    setCompressing(true)
    setResult(null)
    setStatus({ msg: 'Preparing PDF...', type: 'loading' })
    setProgress(15)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('level', level)

      setStatus({ msg: 'Uploading to server...', type: 'loading' })
      setProgress(35)

      const response = await fetch(`${API_BASE}/api/compress-pdf`, { method: 'POST', body: formData })

      setStatus({ msg: 'Compressing PDF...', type: 'loading' })
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
      const filename = `${base}-compressed.pdf`
      const newSize = blob.size
      const { reductionPct, fillPct } = computeSizeComparison(originalSize, newSize)

      setProgress(100)
      setStatus({ msg: 'Compression complete!', type: 'success' })
      setResult({ url, filename, newSize, reductionPct, fillPct })

      const tempLink = document.createElement('a')
      tempLink.href = url
      tempLink.download = filename
      tempLink.click()
    } catch (err) {
      console.error('Compress failed:', err)
      setStatus({ msg: `Error: ${err.message}`, type: 'error' })
      setProgress(0)
    } finally {
      setCompressing(false)
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
            <div className="tool-crumb"><span className="cat">PDF</span><span className="num">CATALOG NO. 101</span></div>
            <h1>Compress PDF</h1>
            <p>Reduce PDF file size while maintaining quality for easier sharing and storage.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">SERVER-SIDE</span>
              <span className="tool-chip">UP TO 50MB</span>
            </div>
          </div>
          <CircularText text="COMPRESS.SYS • PDF ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>

        {!file ? (
          <div className="upload-stage" style={{ maxWidth: '620px', margin: '0 auto' }}>
            <div
              className={`dropzone ${dragging ? 'drag' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={e => { e.preventDefault(); dragCounterRef.current += 1; setDragging(true) }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={e => { e.preventDefault(); dragCounterRef.current -= 1; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragging(false) } }}
              onDrop={e => { e.preventDefault(); dragCounterRef.current = 0; setDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
              style={{ textAlign: 'center' }}
            >
              <div className="dropzone-content">
                <div className="upload-icon-wrap"><FileText size={28} /></div>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', marginBottom: '6px' }}>Drag & drop a PDF</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)' }}>
                  or <span style={{ color: 'var(--cobalt)', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 700 }}>click to browse</span>
                </div>
                <div className="format-pills">
                  <span className="format-pill">PDF</span>
                  <span className="format-pill size">≤ 50MB</span>
                </div>
              </div>
              <AnimatePresence>
                {dragging && (
                  <motion.div className="drop-overlay" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
                    <div className="drop-overlay-icon"><ArrowDownToLine size={26} /></div>
                    <div className="drop-overlay-text">Drop to compress</div>
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
          <div className="tool-workbench">
            <div className="panel-card">
              <div className="panel-head">
                <h2>Input</h2>
                <button type="button" className="btn-mini" onClick={handleChangePdf}>CHANGE PDF</button>
              </div>

              <div className="cpdf-file-card">
                <div className="cpdf-thumb-wrap">{thumbSrc && <img src={thumbSrc} alt="PDF first page thumbnail" />}</div>
                <div className="cpdf-file-info">
                  <div className="cpdf-file-name">{file.name}</div>
                  <div className="cpdf-file-meta">
                    <span>{formatBytes(originalSize)}</span>
                    <span className="dot">•</span>
                    <span>{pageCount} page{pageCount === 1 ? '' : 's'}</span>
                  </div>
                </div>
              </div>

              <div className="field" style={{ marginBottom: '16px' }}>
                <label>Compression Level</label>
                <div className="cpdf-level-picker">
                  {COMPRESSION_LEVELS.map(lvl => (
                    <button
                      key={lvl.value}
                      type="button"
                      className={`cpdf-level-card ${level === lvl.value ? 'active' : ''}`}
                      aria-pressed={level === lvl.value}
                      onClick={() => setLevel(lvl.value)}
                    >
                      <span className="cpdf-level-name">{lvl.name}</span>
                      <span className="cpdf-level-detail">{lvl.detail}</span>
                    </button>
                  ))}
                </div>
                <p className="whisper-line">Medium works well for most documents. Low is great for emailing large scans.</p>
              </div>

              <button type="button" className="btn-primary" onClick={handleCompress} disabled={compressing}>
                {compressing ? 'COMPRESSING...' : 'Compress PDF'}
              </button>
            </div>

            <div className="panel-card">
              <div className="panel-head"><h2>Status</h2></div>

              <div className={`status-line ${status.type}`} style={{ marginBottom: '10px' }}>
                {status.type === 'loading' && <Loader2 size={14} className="rotating-icon" />}
                {status.type === 'success' && <CheckCircle2 size={14} />}
                {status.type === 'error' && <AlertCircle size={14} />}
                <span>{status.msg}</span>
              </div>
              <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div>

              {result && (
                <>
                  <div className="field-row" style={{ marginTop: '20px' }}>
                    <div className="kpi-tile"><span className="num">{formatBytes(originalSize)}</span><span className="label">Original</span></div>
                    <div className="kpi-tile"><span className="num">{formatBytes(result.newSize)}</span><span className="label">New Size</span></div>
                    <div className="kpi-tile">
                      <span className="num">{result.reductionPct > 0 ? `${result.reductionPct}%` : result.reductionPct < 0 ? `+${Math.abs(result.reductionPct)}%` : '0%'}</span>
                      <span className="label">{result.reductionPct > 0 ? 'Smaller' : result.reductionPct < 0 ? 'Larger' : 'No Change'}</span>
                    </div>
                  </div>
                  <div className="cpdf-size-compare-bar"><div className="cpdf-size-compare-fill" style={{ width: `${result.fillPct}%` }}></div></div>
                  <button type="button" className="btn-primary" onClick={handleDownload}><Download size={16} /> Download Compressed PDF</button>
                </>
              )}
            </div>
          </div>
        )}

      </main>
    </>
  )
}

export default CompressPdf