import { useState, useRef, useEffect } from 'react'
import { Sparkles, RotateCcw, Camera, Check } from 'lucide-react'
import { detectCornersOnCanvas, defaultCorners } from '../../utils/scanToPdfHelpers'

const CORNER_KEYS = ['topLeftCorner', 'topRightCorner', 'bottomLeftCorner', 'bottomRightCorner']

function CropAdjust({ shotCanvas, initialCorners, scanner, cv, onConfirm, onRetake }) {
  const [corners, setCorners] = useState(initialCorners)
  const [displayScale, setDisplayScale] = useState(1)
  const [imgOffset, setImgOffset] = useState({ left: 0, top: 0 })
  const [redetecting, setRedetecting] = useState(false)

  const imgRef = useRef(null)
  const innerWrapRef = useRef(null)
  const dragKeyRef = useRef(null)
  const observerRef = useRef(null)

  const imgSrc = useRef(shotCanvas.toDataURL('image/jpeg', 0.9)).current

  function recomputeScale() {
    const img = imgRef.current
    if (!img || !img.clientWidth) return
    setDisplayScale(img.clientWidth / shotCanvas.width)
    // Measured directly from the DOM rather than assumed — the image
    // isn't guaranteed to sit at (0,0) inside its wrapper (e.g. once
    // it's height-constrained rather than width-constrained, its
    // rendered box can end up narrower than the block-level wrapper).
    setImgOffset({ left: img.offsetLeft, top: img.offsetTop })
  }

  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    // ResizeObserver fires whenever the rendered box actually changes —
    // more reliable than window-resize + onLoad alone, especially on
    // mobile where CSS max-height / viewport-unit constraints settle
    // asynchronously and a stale scale misaligns the corner handles.
    observerRef.current = new ResizeObserver(() => recomputeScale())
    observerRef.current.observe(img)
    recomputeScale()
    return () => observerRef.current?.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function clampToCanvas(x, y) {
    return {
      x: Math.max(0, Math.min(shotCanvas.width, x)),
      y: Math.max(0, Math.min(shotCanvas.height, y)),
    }
  }

  function handleCornerPointerDown(key, e) {
    e.preventDefault()
    dragKeyRef.current = key
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleCornerPointerMove(e) {
    const key = dragKeyRef.current
    if (!key || !imgRef.current || !innerWrapRef.current) return
    e.preventDefault()
    const wrapRect = innerWrapRef.current.getBoundingClientRect()
    const xNatural = (e.clientX - wrapRect.left - imgOffset.left) / displayScale
    const yNatural = (e.clientY - wrapRect.top - imgOffset.top) / displayScale
    setCorners(prev => ({ ...prev, [key]: clampToCanvas(xNatural, yNatural) }))
  }

  function handleCornerPointerUp() {
    dragKeyRef.current = null
  }

  async function handleRedetect() {
    if (!scanner || !cv) return
    setRedetecting(true)
    // Small delay so the button's own re-render (disabled state) paints
    // before the synchronous detection call blocks the main thread.
    await new Promise(r => setTimeout(r, 30))
    const detected = detectCornersOnCanvas(shotCanvas, scanner, cv)
    setCorners(detected || defaultCorners(shotCanvas.width, shotCanvas.height))
    setRedetecting(false)
  }

  function handleReset() {
    setCorners(defaultCorners(shotCanvas.width, shotCanvas.height))
  }

  const polygonPoints = CORNER_KEYS
    .map(key => corners[key])
    // topLeft, topRight, bottomRight, bottomLeft — correct winding for the outline
    .length === 4
    ? [corners.topLeftCorner, corners.topRightCorner, corners.bottomRightCorner, corners.bottomLeftCorner]
      .map(p => `${imgOffset.left + p.x * displayScale},${imgOffset.top + p.y * displayScale}`).join(' ')
    : ''

  return (
    <div className="panel-card">
      <div className="panel-head">
        <h2>Adjust Crop</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn-mini" onClick={handleRedetect} disabled={!scanner || redetecting}>
            <Sparkles size={13} /> {redetecting ? 'DETECTING...' : 'RE-DETECT'}
          </button>
          <button type="button" className="btn-mini" onClick={handleReset}><RotateCcw size={13} /> RESET</button>
        </div>
      </div>

      <div className="escan-cam-scroll">
        <div className="escan-adjust-wrap" ref={innerWrapRef}>
          <img ref={imgRef} src={imgSrc} alt="Captured page" onLoad={recomputeScale} draggable={false} />

          <svg className="escan-crop-outline">
            {polygonPoints && <polygon points={polygonPoints} />}
          </svg>

          <div className="escan-corner-layer">
            {CORNER_KEYS.map(key => (
              <div
                key={key}
                className="escan-corner-handle"
                style={{ left: imgOffset.left + corners[key].x * displayScale, top: imgOffset.top + corners[key].y * displayScale }}
                onPointerDown={e => handleCornerPointerDown(key, e)}
                onPointerMove={handleCornerPointerMove}
                onPointerUp={handleCornerPointerUp}
                onPointerCancel={handleCornerPointerUp}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="whisper-line" style={{ marginTop: '10px' }}>Drag the four corners so they sit exactly on the page's edges.</p>

      <div className="escan-cam-controls">
        <button type="button" className="btn-mini" onClick={onRetake}><Camera size={13} /> RETAKE</button>
        <button type="button" className="btn-primary" onClick={() => onConfirm(corners)}><Check size={16} /> Confirm Page</button>
      </div>
    </div>
  )
}

export default CropAdjust