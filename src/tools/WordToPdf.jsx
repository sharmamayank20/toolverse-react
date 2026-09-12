import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import mammoth from 'mammoth'
import {
  FileText, Copy, Check, Download, Loader2, CheckCircle2, AlertCircle,
  ArrowDownToLine, ShieldCheck, ChevronDown, ChevronUp, Info,
} from 'lucide-react'
import CircularText from '../components/CircularText'
import { API_BASE } from '../config/api'
import { MAX_FILE_BYTES, validateWordFile, isDocxFile, estimatePagesFromWordCount, estimatePagesFromSize } from '../utils/wordToPdfHelpers'

function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0, v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function WordToPdf() {
  const [file, setFile] = useState(null)
  const [isDocx, setIsDocx] = useState(false)
  const [wordCount, setWordCount] = useState(null)
  const [pageEstimate, setPageEstimate] = useState(null)
  const [rawText, setRawText] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewUnavailable, setPreviewUnavailable] = useState(false)
  const [previewUnavailableMsg, setPreviewUnavailableMsg] = useState('')
  const [warnings, setWarnings] = useState([])
  const [warningsOpen, setWarningsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const [status, setStatus] = useState({ msg: 'Select a Word file to begin.', type: 'idle' })
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [converting, setConverting] = useState(false)
  const [result, setResult] = useState(null) // { url, filename }

  const dragCounterRef = useRef(0)
  const fileInputRef = useRef(null)

  async function handleFile(f) {
    const check = validateWordFile(f)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }

    const docx = isDocxFile(f)
    setFile(f)
    setIsDocx(docx)
    setResult(null)
    setWordCount(null)
    setPageEstimate(null)
    setRawText('')
    setPreviewHtml('')
    setWarnings([])
    setPreviewUnavailable(false)
    setStatus({ msg: 'Ready to convert.', type: 'idle' })
    setProgress(0)

    if (docx) {
      await renderPreview(f)
    } else {
      setPageEstimate(estimatePagesFromSize(f.size))
      setPreviewUnavailable(true)
      setPreviewUnavailableMsg("Preview isn't available for legacy .doc files — only .docx. Conversion still works fine either way.")
    }
  }

  async function renderPreview(f) {
    setPreviewLoading(true)
    try {
      const buf = await f.arrayBuffer()
      const [htmlResult, textResult] = await Promise.all([
        mammoth.convertToHtml({ arrayBuffer: buf }),
        mammoth.extractRawText({ arrayBuffer: buf }),
      ])

      setPreviewHtml(htmlResult.value || '')
      setWarnings((htmlResult.messages || []).map(m => m.message))

      const text = (textResult.value || '').trim()
      setRawText(text)
      const count = text ? text.split(/\s+/).filter(Boolean).length : 0
      setWordCount(count)
      setPageEstimate(estimatePagesFromWordCount(count))
    } catch (err) {
      console.error('Preview failed:', err)
      setPreviewUnavailable(true)
      setPreviewUnavailableMsg("Couldn't generate a preview for this file. Conversion still works fine.")
      setPageEstimate(estimatePagesFromSize(f.size))
    } finally {
      setPreviewLoading(false)
    }
  }

  function resetAll() {
    setFile(null)
    setIsDocx(false)
    setWordCount(null)
    setPageEstimate(null)
    setRawText('')
    setPreviewHtml('')
    setWarnings([])
    setPreviewUnavailable(false)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setStatus({ msg: 'Select a Word file to begin.', type: 'idle' })
    setProgress(0)
  }

  async function handleCopyText() {
    if (!rawText) return
    try {
      await navigator.clipboard.writeText(rawText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  async function handleConvert() {
    const check = validateWordFile(file)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }

    setConverting(true)
    setResult(null)
    setStatus({ msg: 'Uploading to server...', type: 'loading' })
    setProgress(30)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE}/api/word-to-pdf`, { method: 'POST', body: formData })

      setStatus({ msg: 'Converting Word to PDF...', type: 'loading' })
      setProgress(60)

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Server error: ${response.status}`)
      }

      setStatus({ msg: 'Finalizing download...', type: 'loading' })
      setProgress(90)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const base = (file.name || 'document').replace(/\.(docx|doc)$/i, '') || 'document'
      const filename = `${base}.pdf`

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
            <div className="tool-crumb"><span className="cat">PDF</span><span className="num">CATALOG NO. 112</span></div>
            <h1>Word to PDF</h1>
            <p>Export DOCX to clean, consistent PDFs with privacy-first processing and smart defaults.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">SERVER-SIDE</span>
              <span className="tool-chip">UP TO 20MB</span>
            </div>
          </div>
          <CircularText text="DOCX.SYS • PDF ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '44px 40px 100px', width: '100%' }}>

        {!file ? (
          <div className="upload-stage">
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
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', marginBottom: '6px' }}>Drag & drop a Word file</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)' }}>
                  or <span style={{ color: 'var(--cobalt)', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 700 }}>click to browse</span>
                </div>
                <div className="format-pills">
                  <span className="format-pill">DOCX</span>
                  <span className="format-pill">DOC</span>
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
              <input ref={fileInputRef} type="file" accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword" hidden onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
            </div>
            <div className="privacy-badge">
              <ShieldCheck size={22} />
              <span>.docx files show a real content preview right here before you convert. Files are automatically deleted from the server within 15 minutes.</span>
            </div>
          </div>
        ) : (
          <div className="panel-card">
            <div className="panel-head">
              <h2>Document</h2>
              <button type="button" className="btn-mini" onClick={resetAll}>CHANGE FILE</button>
            </div>

            <div className="eword-file-card">
              <div className="eword-file-ico"><FileText size={22} /></div>
              <div className="eword-file-info">
                <div className="eword-file-name">{file.name}</div>
                <div className="eword-file-meta">
                  <span>{formatBytes(file.size)}</span>
                  <span className="dot">•</span>
                  <span>{wordCount != null ? `${wordCount.toLocaleString()} words` : '—'}</span>
                  <span className="dot">•</span>
                  <span>{pageEstimate ? `~${pageEstimate} page${pageEstimate === 1 ? '' : 's'} (est.)` : '—'}</span>
                </div>
              </div>
              <span className="tool-chip">{isDocx ? 'DOCX' : 'DOC'}</span>
            </div>

            <div className="field" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ marginBottom: 0 }}>Content Preview</label>
                {rawText && (
                  <button type="button" className="btn-mini" onClick={handleCopyText}>
                    {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'COPIED' : 'COPY TEXT'}
                  </button>
                )}
              </div>

              {previewLoading && (
                <div className="dropzone-loading" style={{ padding: '40px 0' }}>
                  <Loader2 size={28} className="rotating-icon" />
                  <div className="dropzone-loading-text">Reading document...</div>
                </div>
              )}

              {!previewLoading && previewHtml && (
                <div className="eword-preview-box" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              )}

              {!previewLoading && previewUnavailable && (
                <div className="eword-preview-unavailable">
                  <Info size={16} />
                  <p>{previewUnavailableMsg}</p>
                </div>
              )}

              {warnings.length > 0 && (
                <div className="eword-warnings">
                  <button type="button" className="eword-warnings-toggle" onClick={() => setWarningsOpen(v => !v)}>
                    <AlertCircle size={13} />
                    <span>{warnings.length} formatting note{warnings.length === 1 ? '' : 's'} from the preview conversion</span>
                    {warningsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  {warningsOpen && (
                    <ul className="eword-warnings-list">
                      {warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                </div>
              )}

              <p className="whisper-line" style={{ marginTop: '10px' }}>This shows the document's actual text and structure — the final PDF's exact fonts, spacing, and page breaks may differ slightly, since those come from LibreOffice's own layout engine.</p>
            </div>

            <div style={{ borderTop: '2px solid var(--fg)', paddingTop: '20px' }}>
              <div className={`status-line ${status.type}`} style={{ marginBottom: '10px' }}>
                {status.type === 'loading' && <Loader2 size={14} className="rotating-icon" />}
                {status.type === 'success' && <CheckCircle2 size={14} />}
                {status.type === 'error' && <AlertCircle size={14} />}
                <span>{status.msg}</span>
              </div>
              <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div>

              <button type="button" className="btn-primary" style={{ marginTop: '16px' }} onClick={handleConvert} disabled={converting}>
                {converting ? 'CONVERTING...' : 'Convert to PDF'}
              </button>

              {result && (
                <button type="button" className="btn-primary" style={{ marginTop: '10px' }} onClick={handleDownload}>
                  <Download size={16} /> Download PDF
                </button>
              )}
            </div>
          </div>
        )}

      </main>
    </>
  )
}

export default WordToPdf