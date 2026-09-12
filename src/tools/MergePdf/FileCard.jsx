import { X } from 'lucide-react'
import { formatBytes } from '../../utils/mergePdfHelpers'

// Purely presentational. Thumbnail rendering, drag-reorder (Sortable),
// and uid bookkeeping all live in the parent (MergePdf/index.jsx) —
// this component just displays one file's state and calls back up.
function FileCard({ entry, order, onRemove }) {
  return (
    <div className="mpdf-file-card" data-uid={entry.fileUid}>
      <span className="mpdf-file-order">{order}</span>
      <div className="mpdf-file-thumb">
        {entry.thumbSrc && <img src={entry.thumbSrc} alt={`${entry.file.name} first page thumbnail`} />}
      </div>
      <div className="mpdf-file-info">
        <div className="mpdf-file-name" title={entry.file.name}>{entry.file.name}</div>
        <div className="mpdf-file-meta">
          <span>{formatBytes(entry.file.size || 0)}</span>
          <span className="dot">•</span>
          <span>{entry.pageCount} page{entry.pageCount === 1 ? '' : 's'}</span>
        </div>
      </div>
      <button type="button" className="btn-mini" aria-label={`Remove ${entry.file.name}`} onClick={() => onRemove(entry.fileUid)}>
        <X size={13} />
      </button>
    </div>
  )
}

export default FileCard