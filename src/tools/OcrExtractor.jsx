import { useState, useRef, useEffect } from 'react'
import { createWorker } from 'tesseract.js'
import { RotateCw, Copy, Download, Loader2, CheckCircle2, AlertCircle, ScanText, ShieldCheck, ArrowDownToLine } from 'lucide-react'
import CircularText from '../components/CircularText'
import { motion, AnimatePresence } from 'framer-motion'


const STAGE_WEIGHTS = {
  'loading tesseract core': [0, 15],
  'initializing tesseract': [15, 20],
  'loading language traineddata': [20, 45],
  'initializing api': [45, 55],
  'recognizing text': [55, 100],
}
const STAGE_LABELS = {
  'loading tesseract core': 'Loading OCR engine...',
  'initializing tesseract': 'Initializing engine...',
  'loading language traineddata': 'Loading language data...',
  'initializing api': 'Preparing scanner...',
  'recognizing text': 'Reading text...',
}


function getRotatedCanvas(img, rotation) {
  const canvas = document.createElement('canvas')
  const swapped = rotation === 90 || rotation === 270
  canvas.width = swapped ? img.naturalHeight : img.naturalWidth
  canvas.height = swapped ? img.naturalWidth : img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
  ctx.restore()
  return canvas
}

function wordCountOf(text) {
  const t = (text || '').trim()
  return t ? t.split(/\s+/).length : 0
}

function OcrExtractor() {
  const [originalFile, setOriginalFile] = useState(null)
  const [originalImage, setOriginalImage] = useState(null)
  const [rotation, setRotation] = useState(0)
  const [previewSrc, setPreviewSrc] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [text, setText] = useState('')
  const [lang, setLang] = useState('eng')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState({ msg: 'Add an image to begin.', type: 'idle' })
  const [dragging, setDragging] = useState(false)
  const [copied, setCopied] = useState(false)

  const workerRef = useRef(null)
  const workerLangRef = useRef(null)
  const dragCounterRef = useRef(0)

  useEffect(() => {
    return () => { workerRef.current?.terminate() }
  }, [])

  async function getWorker(language) {
    if (workerRef.current && workerLangRef.current === language) return workerRef.current
    if (workerRef.current) await workerRef.current.terminate()
    workerRef.current = await createWorker(language, 1, {
      logger: m => {
        const range = STAGE_WEIGHTS[m.status]
        if (range) {
          const [lo, hi] = range
          setProgress(lo + (hi - lo) * (m.progress || 0))
        }
        setStatus({ msg: STAGE_LABELS[m.status] || m.status || 'Working...', type: 'loading' })
      },
    })
    workerLangRef.current = language
    return workerRef.current
  }

  async function runOcr(img, currentRotation, language) {
    setScanning(true)
    setText('')
    setProgress(0)
    setStatus({ msg: 'Starting scanner...', type: 'loading' })

    const canvas = getRotatedCanvas(img, currentRotation)
    try {
      const worker = await getWorker(language)
      const { data } = await worker.recognize(canvas)
      setText((data.text || '').trim())
      setProgress(100)
      const n = wordCountOf(data.text)
      setStatus(n ? { msg: `Done — extracted ${n} word${n === 1 ? '' : 's'}.`, type: 'success' } : { msg: 'No text found in this image.', type: 'error' })
    } catch (err) {
      console.error('OCR error:', err)
      setStatus({ msg: `Scan failed: ${err.message}`, type: 'error' })
      setProgress(0)
    } finally {
      setScanning(false)
    }
  }

  function handleFile(file) {
    if (!file.type.startsWith('image/')) { setStatus({ msg: 'Only image files are accepted.', type: 'error' }); return }
    if (file.size > 15 * 1024 * 1024) { setStatus({ msg: 'File exceeds 15 MB.', type: 'error' }); return }

    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      setOriginalFile(file)
      setOriginalImage(img)
      setRotation(0)
      setPreviewSrc(getRotatedCanvas(img, 0).toDataURL('image/png'))
      setText('')
      runOcr(img, 0, lang)
    }
    img.onerror = () => { URL.revokeObjectURL(url); setStatus({ msg: 'Could not read this image.', type: 'error' }) }
    img.src = url
  }

  function handleRotate() {
    if (!originalImage || scanning) return
    const newRotation = (rotation + 90) % 360
    setRotation(newRotation)
    setPreviewSrc(getRotatedCanvas(originalImage, newRotation).toDataURL('image/png'))
    setStatus({ msg: 'Rotated. Re-scan to read the rotated image.', type: 'idle' })
  }

  function handleRescan() {
    if (!originalImage || scanning) return
    runOcr(originalImage, rotation, lang)
  }

  function handleChangeImage() {
    if (scanning) return
    if (text.trim() && !confirm('Change image? The extracted text will be cleared.')) return
    setOriginalFile(null); setOriginalImage(null); setRotation(0); setPreviewSrc(null); setText('')
    setStatus({ msg: 'Add an image to begin.', type: 'idle' })
  }

  async function handleCopy() {
    if (!text) { setStatus({ msg: 'Nothing to copy yet.', type: 'error' }); return }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { setStatus({ msg: 'Could not copy — select and copy manually.', type: 'error' }) }
  }

  function handleDownload() {
    if (!text) { setStatus({ msg: 'Nothing to download yet.', type: 'error' }); return }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const base = (originalFile?.name || 'scan').replace(/\.[^.]+$/, '')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `${base}-extracted.txt`; a.click()
  }

  const wordCount = wordCountOf(text)

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">MEDIA</span><span className="num">CATALOG NO. 021</span></div>
            <h1>OCR Extractor</h1>
            <p>Drop in a photo, screenshot, or scanned document and get editable, selectable text — entirely in your browser.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">CLIENT-SIDE</span>
              <span className="tool-chip">UP TO 15MB</span>
              <span className="tool-chip">10 LANGUAGES</span>
            </div>
          </div>
          <CircularText text="VISION.SYS • OCR ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>

        {!originalImage ? (
          <div className="upload-stage" style={{ maxWidth: '620px', margin: '0 auto' }}>
  <div
  className={`dropzone ${dragging ? 'drag' : ''}`}
  onClick={() => document.getElementById('ocrFileInput').click()}
  onDragEnter={e => {
    e.preventDefault()
    dragCounterRef.current += 1
    setDragging(true)
  }}
  onDragOver={e => e.preventDefault()}
  onDragLeave={e => {
    e.preventDefault()
    dragCounterRef.current -= 1
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setDragging(false)
    }
  }}
  onDrop={e => {
    e.preventDefault()
    dragCounterRef.current = 0
    setDragging(false)
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
  }}
  style={{ textAlign: 'center' }}
>
  <div className="dropzone-content">
    <div className="upload-icon-wrap">
      <ScanText size={28} />
    </div>

    <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', marginBottom: '6px' }}>
      Drag & drop an image
    </div>
    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)' }}>
      or <span style={{ color: 'var(--cobalt)', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 700 }}>click to browse</span>
    </div>

    <div className="format-pills">
      <span className="format-pill">JPG</span>
      <span className="format-pill">PNG</span>
      <span className="format-pill">WEBP</span>
      <span className="format-pill">BMP</span>
      <span className="format-pill size">≤ 15MB</span>
    </div>
  </div>

  <AnimatePresence>
    {dragging && (
      <motion.div
        className="drop-overlay"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="drop-overlay-icon">
          <ArrowDownToLine size={26} />
        </div>
        <div className="drop-overlay-text">Drop to scan</div>
      </motion.div>
    )}
  </AnimatePresence>

  <input id="ocrFileInput" type="file" accept="image/*" hidden onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
</div>

  <div className="privacy-badge">
    <ShieldCheck size={22} />
    <span>Your image is scanned right here in your browser — nothing is ever uploaded to a server.</span>
  </div>
</div>
        ) : (
          <div className="tool-workbench">
            <div className="panel-card">
              <div className="panel-head">
                <h2>Image</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn-mini" onClick={handleRotate} disabled={scanning}><RotateCw size={13} /> ROTATE 90°</button>
                  <button type="button" className="btn-mini" onClick={handleChangeImage} disabled={scanning}>CHANGE IMAGE</button>
                </div>
              </div>

              <div style={{ border: '2px solid var(--fg)', background: 'var(--bg)', minHeight: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', overflow: 'hidden' }}>
                {previewSrc && <img src={previewSrc} alt="Uploaded preview" style={{ maxWidth: '100%', maxHeight: '360px', objectFit: 'contain' }} />}
              </div>

              <div className="field" style={{ marginBottom: '16px' }}>
                <label>Language</label>
                <select value={lang} onChange={e => setLang(e.target.value)} disabled={scanning}>
                  <option value="eng">English</option>
                  <option value="hin">Hindi</option>
                  <option value="spa">Spanish</option>
                  <option value="fra">French</option>
                  <option value="deu">German</option>
                  <option value="chi_sim">Chinese (Simplified)</option>
                  <option value="ara">Arabic</option>
                  <option value="rus">Russian</option>
                  <option value="por">Portuguese</option>
                  <option value="jpn">Japanese</option>
                </select>
              </div>

              <button type="button" className="btn-primary" onClick={handleRescan} disabled={scanning}>Re-scan Image</button>
            </div>

            <div className="panel-card">
              <div className="panel-head">
                <h2>Extracted Text</h2>
                <span className="tool-chip">{wordCount} words</span>
              </div>

              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                disabled={scanning}
                placeholder={scanning ? 'Scanning...' : 'Extracted text will appear here once scanning finishes...'}
                spellCheck={false}
                style={{ width: '100%', minHeight: '300px', resize: 'vertical', background: 'var(--bg)', border: '2px solid var(--fg)', color: 'var(--fg)', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', padding: '14px', marginBottom: '16px' }}
              />

              <div className={`status-line ${status.type}`}>
                {status.type === 'loading' && <Loader2 size={14} className="rotating-icon" />}
                {status.type === 'success' && <CheckCircle2 size={14} />}
                {status.type === 'error' && <AlertCircle size={14} />}
                <span>{status.msg}</span>
              </div>
              <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-mini" onClick={handleCopy}><Copy size={13} /> {copied ? 'COPIED' : 'COPY TEXT'}</button>
                <button type="button" className="btn-primary inline" onClick={handleDownload}><Download size={14} /> DOWNLOAD .TXT</button>
              </div>
            </div>
          </div>
        )}

      </main>
    </>
  )
}

export default OcrExtractor