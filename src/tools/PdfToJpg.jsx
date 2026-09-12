import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ImageDown, CheckSquare, Square, RefreshCw, Download, Loader2, CheckCircle2, AlertCircle, ArrowDownToLine, ShieldCheck, Check } from 'lucide-react'
import CircularText from '../components/CircularText'
import '../utils/pdfWorker'
import { getDocument } from 'pdfjs-dist'
import { API_BASE } from '../config/api'
import { mapWithConcurrency, formatBytes, renderPageThumbnail } from '../utils/mergePdfHelpers'
import { MAX_FILE_BYTES, validateSplitFile, setToRangesString } from '../utils/splitPdfHelpers'

const DPI_OPTIONS = [
  { value: '72', label: '72 (low)' },
  { value: '150', label: '150 (recommended)' },
  { value: '200', label: '200 (high)' },
  { value: '300', label: '300 (very high)' },
]
const QUALITY_OPTIONS = [
  { value: '70', label: '70 (small files)' },
  { value: '85', label: '85 (recommended)' },
  { value: '95', label: '95 (high)' },
]

function PdfToJpg() {
  const [file, setFile] = useState(null)
  const [totalPages, setTotalPages] = useState(0)
  const [thumbnails, setThumbnails] = useState({}) // { [pageNum]: dataUrl }
  const [selected, setSelected] = useState(new Set())
  const [dpi, setDpi] = useState('150')
  const [quality, setQuality] = useState('85')
  const [status, setStatus] = useState({ msg: 'Select a PDF to begin.', type: 'idle' })
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [converting, setConverting] = useState(false)
  const [result, setResult] = useState(null) // { url, filename }

  const dragCounterRef = useRef(0)
  const fileInputRef = useRef(null)

  const isAllSelected = totalPages > 0 && selected.size === totalPages
  const isNoneSelected = selected.size === 0

  async function handleFile(f) {
    const check = validateSplitFile(f)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }

    setStatus({ msg: 'Loading PDF...', type: 'loading' })
    setProgress(20)

    try {
      const buf = await f.arrayBuffer()
      const pdfDoc = await getDocument({ data: buf }).promise

      setFile(f)
      setTotalPages(pdfDoc.numPages)
      // Default: everything selected — the common case is "convert the
      // whole document," and any page can be excluded with a click.
      setSelected(new Set(Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1)))
      setThumbnails({})
      setResult(null)

      setStatus({ msg: 'Rendering thumbnails...', type: 'loading' })
      setProgress(40)

      const pageNums = Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1)
      await mapWithConcurrency(pageNums, 4, async (pageNum) => {
        try {
          const thumb = await renderPageThumbnail(pdfDoc, pageNum, 0)
          setThumbnails(prev => ({ ...prev, [pageNum]: thumb }))
        } catch (err) {
          console.error('Thumbnail render error:', err)
        }
      })

      setStatus({ msg: 'PDF loaded. All pages are selected — click any to exclude it.', type: 'idle' })
      setProgress(0)
    } catch (err) {
      console.error('PDF load error:', err)
      setStatus({ msg: `Error loading PDF: ${err.message}`, type: 'error' })
      setProgress(0)
    }
  }

  function togglePage(pageNum) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(pageNum)) next.delete(pageNum)
      else next.add(pageNum)
      return next
    })
  }

  function handleSelectAll() {
    setSelected(new Set(Array.from({ length: totalPages }, (_, i) => i + 1)))
  }

  function handleSelectNone() {
    setSelected(new Set())
  }

  function handleInvert() {
    const next = new Set()
    for (let p = 1; p <= totalPages; p++) {
      if (!selected.has(p)) next.add(p)
    }
    setSelected(next)
  }

  function resetAll() {
    setFile(null)
    setTotalPages(0)
    setSelected(new Set())
    setThumbnails({})
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setStatus({ msg: 'Select a PDF to begin.', type: 'idle' })
    setProgress(0)
  }

  function handleChangePdfClick() {
    if (totalPages && selected.size !== totalPages && !confirm('Change PDF? Your page selection will be cleared.')) return
    resetAll()
  }

  async function handleConvert() {
    const check = validateSplitFile(file)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }
    if (selected.size === 0) { setStatus({ msg: 'Select at least one page first.', type: 'error' }); return }

    const pages = isAllSelected ? 'all' : setToRangesString(selected)

    setConverting(true)
    setResult(null)
    setStatus({ msg: 'Preparing PDF...', type: 'loading' })
    setProgress(15)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('dpi', dpi)
      formData.append('quality', quality)
      formData.append('pages', pages)

      setStatus({ msg: 'Uploading to server...', type: 'loading' })
      setProgress(35)

      const response = await fetch(`${API_BASE}/api/pdf-to-jpg`, { method: 'POST', body: formData })

      setStatus({ msg: 'Converting PDF to JPG...', type: 'loading' })
      setProgress(65)

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Server error: ${response.status}`)
      }

      setStatus({ msg: 'Preparing download...', type: 'loading' })
      setProgress(85)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const base = (file.name || 'document.pdf').replace(/\.pdf$/i, '') || 'pages'
      const filename = `${base}.zip`

      setProgress(100)
      setStatus({ msg: 'Conversion complete!', type: 'success' })
      setResult({ url, filename })

      const tempLink = document.createElement('a')
      tempLink.href = url
      tempLink.download = filename
      tempLink.click()
    } catch (err) {
      console.error('Conversion failed:', err)
      setStatus({ msg: `Error: ${err.message}`, type: 'error' })
      setProgress(0)
    } finally {
      setConverting(false)
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
            <div className="tool-crumb"><span className="cat">PDF</span><span className="num">CATALOG NO. 111</span></div>
            <h1>PDF to JPG</h1>
            <p>Convert PDF pages into high-quality JPG images, delivered as a ZIP file.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">SERVER-SIDE</span>
              <span className="tool-chip">UP TO 20MB</span>
            </div>
          </div>
          <CircularText text="RENDER.SYS • PDF ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>

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
                  <div className="upload-icon-wrap"><ImageDown size={28} /></div>
                  <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', marginBottom: '6px' }}>Drag & drop a PDF</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)' }}>
                    or <span style={{ color: 'var(--cobalt)', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 700 }}>click to browse</span>
                  </div>
                  <div className="format-pills">
                    <span className="format-pill">PDF</span>
                    <span className="format-pill size">≤ {formatBytes(MAX_FILE_BYTES)}</span>
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
          <div className="panel-card">
            <div className="panel-head">
              <h2>Pages</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="tool-chip">{file.name} · {formatBytes(file.size)} · {totalPages} page{totalPages === 1 ? '' : 's'}</span>
                <button type="button" className={`btn-mini ${isAllSelected ? 'pressed' : ''}`} aria-pressed={isAllSelected} onClick={handleSelectAll}>
                  {isAllSelected ? <CheckSquare size={13} /> : <Square size={13} />} ALL
                </button>
                <button type="button" className={`btn-mini ${isNoneSelected ? 'pressed' : ''}`} aria-pressed={isNoneSelected} onClick={handleSelectNone}>
                  {isNoneSelected ? <CheckSquare size={13} /> : <Square size={13} />} NONE
                </button>
                <button type="button" className="btn-mini" onClick={handleInvert}><RefreshCw size={13} /> INVERT</button>
                <button type="button" className="btn-mini" onClick={handleChangePdfClick}>CHANGE PDF</button>
              </div>
            </div>

            <p className="whisper-line" style={{ marginBottom: '16px' }}>Click pages to choose which ones export as JPG — all pages are selected by default.</p>

            <div className="spdf-pages-grid">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                <div
                  key={pageNum}
                  className={`spdf-page-card ${selected.has(pageNum) ? 'selected' : ''}`}
                  onClick={() => togglePage(pageNum)}
                >
                  <div className={`spdf-page-thumb ${thumbnails[pageNum] ? '' : 'loading'}`}>
                    <span className="spdf-page-num">{pageNum}</span>
                    <span className="spdf-page-check">{selected.has(pageNum) && <Check size={12} />}</span>
                    {thumbnails[pageNum]
                      ? <img src={thumbnails[pageNum]} alt={`Page ${pageNum}`} />
                      : <Loader2 size={18} className="rotating-icon" />}
                  </div>
                </div>
              ))}
            </div>

            <div className="field-row" style={{ marginBottom: '20px' }}>
              <div className="field">
                <label>DPI (Resolution)</label>
                <select value={dpi} onChange={e => setDpi(e.target.value)}>
                  {DPI_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <p className="whisper-line">Higher DPI yields sharper images but larger files.</p>
              </div>
              <div className="field">
                <label>JPG Quality</label>
                <select value={quality} onChange={e => setQuality(e.target.value)}>
                  {QUALITY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <p className="whisper-line">Controls JPG compression level.</p>
              </div>
            </div>

            <div style={{ borderTop: '2px solid var(--fg)', paddingTop: '20px' }}>
              <div className={`status-line ${status.type}`} style={{ marginBottom: '10px' }}>
                {status.type === 'loading' && <Loader2 size={14} className="rotating-icon" />}
                {status.type === 'success' && <CheckCircle2 size={14} />}
                {status.type === 'error' && <AlertCircle size={14} />}
                <span>{status.msg}</span>
              </div>
              <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', maxWidth: '420px' }}>
                <button type="button" className="btn-primary" onClick={handleConvert} disabled={converting || selected.size === 0}>
                  {converting ? 'CONVERTING...' : 'Convert to JPG'}
                </button>
              </div>

              {result && (
                <div style={{ marginTop: '16px', maxWidth: '420px' }}>
                  <button type="button" className="btn-primary" onClick={handleDownload}><Download size={16} /> Download ZIP</button>
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </>
  )
}

export default PdfToJpg