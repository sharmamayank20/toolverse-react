import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Images, Plus, Trash2, Download, Loader2, CheckCircle2, AlertCircle, ArrowDownToLine, Check } from 'lucide-react'
import Sortable from 'sortablejs'
import CircularText from '../../components/CircularText'
import Modal from '../../components/Modal'
import { API_BASE } from '../../config/api'
import { formatBytes } from '../../utils/mergePdfHelpers'
import { MAX_TOTAL_BYTES, validateNewImageFiles, computeLayout } from '../../utils/jpgToPdfHelpers'
import ImageCard from './ImageCard'

const PAGE_SIZES = [
  { value: 'fit', label: 'Fit to image' },
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
  { value: 'square', label: 'Square' },
]
const ORIENTATIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
]
const MARGINS = [
  { value: 'none', label: 'None' },
  { value: 'small', label: 'Small' },
  { value: 'large', label: 'Large' },
]

function JpgToPdf() {
  const [images, setImages] = useState([]) // [{uid, file, objectUrl, rotation, naturalWidth, naturalHeight}]
  const [pageSize, setPageSize] = useState('fit')
  const [orientation, setOrientation] = useState('auto')
  const [margin, setMargin] = useState('none')

  const [status, setStatus] = useState({ msg: 'Select images to begin.', type: 'idle' })
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [converting, setConverting] = useState(false)
  const [result, setResult] = useState(null) // { url, filename }
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  const nextUidRef = useRef(1)
  const gridRef = useRef(null)
  const sortableRef = useRef(null)
  const dragCounterRef = useRef(0)
  const fileInputRef = useRef(null)

  const totalBytes = images.reduce((s, e) => s + (e.file.size || 0), 0)
  const orientationEnabled = pageSize !== 'fit' && pageSize !== 'square'

  useEffect(() => {
    if (!images.length) return
    const container = gridRef.current
    if (!container) return
    sortableRef.current = Sortable.create(container, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onEnd: () => {
        const domUids = [...container.querySelectorAll('.ejpg-image-card')].map(c => Number(c.dataset.uid))
        setImages(prev => domUids.map(uid => prev.find(e => e.uid === uid)).filter(Boolean))
      },
    })
    return () => { sortableRef.current?.destroy(); sortableRef.current = null }
  }, [images.length > 0])

  function handleFilesChosen(fileList) {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return

    const check = validateNewImageFiles(incoming, totalBytes)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }

    const newEntries = incoming.map(file => ({
      uid: nextUidRef.current++,
      file,
      objectUrl: URL.createObjectURL(file),
      rotation: 0,
      naturalWidth: 0,
      naturalHeight: 0,
    }))

    setImages(prev => [...prev, ...newEntries])
    setStatus({ msg: `${images.length + newEntries.length} image${images.length + newEntries.length === 1 ? '' : 's'} ready.`, type: 'idle' })
    setProgress(0)

    // Natural dimensions load progressively — the grid shows immediately
    // with a default silhouette, then each card's real page-shape
    // preview snaps in as its image finishes loading.
    newEntries.forEach(entry => {
      const img = new Image()
      img.onload = () => {
        setImages(prev => prev.map(e => e.uid === entry.uid ? { ...e, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight } : e))
      }
      img.src = entry.objectUrl
    })
  }

  function handleRotate(uid) {
    setImages(prev => prev.map(e => e.uid === uid ? { ...e, rotation: (e.rotation + 90) % 360 } : e))
  }

  function handleRemove(uid) {
    setImages(prev => {
      const entry = prev.find(e => e.uid === uid)
      if (entry) URL.revokeObjectURL(entry.objectUrl)
      const next = prev.filter(e => e.uid !== uid)
      setStatus({ msg: next.length ? `${next.length} image${next.length === 1 ? '' : 's'} ready.` : 'Select images to begin.', type: 'idle' })
      return next
    })
  }

  function resetAll() {
    images.forEach(e => URL.revokeObjectURL(e.objectUrl))
    setImages([])
    setPageSize('fit')
    setOrientation('auto')
    setMargin('none')
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setStatus({ msg: 'Select images to begin.', type: 'idle' })
    setProgress(0)
  }

  function handleClearAllClick() {
    if (!images.length) { resetAll(); return }
    setConfirmClearAll(true)
  }

  function confirmClearAllYes() {
    setConfirmClearAll(false)
    resetAll()
  }

  async function handleConvert() {
    if (images.length === 0) { setStatus({ msg: 'Add at least one image.', type: 'error' }); return }

    setConverting(true)
    setResult(null)
    setStatus({ msg: 'Preparing images...', type: 'loading' })
    setProgress(15)

    try {
      const formData = new FormData()
      images.forEach(entry => formData.append('files', entry.file))
      formData.append('pageSize', pageSize)
      formData.append('orientation', orientation)
      formData.append('margin', margin)
      formData.append('rotations', JSON.stringify(images.map(e => e.rotation)))

      setStatus({ msg: 'Uploading to server...', type: 'loading' })
      setProgress(35)

      const response = await fetch(`${API_BASE}/api/jpg-to-pdf`, { method: 'POST', body: formData })

      setStatus({ msg: 'Converting images to PDF...', type: 'loading' })
      setProgress(65)

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Server error: ${response.status}`)
      }

      setStatus({ msg: 'Preparing download...', type: 'loading' })
      setProgress(85)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const filename = 'images-converted.pdf'

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
            <div className="tool-crumb"><span className="cat">PDF</span><span className="num">CATALOG NO. 110</span></div>
            <h1>JPG to PDF</h1>
            <p>Combine images into a neat PDF with page size, margins, and ordering controls.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">SERVER-SIDE</span>
              <span className="tool-chip">UP TO 20MB TOTAL</span>
            </div>
          </div>
          <CircularText text="IMAGE.SYS • PDF ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '44px 40px 100px' }}>

        {images.length === 0 ? (
          <div className="upload-stage" style={{ maxWidth: '620px', margin: '0 auto' }}>
            <div
              className={`dropzone ${dragging ? 'drag' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={e => { e.preventDefault(); dragCounterRef.current += 1; setDragging(true) }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={e => { e.preventDefault(); dragCounterRef.current -= 1; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragging(false) } }}
              onDrop={e => { e.preventDefault(); dragCounterRef.current = 0; setDragging(false); if (e.dataTransfer.files.length) handleFilesChosen(e.dataTransfer.files) }}
              style={{ textAlign: 'center' }}
            >
              <div className="dropzone-content">
                <div className="upload-icon-wrap"><Images size={28} /></div>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', marginBottom: '6px' }}>Drag & drop images</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)' }}>
                  or <span style={{ color: 'var(--cobalt)', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 700 }}>click to browse</span>
                </div>
                <div className="format-pills">
                  <span className="format-pill">JPG</span>
                  <span className="format-pill">PNG</span>
                  <span className="format-pill size">≤ {formatBytes(MAX_TOTAL_BYTES)} total</span>
                </div>
              </div>
              <AnimatePresence>
                {dragging && (
                  <motion.div className="drop-overlay" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
                    <div className="drop-overlay-icon"><ArrowDownToLine size={26} /></div>
                    <div className="drop-overlay-text">Drop to add</div>
                  </motion.div>
                )}
              </AnimatePresence>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png" multiple hidden onChange={e => { handleFilesChosen(e.target.files); e.target.value = '' }} />
            </div>
            <div className="privacy-badge">
              <ArrowDownToLine size={22} />
              <span>Files are automatically deleted from the server within 15 minutes.</span>
            </div>
          </div>
        ) : (
          <div className="panel-card">
            <div className="panel-head">
              <h2>Images</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className="tool-chip">{images.length} image{images.length === 1 ? '' : 's'} · {formatBytes(totalBytes)}</span>
                <button type="button" className="btn-mini" onClick={() => fileInputRef.current?.click()}><Plus size={13} /> ADD MORE</button>
                <button type="button" className="btn-mini" onClick={handleClearAllClick}><Trash2 size={13} /> CLEAR ALL</button>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png" multiple hidden onChange={e => { handleFilesChosen(e.target.files); e.target.value = '' }} />
              </div>
            </div>

            <p className="whisper-line" style={{ marginBottom: '16px' }}>Drag to reorder — each image becomes one page, in this order.</p>

            <div className="ejpg-images-grid" ref={gridRef}>
              {images.map((entry, i) => (
                <ImageCard
                  key={entry.uid}
                  entry={entry}
                  position={i + 1}
                  layout={computeLayout(entry, pageSize, orientation, margin)}
                  onRotate={handleRotate}
                  onRemove={handleRemove}
                />
              ))}
            </div>

            <div className="field" style={{ marginBottom: '16px' }}>
              <label>Page Size</label>
              <div className="ejpg-segmented-4">
                {PAGE_SIZES.map(opt => (
                  <button key={opt.value} type="button" className={`btn-mini ${pageSize === opt.value ? 'pressed' : ''}`} aria-pressed={pageSize === opt.value} onClick={() => setPageSize(opt.value)} style={{ justifyContent: 'center' }}>
                    {pageSize === opt.value && <Check size={12} />} {opt.label}
                  </button>
                ))}
              </div>
              <p className="whisper-line">"Fit to image" gives every page its own source image's size — no scaling, no cropping.</p>
            </div>

            <div className="field" style={{ marginBottom: '16px', opacity: orientationEnabled ? 1 : 0.5 }}>
              <label>Orientation</label>
              <div className="ejpg-segmented-3">
                {ORIENTATIONS.map(opt => (
                  <button key={opt.value} type="button" className={`btn-mini ${orientation === opt.value ? 'pressed' : ''}`} aria-pressed={orientation === opt.value} disabled={!orientationEnabled} onClick={() => setOrientation(opt.value)} style={{ justifyContent: 'center' }}>
                    {orientation === opt.value && <Check size={12} />} {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field" style={{ marginBottom: '20px' }}>
              <label>Margin</label>
              <div className="ejpg-segmented-3">
                {MARGINS.map(opt => (
                  <button key={opt.value} type="button" className={`btn-mini ${margin === opt.value ? 'pressed' : ''}`} aria-pressed={margin === opt.value} onClick={() => setMargin(opt.value)} style={{ justifyContent: 'center' }}>
                    {margin === opt.value && <Check size={12} />} {opt.label}
                  </button>
                ))}
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
                <button type="button" className="btn-primary" onClick={handleConvert} disabled={converting || images.length === 0}>
                  {converting ? 'CONVERTING...' : 'Convert to PDF'}
                </button>
              </div>

              {result && (
                <div style={{ marginTop: '16px', maxWidth: '420px' }}>
                  <button type="button" className="btn-primary" onClick={handleDownload}><Download size={16} /> Download PDF</button>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      <Modal open={confirmClearAll} onClose={() => setConfirmClearAll(false)} title="Clear everything?">
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', marginBottom: '20px' }}>
          This removes every image you've added and starts over. This can't be undone.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-mini" onClick={() => setConfirmClearAll(false)}>CANCEL</button>
          <button type="button" className="btn-primary inline" onClick={confirmClearAllYes}>CLEAR ALL</button>
        </div>
      </Modal>
    </>
  )
}

export default JpgToPdf