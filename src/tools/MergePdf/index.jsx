import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Sortable from 'sortablejs'
import { Files, Plus, Trash2, Download, Loader2, CheckCircle2, AlertCircle, ArrowDownToLine, ShieldCheck } from 'lucide-react'
import CircularText from '../../components/CircularText'
import Modal from '../../components/Modal'
import '../../utils/pdfWorker'
import { getDocument } from 'pdfjs-dist'
import { API_BASE } from '../../config/api'
import {
  MAX_TOTAL_BYTES, formatBytes, validateNewFiles, mapWithConcurrency,
  renderFileThumbnail, renderPageThumbnail,
} from '../../utils/mergePdfHelpers'
import FileCard from './FileCard'
import PdfPageCard from '../../components/PdfPageCard'

function MergePdf() {
  const [files, setFiles] = useState([])   // [{fileUid, file, pdfDoc, pageCount, thumbSrc}]
  const [pages, setPages] = useState([])   // [{uid, fileUid, pageNum, rotation, deleted, thumbSrc}]
  const [mode, setMode] = useState('quick') // 'quick' | 'organize'
  const [pagesGridBuilt, setPagesGridBuilt] = useState(false)
  const [status, setStatus] = useState({ msg: 'Add PDFs to begin.', type: 'idle' })
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [merging, setMerging] = useState(false)
  const [result, setResult] = useState(null) // { url, filename }
  const [confirmAction, setConfirmAction] = useState(null) // { type: 'clearAll' } | { type: 'deletePage', uid }

  const nextFileUidRef = useRef(1)
  const nextPageUidRef = useRef(1)
  const dragCounterRef = useRef(0)
  const fileInputRef = useRef(null)
  const fileListRef = useRef(null)
  const pageGridRef = useRef(null)
  const fileSortableRef = useRef(null)
  const pageSortableRef = useRef(null)

  const totalBytes = files.reduce((s, f) => s + (f.file.size || 0), 0)
  const activePageCount = pages.filter(p => !p.deleted).length
  const visiblePages = pages.filter(p => !p.deleted)

  // --- Sortable: Quick Merge file list ---
  useEffect(() => {
    if (mode !== 'quick') return
    const container = fileListRef.current
    if (!container) return

    fileSortableRef.current = Sortable.create(container, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onEnd: () => {
        const domUids = [...container.querySelectorAll('.mpdf-file-card')].map(c => Number(c.dataset.uid))
        setFiles(prev => domUids.map(uid => prev.find(f => f.fileUid === uid)).filter(Boolean))
      },
    })
    return () => { fileSortableRef.current?.destroy(); fileSortableRef.current = null }
  }, [mode])

  // --- Sortable: Merge & Organize page grid ---
  useEffect(() => {
    if (mode !== 'organize') return
    const container = pageGridRef.current
    if (!container) return

    pageSortableRef.current = Sortable.create(container, {
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
    return () => { pageSortableRef.current?.destroy(); pageSortableRef.current = null }
  }, [mode])

  async function handleFilesChosen(fileList) {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return

    const check = validateNewFiles(incoming, totalBytes)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }

    setStatus({ msg: `Reading ${incoming.length} PDF${incoming.length === 1 ? '' : 's'}...`, type: 'loading' })
    setProgress(15)

    const newEntries = []
    try {
      for (const file of incoming) {
        const buf = await file.arrayBuffer()
        const pdfDoc = await getDocument({ data: buf }).promise
        const thumbSrc = await renderFileThumbnail(pdfDoc)
        newEntries.push({ fileUid: nextFileUidRef.current++, file, pdfDoc, pageCount: pdfDoc.numPages, thumbSrc })
      }
    } catch (err) {
      console.error('PDF load error:', err)
      setStatus({ msg: `One of those files couldn't be read as a PDF: ${err.message}`, type: 'error' })
      setProgress(0)
      return
    }

    setFiles(prev => [...prev, ...newEntries])

    if (pagesGridBuilt) {
      await appendPagesForFiles(newEntries)
    }

    const newTotal = files.length + newEntries.length
    setStatus({
      msg: newTotal < 2 ? 'Add at least one more PDF to merge.' : 'Ready. Reorder as needed, then merge.',
      type: 'idle',
    })
    setProgress(0)
  }

  async function buildPagesGrid() {
    const newPages = []
    files.forEach(entry => {
      for (let i = 1; i <= entry.pageCount; i++) {
        newPages.push({ uid: nextPageUidRef.current++, fileUid: entry.fileUid, pageNum: i, rotation: 0, deleted: false, thumbSrc: null })
      }
    })
    setPages(newPages)
    setPagesGridBuilt(true)

    await mapWithConcurrency(newPages, 4, async (p) => {
      const entry = files.find(f => f.fileUid === p.fileUid)
      if (!entry) return
      try {
        const thumb = await renderPageThumbnail(entry.pdfDoc, p.pageNum, p.rotation)
        setPages(prev => prev.map(pp => pp.uid === p.uid ? { ...pp, thumbSrc: thumb } : pp))
      } catch (err) {
        console.error('Page thumbnail error:', err)
      }
    })
  }

  // Appends pages for newly-added files to the end of the existing
  // custom order, instead of rebuilding the grid — that would throw
  // away any reordering/rotation already done in Organize mode.
  async function appendPagesForFiles(newEntries) {
    const newPages = []
    newEntries.forEach(entry => {
      for (let i = 1; i <= entry.pageCount; i++) {
        newPages.push({ uid: nextPageUidRef.current++, fileUid: entry.fileUid, pageNum: i, rotation: 0, deleted: false, thumbSrc: null })
      }
    })
    setPages(prev => [...prev, ...newPages])

    await mapWithConcurrency(newPages, 4, async (p) => {
      const entry = newEntries.find(f => f.fileUid === p.fileUid)
      if (!entry) return
      try {
        const thumb = await renderPageThumbnail(entry.pdfDoc, p.pageNum, p.rotation)
        setPages(prev => prev.map(pp => pp.uid === p.uid ? { ...pp, thumbSrc: thumb } : pp))
      } catch (err) {
        console.error('Page thumbnail error:', err)
      }
    })
  }

  function handleModeSwitch(value) {
    if (value === mode) return
    setMode(value)
    if (value === 'organize' && !pagesGridBuilt) {
      buildPagesGrid()
    }
  }

  function handleRemoveFile(fileUid) {
    const newFiles = files.filter(f => f.fileUid !== fileUid)
    setFiles(newFiles)
    if (pagesGridBuilt) {
      setPages(prev => prev.filter(p => p.fileUid !== fileUid))
    }

    if (newFiles.length === 0) {
      resetAll()
      return
    }
    setStatus({ msg: newFiles.length < 2 ? 'Add at least one more PDF to merge.' : `${newFiles.length} files ready.`, type: 'idle' })
  }

  async function handleRotatePage(uid) {
    const pageData = pages.find(p => p.uid === uid)
    if (!pageData || pageData.deleted) return
    const newRotation = (pageData.rotation + 90) % 360

    setPages(prev => prev.map(p => p.uid === uid ? { ...p, rotation: newRotation, thumbSrc: null } : p))

    const entry = files.find(f => f.fileUid === pageData.fileUid)
    if (!entry) return
    try {
      const thumb = await renderPageThumbnail(entry.pdfDoc, pageData.pageNum, newRotation)
      setPages(prev => prev.map(p => p.uid === uid ? { ...p, thumbSrc: thumb } : p))
    } catch (err) {
      console.error('Rotate thumbnail error:', err)
    }
  }

  function handleDeletePage(uid) {
    setConfirmAction({ type: 'deletePage', uid })
  }

  function performDeletePage(uid) {
    setPages(prev => {
      const next = prev.map(p => p.uid === uid ? { ...p, deleted: true } : p)
      const remaining = next.filter(p => !p.deleted).length
      setStatus({ msg: `Page removed. ${remaining} page${remaining === 1 ? '' : 's'} remaining.`, type: 'idle' })
      return next
    })
  }

  function resetAll() {
    setFiles([])
    setPages([])
    setPagesGridBuilt(false)
    setMode('quick')
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setStatus({ msg: 'Add PDFs to begin.', type: 'idle' })
    setProgress(0)
  }

  function handleClearAll() {
    if (!files.length) { resetAll(); return }
    setConfirmAction({ type: 'clearAll' })
  }

  function handleConfirmYes() {
    if (!confirmAction) return
    if (confirmAction.type === 'deletePage') performDeletePage(confirmAction.uid)
    if (confirmAction.type === 'clearAll') resetAll()
    setConfirmAction(null)
  }

  async function handleMerge() {
    if (files.length < 2) { setStatus({ msg: 'Add at least 2 PDFs to merge.', type: 'error' }); return }
    if (mode === 'organize' && activePageCount === 0) { setStatus({ msg: 'No pages left to merge — every page was deleted.', type: 'error' }); return }

    setMerging(true)
    setResult(null)
    setStatus({ msg: 'Preparing PDFs...', type: 'loading' })
    setProgress(15)

    try {
      const formData = new FormData()
      files.forEach(entry => formData.append('files', entry.file))

      if (mode === 'organize') {
        const operations = pages.map(p => ({
          fileIndex: files.findIndex(f => f.fileUid === p.fileUid),
          pageNum: p.pageNum,
          rotation: p.rotation,
          deleted: p.deleted,
        }))
        formData.append('operations', JSON.stringify(operations))
      }

      setStatus({ msg: 'Uploading to server...', type: 'loading' })
      setProgress(35)

      const response = await fetch(`${API_BASE}/api/merge-pdf`, { method: 'POST', body: formData })

      setStatus({ msg: 'Merging PDFs...', type: 'loading' })
      setProgress(65)

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Server error: ${response.status}`)
      }

      setStatus({ msg: 'Preparing download...', type: 'loading' })
      setProgress(85)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const filename = 'merged.pdf'

      setProgress(100)
      setStatus({ msg: 'Merge complete!', type: 'success' })
      setResult({ url, filename })

      const tempLink = document.createElement('a')
      tempLink.href = url
      tempLink.download = filename
      tempLink.click()
    } catch (err) {
      console.error('Merge failed:', err)
      setStatus({ msg: `Error: ${err.message}`, type: 'error' })
      setProgress(0)
    } finally {
      setMerging(false)
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
            <div className="tool-crumb"><span className="cat">PDF</span><span className="num">CATALOG NO. 102</span></div>
            <h1>Merge PDF</h1>
            <p>Combine multiple PDFs in order, or drag individual pages across files for full control.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">SERVER-SIDE</span>
              <span className="tool-chip">UP TO 50MB TOTAL</span>
            </div>
          </div>
          <CircularText text="MERGE.SYS • PDF ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px', width: '100%' }}>

        {files.length === 0 ? (
          <div className="upload-stage" style={{ maxWidth: '620px', margin: '0 auto' }}>
                        <div
              className={`dropzone ${dragging ? 'drag' : ''}`}
              onClick={() => { if (status.type !== 'loading') fileInputRef.current?.click() }}
              onDragEnter={e => { e.preventDefault(); if (status.type === 'loading') return; dragCounterRef.current += 1; setDragging(true) }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={e => { e.preventDefault(); dragCounterRef.current -= 1; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragging(false) } }}
              onDrop={e => { e.preventDefault(); dragCounterRef.current = 0; setDragging(false); if (status.type === 'loading') return; if (e.dataTransfer.files.length) handleFilesChosen(e.dataTransfer.files) }}
              style={{ textAlign: 'center' }}
            >
              {status.type === 'loading' ? (
                <div className="dropzone-loading">
                  <Loader2 size={32} className="rotating-icon" />
                  <div className="dropzone-loading-text">{status.msg}</div>
                </div>
              ) : (
              <div className="dropzone-content">
                <div className="upload-icon-wrap"><Files size={28} /></div>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', marginBottom: '6px' }}>Drag & drop multiple PDFs</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)' }}>
                  or <span style={{ color: 'var(--cobalt)', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 700 }}>click to browse</span>
                </div>
                <div className="format-pills">
                  <span className="format-pill">PDF</span>
                  <span className="format-pill size">≤ {formatBytes(MAX_TOTAL_BYTES)} total</span>
                  <span className="format-pill">2+ FILES</span>
                </div>
              </div>
              )}
              <AnimatePresence>
                {dragging && (
                  <motion.div className="drop-overlay" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
                    <div className="drop-overlay-icon"><ArrowDownToLine size={26} /></div>
                    <div className="drop-overlay-text">Drop to add</div>
                  </motion.div>
                )}
              </AnimatePresence>
              <input ref={fileInputRef} type="file" accept="application/pdf" multiple hidden
                onChange={e => { handleFilesChosen(e.target.files); e.target.value = '' }} />
            </div>
            <div className="privacy-badge">
              <ShieldCheck size={22} />
              <span>Files are automatically deleted from the server within 15 minutes.</span>
            </div>
          </div>
        ) : (
          <div className="panel-card">
            <div className="panel-head">
              <h2>Merge</h2>
              <div style={{ display: 'flex', gap: '8px', maxWidth: '480px', flexWrap: 'wrap' }}>
                <span className="tool-chip">{files.length} file{files.length === 1 ? '' : 's'}</span>
                <button type="button" className="btn-mini" onClick={() => fileInputRef.current?.click()}><Plus size={13} /> ADD MORE</button>
                <button type="button" className="btn-mini" onClick={handleClearAll}><Trash2 size={13} /> CLEAR ALL</button>
                <input ref={fileInputRef} type="file" accept="application/pdf" multiple hidden
                  onChange={e => { handleFilesChosen(e.target.files); e.target.value = '' }} />
              </div>
            </div>

            <div className="field" style={{ marginBottom: '20px' }}>
              <label>Mode</label>
              <div style={{ display: 'flex', gap: '8px', maxWidth: '480px' }}>
                <button type="button" className={`btn-mini ${mode === 'quick' ? 'accent' : ''}`} aria-pressed={mode === 'quick'} onClick={() => handleModeSwitch('quick')} style={{ flex: 1, justifyContent: 'center' }}>
                  QUICK MERGE
                </button>
                <button type="button" className={`btn-mini ${mode === 'organize' ? 'accent' : ''}`} aria-pressed={mode === 'organize'} onClick={() => handleModeSwitch('organize')} style={{ flex: 1, justifyContent: 'center' }}>
                  MERGE & ORGANIZE
                </button>
              </div>
              <p className="whisper-line">
                {mode === 'quick'
                  ? 'Drag whole files into the order you want them combined.'
                  : 'Every page from every file, in one deck — drag any page anywhere, even across files.'}
              </p>
            </div>

            {mode === 'quick' ? (
              <div className="mpdf-file-list" ref={fileListRef}>
                {files.map((entry, i) => (
                  <FileCard key={entry.fileUid} entry={entry} order={i + 1} onRemove={handleRemoveFile} />
                ))}
              </div>
            ) : (
              <div className="pdf-pages-grid" ref={pageGridRef}>
                {visiblePages.map((pageData, i) => (
                  <PdfPageCard
                  key={pageData.uid}
                  pageData={pageData}
                  position={i + 1}
                  sourceFileName={files.find(f => f.fileUid === pageData.fileUid)?.file.name || 'unknown file'}
                  onRotate={handleRotatePage}
                  onDelete={handleDeletePage}
                  />
                ))}
              </div>
            )}

            <div style={{ borderTop: '2px solid var(--fg)', marginTop: '20px', paddingTop: '20px' }}>
              <div className={`status-line ${status.type}`} style={{ marginBottom: '10px' }}>
                {status.type === 'loading' && <Loader2 size={14} className="rotating-icon" />}
                {status.type === 'success' && <CheckCircle2 size={14} />}
                {status.type === 'error' && <AlertCircle size={14} />}
                <span>{status.msg}</span>
              </div>
              <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', maxWidth: '420px' }}>
                <button type="button" className="btn-primary" onClick={handleMerge} disabled={merging || files.length < 2}>
                  {merging ? 'MERGING...' : 'Merge PDFs'}
                </button>
              </div>

              {result && (
                <div style={{ marginTop: '16px', maxWidth: '420px' }}>
                  <button type="button" className="btn-primary" onClick={handleDownload}><Download size={16} /> Download Merged PDF</button>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      <Modal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.type === 'clearAll' ? 'Clear everything?' : 'Remove this page?'}
      >
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', marginBottom: '20px' }}>
          {confirmAction?.type === 'clearAll'
            ? 'This removes every file you\'ve added and starts over. This can\'t be undone.'
            : 'This page will be excluded from the merged PDF. This can\'t be undone.'}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-mini" onClick={() => setConfirmAction(null)}>CANCEL</button>
          <button type="button" className="btn-primary inline" onClick={handleConfirmYes}>
            {confirmAction?.type === 'clearAll' ? 'CLEAR ALL' : 'REMOVE PAGE'}
          </button>
        </div>
      </Modal>
    </>
  )
}

export default MergePdf