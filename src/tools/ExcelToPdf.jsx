import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileSpreadsheet, Download, Loader2, CheckCircle2, AlertCircle, ArrowDownToLine, ShieldCheck } from 'lucide-react'
import CircularText from '../components/CircularText'
import { API_BASE } from '../config/api'
import { formatBytes, validateExcelFile, countSheets } from '../utils/excelToPdfHelpers'

function ExcelToPdf() {
  const [file, setFile] = useState(null)
  const [originalSize, setOriginalSize] = useState(0)
  const [sheetCount, setSheetCount] = useState(null) // null = unknown (e.g. legacy .xls), not zero
  const [status, setStatus] = useState({ msg: 'Add a spreadsheet to begin.', type: 'idle' })
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [converting, setConverting] = useState(false)
  const [result, setResult] = useState(null) // { url, filename, newSize }

  const dragCounterRef = useRef(0)
  const fileInputRef = useRef(null)

  async function handleFile(f) {
    const check = validateExcelFile(f)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }

    setStatus({ msg: 'Reading spreadsheet...', type: 'loading' })
    setProgress(15)

    let sheets = null
    try {
      sheets = await countSheets(f)
    } catch (err) {
      // Legacy .xls (not a zip) or an unreadable/corrupt file -- sheet
      // count just isn't shown; the file can still be converted server-side.
      sheets = null
    }

    setFile(f)
    setOriginalSize(f.size || 0)
    setSheetCount(sheets)
    setResult(null)
    setStatus({ msg: 'Ready to convert.', type: 'idle' })
    setProgress(0)
  }

  function handleChangeFile() {
    if (result?.url) URL.revokeObjectURL(result.url)
    setFile(null)
    setOriginalSize(0)
    setSheetCount(null)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setStatus({ msg: 'Add a spreadsheet to begin.', type: 'idle' })
    setProgress(0)
  }

  async function handleConvert() {
    const check = validateExcelFile(file)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }

    setConverting(true)
    setResult(null)
    setStatus({ msg: 'Uploading spreadsheet...', type: 'loading' })
    setProgress(25)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE}/api/excel-to-pdf`, { method: 'POST', body: formData })

      setStatus({ msg: 'Converting to PDF...', type: 'loading' })
      setProgress(65)

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Server error: ${response.status}`)
      }

      setStatus({ msg: 'Preparing download...', type: 'loading' })
      setProgress(85)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const base = (file.name || 'spreadsheet.xlsx').replace(/\.xlsx?$/i, '') || 'spreadsheet'
      const filename = `${base}.pdf`
      const newSize = blob.size

      setProgress(100)
      setStatus({ msg: 'Conversion complete!', type: 'success' })
      setResult({ url, filename, newSize })

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
            {/* TODO: confirm the next unused catalog number against the other tools before shipping */}
            <div className="tool-crumb"><span className="cat">PDF</span><span className="num">CATALOG NO. ???</span></div>
            <h1>Excel to PDF</h1>
            <p>Convert spreadsheets to crisp PDFs, with formatting and formulas preserved.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">SERVER-SIDE</span>
              <span className="tool-chip">UP TO 20MB</span>
            </div>
          </div>
          <CircularText text="XLPDF.SYS • PDF ENGINE • " spinDuration={18} onHover="speedUp" />
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
                <div className="upload-icon-wrap"><FileSpreadsheet size={28} /></div>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', marginBottom: '6px' }}>Drag & drop a spreadsheet</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)' }}>
                  or <span style={{ color: 'var(--cobalt)', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 700 }}>click to browse</span>
                </div>
                <div className="format-pills">
                  <span className="format-pill">XLS</span>
                  <span className="format-pill">XLSX</span>
                  <span className="format-pill size">≤ 20MB</span>
                </div>
              </div>
              <AnimatePresence>
                {dragging && (
                  <motion.div className="drop-overlay" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
                    <div className="drop-overlay-icon"><ArrowDownToLine size={26} /></div>
                    <div className="drop-overlay-text">Drop to convert</div>
                  </motion.div>
                )}
              </AnimatePresence>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" hidden onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
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
                <button type="button" className="btn-mini" onClick={handleChangeFile}>CHANGE FILE</button>
              </div>

              <div className="xlpdf-file-card">
                <div className="xlpdf-file-icon"><FileSpreadsheet size={26} /></div>
                <div className="xlpdf-file-info">
                  <div className="xlpdf-file-name">{file.name}</div>
                  <div className="xlpdf-file-meta">
                    <span>{formatBytes(originalSize)}</span>
                    {sheetCount != null && (
                      <>
                        <span className="dot">•</span>
                        <span>{sheetCount} sheet{sheetCount === 1 ? '' : 's'}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <p className="whisper-line" style={{ marginBottom: '16px' }}>All sheets are converted automatically, with formatting and formulas preserved by the conversion engine.</p>

              <button type="button" className="btn-primary" onClick={handleConvert} disabled={converting}>
                {converting ? 'CONVERTING...' : 'Convert to PDF'}
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
                    <div className="kpi-tile"><span className="num">{formatBytes(result.newSize)}</span><span className="label">PDF Size</span></div>
                  </div>
                  <button type="button" className="btn-primary" style={{ marginTop: '16px' }} onClick={handleDownload}><Download size={16} /> Download PDF</button>
                </>
              )}
            </div>
          </div>
        )}

      </main>
    </>
  )
}

export default ExcelToPdf
