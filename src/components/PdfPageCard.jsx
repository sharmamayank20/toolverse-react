import { RotateCw, Trash2, Loader2 } from 'lucide-react'

// Shared by any tool showing a draggable/rotatable/deletable page grid
// (Merge PDF's Organize mode, Organize PDF, and future tools like
// Watermark PDF). Purely presentational — thumbnail rendering,
// drag-reorder (Sortable), and uid bookkeeping all live in the parent.
// sourceFileName is optional: pass it for multi-file contexts (Merge),
// omit it for single-file contexts (Organize) and the source badge
// just won't render.
function PdfPageCard({ pageData, position, sourceFileName, onRotate, onDelete }) {
  return (
    <div className="pdf-page-card" data-uid={pageData.uid} data-rotation={pageData.rotation}>
      <div className={`pdf-page-thumb ${pageData.thumbSrc ? '' : 'loading'}`}>
        <span className="pdf-page-badge num">p.{pageData.pageNum}</span>
        {pageData.rotation !== 0 && <span className="pdf-page-badge rotation">{pageData.rotation}°</span>}
        {sourceFileName && <span className="pdf-page-badge source" title={sourceFileName}>{sourceFileName}</span>}
        <span className="pdf-page-badge position">#{position}</span>

        {pageData.thumbSrc
          ? <img src={pageData.thumbSrc} alt={`Page ${pageData.pageNum}${sourceFileName ? ` of ${sourceFileName}` : ''}`} />
          : <Loader2 size={20} className="rotating-icon" />}
      </div>

      <div className="pdf-page-actions">
        <button type="button" className="btn-mini" aria-label="Rotate page" onClick={() => onRotate(pageData.uid)}>
          <RotateCw size={13} /> <span className="mpdf-btn-label">ROTATE</span>
        </button>
        <button type="button" className="btn-mini" aria-label="Delete page" onClick={() => onDelete(pageData.uid)}>
          <Trash2 size={13} /> <span className="mpdf-btn-label">DELETE</span>
        </button>
      </div>
    </div>
  )
}

export default PdfPageCard