import { useState, useRef, useEffect } from 'react'
import Sortable from 'sortablejs'
import { LayoutGrid, RotateCw, Download, Loader2, CheckCircle2, AlertCircle, ArrowDownToLine, ShieldCheck } from 'lucide-react'
import CircularText from '../components/CircularText'
import Modal from '../components/Modal'
import PdfPageCard from '../components/PdfPageCard'
import '../utils/pdfWorker'
import { getDocument } from 'pdfjs-dist'
import { API_BASE } from '../config/api'
import { mapWithConcurrency, renderPageThumbnail } from '../utils/mergePdfHelpers'
import { MAX_FILE_BYTES, validateOrganizePdfFile, hasAnyChanges, activePageCount } from '../utils/organizePdfHelpers'

function OrganizePdf() {
  const [file, setFile] = useState(null)
  const [pages, setPages] = useState([]) // [{uid, pageNum, rotation, deleted, thumbSrc}]
  const [status, setStatus] = useState({ msg: 'Add a PDF to begin.', type: 'idle' })
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [rotatingAll, setRotatingAll] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null) // { type: 'delete', uid } | { type: 'changePdf' }

  const pdfDocRef = useRef(null)
  const nextUidRef = useRef(1)
  const pagesGridRef = useRef(null)
  const sortableRef = useRef(null)
  const dragCounterRef = useRef(0)
  const fileInputRef = useRef(null)

  const visiblePages = pages.filter(p => !p.deleted)

  useEffect(() => {
    if (!file) return
    const container = pagesGridRef.current
    if (!container) return

    sortableRef.current = Sortable.create(container, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onEnd: () => {
        const domUids = [...container.querySelectorAll('.pdf-page-card')].map(c => Number(c.dataset.uid))
        setPages(prev => {
          const visible = domUids.map(uid => prev.find(p => p.uid === uid)).filter(Boolean)
          const deleted = prev.filter(p => p.deleted)
          return [...visible, ...deleted]
        })
      },
    })
    return () => { sortableRef.current?.destroy(); sortableRef.current = null }
  }, [file])

  async function handleFile(f) {
    const check = validateOrganizePdfFile(f)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }

    setStatus({ msg: 'Loading PDF...', type: 'loading' })
    setProgress(20)

    try {
      const buf = await f.arrayBuffer()
      const pdfDoc = await getDocument({ data: buf }).promise
      pdfDocRef.current = pdfDoc

      const newPages = []
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        newPages.push({ uid: nextUidRef.current++, pageNum: i, rotation: 0, deleted: false, thumbSrc: null })
      }

      setFile(f)
      setPages(newPages)

      setStatus({ msg: 'Rendering thumbnails...', type: 'loading' })
      setProgress(40)

      await mapWithConcurrency(newPages, 4, async (p) => {
        try {
          const thumb = await renderPageThumbnail(pdfDoc, p.pageNum, p.rotation)
          setPages(prev => prev.map(pp => pp.uid === p.uid ? { ...pp, thumbSrc: thumb } : pp))
        } catch (err) {
          console.error('Thumbnail render error:', err)
        }
      })

      setStatus({ msg: 'PDF loaded. Drag to reorder, rotate, or delete pages.', type: 'idle' })
      setProgress(0)
    } catch (err) {
      console.error('PDF load error:', err)
      setStatus({ msg: `Error loading PDF: ${err.message}`, type: 'error' })
      setProgress(0)
    }
  }

  async function handleRotate(uid) {
    const pageData = pages.find(p => p.uid === uid)
    if (!pageData || pageData.deleted) return
    const newRotation = (pageData.rotation + 90) % 360

    setPages(prev => prev.map(p => p.uid === uid ? { ...p, rotation: newRotation, thumbSrc: null } : p))
    setStatus({ msg: `Rotating page ${pageData.pageNum}...`, type: 'loading' })

    try {
      const thumb = await renderPageThumbnail(pdfDocRef.current, pageData.pageNum, newRotation)
      setPages(prev => prev.map(p => p.uid === uid ? { ...p, thumbSrc: thumb } : p))
      setStatus({ msg: `Page ${pageData.pageNum} rotated to ${newRotation}°.`, type: 'idle' })
    } catch (err) {
      console.error('Rotate thumbnail error:', err)
    }
  }

  async function handleRotateAll() {
    if (!visiblePages.length) return
    setRotatingAll(true)
    setStatus({ msg: 'Rotating all pages...', type: 'loading' })
    setProgress(50)

    const rotated = visiblePages.map(p => ({ ...p, rotation: (p.rotation + 90) % 360, thumbSrc: null }))
    setPages(prev => prev.map(p => {
      const match = rotated.find(r => r.uid === p.uid)
      return match || p
    }))

    await mapWithConcurrency(rotated, 4, async (p) => {
      try {
        const thumb = await renderPageThumbnail(pdfDocRef.current, p.pageNum, p.rotation)
        setPages(prev => prev.map(pp => pp.uid === p.uid ? { ...pp, thumbSrc: thumb } : pp))
      } catch (err) {
        console.error('Rotate-all thumbnail error:', err)
      }
    })

    setProgress(100)
    setStatus({ msg: 'All pages rotated.', type: 'success' })
    setRotatingAll(false)
  }

  function handleDeleteClick(uid) {
    setConfirmAction({ type: 'delete', uid })
  }

  function performDelete(uid) {
    setPages(prev => {
      const next = prev.map(p => p.uid === uid ? { ...p, deleted: true } : p)
      const remaining = activePageCount(next)
      setStatus({ msg: `Page deleted. ${remaining} page${remaining === 1 ? '' : 's'} remaining.`, type: 'idle' })
      return next
    })
  }

  function resetAll() {
    pdfDocRef.current = null
    setFile(null)
    setPages([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    setStatus({ msg: 'Add a PDF to begin.', type: 'idle' })
    setProgress(0)
  }

  function handleChangePdfClick() {
    if (hasAnyChanges(pages)) { setConfirmAction({ type: 'changePdf' }); return }
    resetAll()
  }

  function handleConfirmYes() {
    if (!confirmAction) return
    if (confirmAction.type === 'delete') performDelete(confirmAction.uid)
    if (confirmAction.type === 'changePdf') resetAll()
    setConfirmAction(null)
  }

  async function handleDownload() {
    if (!file) { setStatus({ msg: 'No PDF loaded.', type: 'error' }); return }
    const remaining = activePageCount(pages)
    if (remaining === 0) { setStatus({ msg: 'No pages to download. All pages were deleted.', type: 'error' }); return }

    setDownloading(true)
    setStatus({ msg: 'Preparing organized PDF...', type: 'loading' })
    setProgress(50)

    try {
      const formData = new FormData()
      formData.append('pdf', file)

      const operations = pages.map((p, idx) => ({
        originalPage: p.pageNum,
        newPosition: idx + 1,
        rotation: p.rotation,
        deleted: p.deleted,
      }))
      formData.append('operations', JSON.stringify(operations))

      setStatus({ msg: 'Uploading to server...', type: 'loading' })
      setProgress(70)

      const response = await fetch(`${API_BASE}/api/organize-pdf`, { method: 'POST', body: formData })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Server error: ${response.status}`)
      }

      setStatus({ msg: 'Preparing download...', type: 'loading' })
      setProgress(90)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const filename = (file.name || 'document.pdf').replace(/\.pdf$/i, '') + '-organized.pdf'

      const tempLink = document.createElement('a')
      tempLink.href = url
      tempLink.download = filename
      tempLink.click()

      setProgress(100)
      setStatus({ msg: 'Organized PDF downloaded!', type: 'success' })
    } catch (err) {
      console.error('Download failed:', err)
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
            <div className="tool-crumb"><span className="cat">PDF</span><span className="num">CATALOG NO. 107</span></div>
            <h1>Organize PDF</h1>
            <p>Reorder, rotate, and delete pages with an intuitive drag-and-drop interface.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">SERVER-SIDE</span>
              <span className="tool-chip">UP TO 20MB</span>
            </div>
          </div>
          <CircularText text="ORGANIZE.SYS • PDF ENGINE • " spinDuration={18} onHover="speedUp" />
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
                  <div className="upload-icon-wrap"><LayoutGrid size={28} /></div>
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
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className="tool-chip">{activePageCount(pages)} page{activePageCount(pages) === 1 ? '' : 's'}</span>
                <button type="button" className="btn-mini" onClick={handleRotateAll} disabled={rotatingAll}><RotateCw size={13} /> ROTATE ALL</button>
                <button type="button" className="btn-mini" onClick={handleChangePdfClick}>CHANGE PDF</button>
              </div>
            </div>

            <p className="whisper-line" style={{ marginBottom: '16px' }}>Drag a page to reorder, rotate to turn it, delete to remove it.</p>

            <div className="pdf-pages-grid" ref={pagesGridRef}>
              {visiblePages.map((pageData, i) => (
                <PdfPageCard
                  key={pageData.uid}
                  pageData={pageData}
                  position={i + 1}
                  onRotate={handleRotate}
                  onDelete={handleDeleteClick}
                />
              ))}
            </div>

            <div style={{ borderTop: '2px solid var(--fg)', marginTop: '20px', paddingTop: '20px' }}>
              <div className={`status-line ${status.type}`} style={{ marginBottom: '10px' }}>
                {status.type === 'loading' && <Loader2 size={14} className="rotating-icon" />}
                {status.type === 'success' && <CheckCircle2 size={14} />}
                {status.type === 'error' && <AlertCircle size={14} />}
                <span>{status.msg}</span>
              </div>
              <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div>

              <button type="button" className="btn-primary" style={{ marginTop: '16px', maxWidth: '420px' }} onClick={handleDownload} disabled={downloading}>
                <Download size={16} /> {downloading ? 'DOWNLOADING...' : 'Download Organized PDF'}
              </button>
            </div>
          </div>
        )}

      </main>

      <Modal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.type === 'changePdf' ? 'Discard changes?' : 'Delete this page?'}
      >
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', marginBottom: '20px' }}>
          {confirmAction?.type === 'changePdf'
            ? 'Changing the PDF will clear your reordering, rotations, and deletions. This can\'t be undone.'
            : 'This page will be removed from the organized PDF. This can\'t be undone.'}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-mini" onClick={() => setConfirmAction(null)}>CANCEL</button>
          <button type="button" className="btn-primary inline" onClick={handleConfirmYes}>
            {confirmAction?.type === 'changePdf' ? 'CHANGE PDF' : 'DELETE PAGE'}
          </button>
        </div>
      </Modal>
    </>
  )
}

export default OrganizePdf