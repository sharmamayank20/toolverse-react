import { useRef, useEffect, useState } from 'react'
import Sortable from 'sortablejs'
import {
  Plus, RotateCw, Crop, Camera, Trash2, Download, Loader2,
  CheckCircle2, AlertCircle, RotateCcw,
} from 'lucide-react'
import Modal from '../../components/Modal'
import { QUALITY_PRESETS, filterLabel } from '../../utils/scanToPdfHelpers'

const FILTERS = ['original', 'color', 'gray', 'bw', 'enhance']

function PagesWorkbench({
  pages, selectedPageId, onSelectPage, onReorder, onAddPage,
  onRotate, onApplyFilter, onApplyFilterToAll, onRecrop, onRetakePage, onDeletePage,
  quality, onQualityChange,
  status, progress, generating, onGenerate, result, onDownload,
  onDiscardAll,
}) {
  const gridRef = useRef(null)
  const sortableRef = useRef(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false)

  const selectedPage = pages.find(p => p.id === selectedPageId) || null

  useEffect(() => {
    const container = gridRef.current
    if (!container) return
    sortableRef.current = Sortable.create(container, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onEnd: () => {
        const domIds = [...container.querySelectorAll('.escan-page-thumb')].map(el => Number(el.dataset.uid))
        onReorder(domIds)
      },
    })
    return () => { sortableRef.current?.destroy(); sortableRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length])

  function handleConfirmDelete() {
    if (confirmDeleteId != null) onDeletePage(confirmDeleteId)
    setConfirmDeleteId(null)
  }

  return (
    <>
      <div className="escan-workbench-grid">
        <div className="panel-card">
          <div className="panel-head">
            <h2>Pages</h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="tool-chip">{pages.length} page{pages.length === 1 ? '' : 's'}</span>
              <button type="button" className="btn-mini" onClick={onAddPage}><Plus size={13} /> ADD PAGE</button>
              <button type="button" className="btn-mini" onClick={() => setConfirmDiscardAll(true)} disabled={pages.length === 0}><RotateCcw size={13} /> DISCARD ALL</button>
            </div>
          </div>

          {pages.length === 0 ? (
            <p className="whisper-line">No pages yet — add one to get started.</p>
          ) : (
            <div className="escan-pages-grid" ref={gridRef}>
              {pages.map((page, idx) => (
                <div
                  key={page.id}
                  className={`escan-page-thumb ${page.id === selectedPageId ? 'selected' : ''}`}
                  data-uid={page.id}
                  onClick={() => onSelectPage(page.id)}
                >
                  <img src={page.thumbSrc} alt={`Page ${idx + 1}`} draggable={false} />
                  <span className="escan-page-num">{idx + 1}</span>
                </div>
              ))}
            </div>
          )}
          <p className="whisper-line" style={{ marginTop: '12px' }}>Drag a page to reorder. Click a page to change its filter, rotate, re-crop, or delete it.</p>
        </div>

        <div className="panel-card">
          <div className="panel-head"><h3>Selected Page</h3></div>

          {!selectedPage ? (
            <p className="whisper-line">Select a page to edit it.</p>
          ) : (
            <>
              <div className="escan-editor-preview">
                <img src={selectedPage.thumbSrc} alt="Selected page preview" />
              </div>

              <div className="field" style={{ marginBottom: '14px' }}>
                <label>Filter</label>
                <div className="escan-filter-grid">
                  {FILTERS.map(f => (
                    <button
                      key={f}
                      type="button"
                      className={`btn-mini ${selectedPage.filter === f ? 'pressed' : ''}`}
                      aria-pressed={selectedPage.filter === f}
                      onClick={() => onApplyFilter(selectedPage.id, f)}
                    >
                      {filterLabel(f)}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn-mini" style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }} onClick={() => onApplyFilterToAll(selectedPage.filter)}>
                  Apply this filter to all pages
                </button>
              </div>

              <div className="escan-editor-btn-row">
                <button type="button" className="btn-mini" style={{ flex: 1, justifyContent: 'center' }} onClick={() => onRotate(selectedPage.id)}><RotateCw size={13} /> ROTATE</button>
                <button type="button" className="btn-mini" style={{ flex: 1, justifyContent: 'center' }} onClick={() => onRecrop(selectedPage.id)}><Crop size={13} /> RE-CROP</button>
              </div>
              <div className="escan-editor-btn-row" style={{ marginBottom: '16px' }}>
                <button type="button" className="btn-mini" style={{ flex: 1, justifyContent: 'center' }} onClick={() => onRetakePage(selectedPage.id)}><Camera size={13} /> RETAKE</button>
                <button type="button" className="btn-mini" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setConfirmDeleteId(selectedPage.id)}><Trash2 size={13} /> DELETE</button>
              </div>
            </>
          )}

          <div className="field" style={{ marginBottom: '14px', borderTop: selectedPage ? '2px solid var(--fg)' : 'none', paddingTop: selectedPage ? '16px' : 0 }}>
            <label>Export Quality</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {Object.keys(QUALITY_PRESETS).map(key => (
                <button
                  key={key}
                  type="button"
                  className={`btn-mini ${quality === key ? 'pressed' : ''}`}
                  aria-pressed={quality === key}
                  onClick={() => onQualityChange(key)}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {key === 'high' ? 'HIGH' : key === 'balanced' ? 'BALANCED' : 'SMALL'}
                </button>
              ))}
            </div>
            <p className="whisper-line">{QUALITY_PRESETS[quality].label}</p>
          </div>

          <div style={{ borderTop: '2px solid var(--fg)', paddingTop: '16px' }}>
            <div className={`status-line ${status.type}`} style={{ marginBottom: '10px' }}>
              {status.type === 'loading' && <Loader2 size={14} className="rotating-icon" />}
              {status.type === 'success' && <CheckCircle2 size={14} />}
              {status.type === 'error' && <AlertCircle size={14} />}
              <span>{status.msg}</span>
            </div>
            <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div>

            <button type="button" className="btn-primary" style={{ marginTop: '16px' }} onClick={onGenerate} disabled={generating || pages.length === 0}>
              {generating ? 'GENERATING...' : 'Generate PDF'}
            </button>

            {result && (
              <button type="button" className="btn-primary" style={{ marginTop: '10px' }} onClick={onDownload}>
                <Download size={16} /> Download scanned PDF
              </button>
            )}
          </div>
        </div>
      </div>

      <Modal open={confirmDeleteId != null} onClose={() => setConfirmDeleteId(null)} title="Delete this page?">
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', marginBottom: '20px' }}>
          This page will be removed from the document. This can't be undone.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-mini" onClick={() => setConfirmDeleteId(null)}>CANCEL</button>
          <button type="button" className="btn-primary inline" onClick={handleConfirmDelete}>DELETE PAGE</button>
        </div>
      </Modal>

      <Modal open={confirmDiscardAll} onClose={() => setConfirmDiscardAll(false)} title="Discard everything?">
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', marginBottom: '20px' }}>
          This clears every captured page and starts over from scratch. This can't be undone.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-mini" onClick={() => setConfirmDiscardAll(false)}>CANCEL</button>
          <button type="button" className="btn-primary inline" onClick={() => { setConfirmDiscardAll(false); onDiscardAll() }}>DISCARD ALL</button>
        </div>
      </Modal>
    </>
  )
}

export default PagesWorkbench
