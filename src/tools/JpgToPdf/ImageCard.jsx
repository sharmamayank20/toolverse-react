import { RotateCw, Trash2 } from 'lucide-react'

function rotationClass(rotation) {
  return rotation === 90 ? 'ejpg-rot-90' : rotation === 180 ? 'ejpg-rot-180' : rotation === 270 ? 'ejpg-rot-270' : ''
}

// Purely presentational — layout is computed in the parent (needs the
// global pageSize/orientation/margin settings, not just this one
// entry) and passed down, matching the split used by MergePdf's
// FileCard/PageCard.
function ImageCard({ entry, position, layout, onRotate, onRemove }) {
  return (
    <div className="ejpg-image-card" data-uid={entry.uid}>
      <div className="ejpg-thumb">
        <span className="ejpg-page-num">{position}</span>
        <div className="ejpg-page-mock" style={layout ? { aspectRatio: `${layout.pageW} / ${layout.pageH}` } : undefined}>
          <div
            className="ejpg-img-slot"
            style={layout ? { left: `${layout.leftPct}%`, top: `${layout.topPct}%`, width: `${layout.widthPct}%`, height: `${layout.heightPct}%` } : undefined}
          >
            <img src={entry.objectUrl} alt={entry.file.name} className={rotationClass(entry.rotation)} draggable={false} />
          </div>
        </div>
      </div>

      <div className="ejpg-caption" title={entry.file.name}>{entry.file.name}</div>

      <div className="pdf-page-actions">
        <button type="button" className="btn-mini" aria-label="Rotate image" onClick={() => onRotate(entry.uid)}>
          <RotateCw size={13} /> <span className="mpdf-btn-label">ROTATE</span>
        </button>
        <button type="button" className="btn-mini" aria-label="Remove image" onClick={() => onRemove(entry.uid)}>
          <Trash2 size={13} /> <span className="mpdf-btn-label">REMOVE</span>
        </button>
      </div>
    </div>
  )
}

export default ImageCard