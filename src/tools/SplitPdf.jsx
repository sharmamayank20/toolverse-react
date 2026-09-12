import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Scissors, CheckSquare, Square, RefreshCw, Download, Loader2, CheckCircle2, AlertCircle, ArrowDownToLine, ShieldCheck, Check } from 'lucide-react'
import CircularText from '../components/CircularText'
import Modal from '../components/Modal'
import '../utils/pdfWorker'
import { getDocument } from 'pdfjs-dist'
import { API_BASE } from '../config/api'
import { mapWithConcurrency, formatBytes, renderPageThumbnail } from '../utils/mergePdfHelpers'
import { MAX_FILE_BYTES, validateSplitFile, parseRangesToSet, setToRangesString } from '../utils/splitPdfHelpers'

function SplitPdf() {
  const [file, setFile] = useState(null)
  const [totalPages, setTotalPages] = useState(0)
  const [thumbnails, setThumbnails] = useState({}) // { [pageNum]: dataUrl }
  const [selected, setSelected] = useState(new Set())
  const [rangesText, setRangesText] = useState('')
  const [outputMode, setOutputMode] = useState('single') // 'single' | 'separate'
  const [status, setStatus] = useState({ msg: 'Add a PDF to begin.', type: 'idle' })
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [splitting, setSplitting] = useState(false)
  const [result, setResult] = useState(null) // { url, filename, isZip }
  const [confirmOpen, setConfirmOpen] = useState(false)

  const pdfDocRef = useRef(null)
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
      pdfDocRef.current = pdfDoc

      setFile(f)
      setTotalPages(pdfDoc.numPages)
      setSelected(new Set())
      setRangesText('')
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

      setStatus({ msg: 'PDF loaded. Click pages or type ranges to select what to extract.', type: 'idle' })
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
      setRangesText(setToRangesString(next))
      return next
    })
  }

  function handleSelectAll() {
    const next = new Set(Array.from({ length: totalPages }, (_, i) => i + 1))
    setSelected(next)
    setRangesText(setToRangesString(next))
  }

  function handleSelectNone() {
    setSelected(new Set())
    setRangesText('')
  }

  function handleInvert() {
    const next = new Set()
    for (let p = 1; p <= totalPages; p++) {
      if (!selected.has(p)) next.add(p)
    }
    setSelected(next)
    setRangesText(setToRangesString(next))
  }

  function handleRangesChange(value) {
    setRangesText(value)
    setSelected(parseRangesToSet(value, totalPages))
  }

  function handleRangesBlur() {
    setRangesText(setToRangesString(selected))
  }

  function resetAll() {
    pdfDocRef.current = null
    setFile(null)
    setTotalPages(0)
    setSelected(new Set())
    setRangesText('')
    setThumbnails({})
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setStatus({ msg: 'Add a PDF to begin.', type: 'idle' })
    setProgress(0)
  }

  function handleChangePdfClick() {
    if (selected.size > 0) { setConfirmOpen(true); return }
    resetAll()
  }

  function confirmChangePdf() {
    setConfirmOpen(false)
    resetAll()
  }

  async function handleSplit() {
    const check = validateSplitFile(file)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }
    if (selected.size === 0) { setStatus({ msg: 'Select at least one page first.', type: 'error' }); return }

    const ranges = setToRangesString(selected)
    setSplitting(true)
    setResult(null)
    setStatus({ msg: 'Preparing PDF...', type: 'loading' })
    setProgress(15)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('ranges', ranges)
      formData.append('outputMode', outputMode)

      setStatus({ msg: 'Uploading to server...', type: 'loading' })
      setProgress(35)

      const response = await fetch(`${API_BASE}/api/split-pdf`, { method: 'POST', body: formData })

      setStatus({ msg: outputMode === 'separate' ? 'Splitting into separate PDFs...' : 'Extracting pages...', type: 'loading' })
      setProgress(65)

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Server error: ${response.status}`)
      }

      setStatus({ msg: 'Preparing download...', type: 'loading' })
      setProgress(85)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const base = (file.name || 'document.pdf').replace(/\.pdf$/i, '') || 'split'
      const isZip = outputMode === 'separate'
      const filename = isZip ? `${base}-pages.zip` : `${base}-split.pdf`

      setProgress(100)
      setStatus({ msg: 'Split complete!', type: 'success' })
      setResult({ url, filename, isZip })

      const tempLink = document.createElement('a')
      tempLink.href = url
      tempLink.download = filename
      tempLink.click()
    } catch (err) {
      console.error('Split failed:', err)
      setStatus({ msg: `Error: ${err.message}`, type: 'error' })
      setProgress(0)
    } finally {
      setSplitting(false)
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
            <div className="tool-crumb"><span className="cat">PDF</span><span className="num">CATALOG NO. 103</span></div>
            <h1>Split PDF</h1>
            <p>Extract specific pages or ranges from your PDF into a new document.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">SERVER-SIDE</span>
              <span className="tool-chip">UP TO 20MB</span>
            </div>
          </div>
          <CircularText text="SPLIT.SYS • PDF ENGINE • " spinDuration={18} onHover="speedUp" />
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
                <div className="upload-icon-wrap"><Scissors size={28} /></div>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', marginBottom: '6px' }}>Drag & drop a PDF</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)' }}>
                  or <span style={{ color: 'var(--cobalt)', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 700 }}>click to browse</span>
                </div>
                <div className="format-pills">
                  <span className="format-pill">PDF</span>
                  <span className="format-pill size">≤ {formatBytes(MAX_FILE_BYTES)}</span>
                </div>
              </div>
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

            <p className="whisper-line" style={{ marginBottom: '16px' }}>Click pages to select them, or type ranges below — either way stays in sync.</p>

            <div className="field" style={{ marginBottom: '20px' }}>
              <label>Page Ranges</label>
              <input
                type="text"
                value={rangesText}
                onChange={e => handleRangesChange(e.target.value)}
                onBlur={handleRangesBlur}
                placeholder="e.g., 1-3, 5, 7-10"
              />
              <p className="whisper-line">Extracted pages are always ordered ascending by page number, regardless of click or entry order.</p>
            </div>

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

            <div className="field" style={{ marginBottom: '20px' }}>
              <label>Output</label>
              <div style={{ display: 'flex', gap: '8px', maxWidth: '560px' }}>
                <button type="button" className={`btn-mini ${outputMode === 'single' ? 'pressed' : ''}`} aria-pressed={outputMode === 'single'} onClick={() => setOutputMode('single')} style={{ flex: 1, justifyContent: 'center' }}>
  ONE COMBINED PDF
</button>
<button type="button" className={`btn-mini ${outputMode === 'separate' ? 'pressed' : ''}`} aria-pressed={outputMode === 'separate'} onClick={() => setOutputMode('separate')} style={{ flex: 1, justifyContent: 'center' }}>
  SEPARATE PDF PER PAGE (.ZIP)
</button>
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
                <button type="button" className="btn-primary" onClick={handleSplit} disabled={splitting || selected.size === 0}>
                  {splitting ? 'SPLITTING...' : 'Split PDF'}
                </button>
              </div>

              {result && (
                <div style={{ marginTop: '16px', maxWidth: '420px' }}>
                  <button type="button" className="btn-primary" onClick={handleDownload}>
                    <Download size={16} /> {result.isZip ? 'Download ZIP of split pages' : 'Download split PDF'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Clear page selection?">
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', marginBottom: '20px' }}>
          Changing the PDF will clear your current page selection. This can't be undone.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-mini" onClick={() => setConfirmOpen(false)}>CANCEL</button>
          <button type="button" className="btn-primary inline" onClick={confirmChangePdf}>CHANGE PDF</button>
        </div>
      </Modal>
    </>
  )
}

export default SplitPdf