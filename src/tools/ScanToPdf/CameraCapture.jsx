import { useRef, useEffect, useState } from 'react'
import { Camera, RefreshCw, Check, Search } from 'lucide-react'

// Analysis is done at a fixed small width regardless of the actual
// camera resolution — OpenCV contour-finding cost scales with pixel
// count, and 400px wide is plenty to find a page-sized quad.
const ANALYSIS_W = 400
const DETECT_INTERVAL_MS = 260

function CameraCapture({
  scanner, cv, cvReady,
  pages, facingMode, onSwitchCamera,
  onCapture, onDone, onCancel,
}) {
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const analysisCanvasRef = useRef(null)
  const detectTimerRef = useRef(null)
  const streamRef = useRef(null)

  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true)
  const [captureReady, setCaptureReady] = useState(false)
  const [flashing, setFlashing] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function startStream() {
      try {
        const constraints = {
          video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        video.srcObject = stream
        await video.play()
        setCaptureReady(true)
        startDetectionLoop()
      } catch (err) {
        console.error('Camera error:', err)
        alert(`Could not access the camera (${err.message}). Try "Upload Photos" instead.`)
        onCancel()
      }
    }
    startStream()

    return () => {
      cancelled = true
      clearTimeout(detectTimerRef.current)
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode])

  function startDetectionLoop() {
    if (!analysisCanvasRef.current) analysisCanvasRef.current = document.createElement('canvas')
    const analysisCanvas = analysisCanvasRef.current
    const aCtx = analysisCanvas.getContext('2d', { willReadFrequently: true })

    function tick() {
      const video = videoRef.current
      const overlay = overlayRef.current
      if (!video || !overlay || !streamRef.current) return
      const vw = video.videoWidth, vh = video.videoHeight
      if (vw && vh) {
        overlay.width = vw; overlay.height = vh
        const octx = overlay.getContext('2d')
        octx.clearRect(0, 0, vw, vh)

        const scale = ANALYSIS_W / vw
        analysisCanvas.width = ANALYSIS_W
        analysisCanvas.height = Math.max(1, Math.round(vh * scale))
        aCtx.drawImage(video, 0, 0, analysisCanvas.width, analysisCanvas.height)

        if (autoDetectEnabled && cvReady && scanner) {
          let mat = null, contour = null
          try {
            mat = cv.imread(analysisCanvas)
            contour = scanner.findPaperContour(mat)
            if (contour) {
              const cp = scanner.getCornerPoints(contour, mat)
              if (cp && cp.topLeftCorner) drawQuad(octx, cp, 1 / scale)
            }
          } catch (e) { /* ignore per-frame detection errors */ }
          finally {
            if (contour && contour.delete) contour.delete()
            if (mat && mat.delete) mat.delete()
          }
        }
      }
      detectTimerRef.current = setTimeout(tick, DETECT_INTERVAL_MS)
    }
    tick()
  }

  function drawQuad(ctx, cp, invScale) {
    const pts = [cp.topLeftCorner, cp.topRightCorner, cp.bottomRightCorner, cp.bottomLeftCorner]
    ctx.beginPath()
    pts.forEach((p, i) => {
      const x = p.x * invScale, y = p.y * invScale
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.lineWidth = 4
    ctx.strokeStyle = '#2440FF'
    ctx.fillStyle = 'rgba(36,64,255,0.12)'
    ctx.fill()
    ctx.stroke()
  }

  function handleToggleDetect() {
    setAutoDetectEnabled(v => {
      const next = !v
      if (!next && overlayRef.current) {
        overlayRef.current.getContext('2d').clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
      }
      return next
    })
  }

  function showToast(msg) {
    setToast(msg)
    clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 1400)
  }

  function handleCapture() {
    const video = videoRef.current
    const vw = video.videoWidth, vh = video.videoHeight
    if (!vw || !vh) return
    const shot = document.createElement('canvas')
    shot.width = vw; shot.height = vh
    shot.getContext('2d').drawImage(video, 0, 0, vw, vh)

    setFlashing(true)
    setTimeout(() => setFlashing(false), 450)
    clearTimeout(detectTimerRef.current)

    showToast(`Page ${pages.length + 1} captured`)
    onCapture(shot)
  }

  return (
    <div className="panel-card">
      <div className="panel-head">
        <h2>Camera</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="tool-chip">{pages.length} page{pages.length === 1 ? '' : 's'} captured</span>
          <button type="button" className={`btn-mini ${autoDetectEnabled ? 'pressed' : ''}`} aria-pressed={autoDetectEnabled} onClick={handleToggleDetect}>
            <Search size={13} /> AUTO-DETECT {autoDetectEnabled ? 'ON' : 'OFF'}
          </button>
          <button type="button" className="btn-mini" onClick={onSwitchCamera}><RefreshCw size={13} /> SWITCH</button>
          <button type="button" className="btn-mini" onClick={onCancel}>CANCEL</button>
        </div>
      </div>

      <div className="escan-cam-scroll">
        <div className="escan-cam-wrap">
          <video ref={videoRef} playsInline autoPlay muted></video>
          <canvas ref={overlayRef}></canvas>
          <div className={`escan-cam-flash ${flashing ? 'flash-anim' : ''}`}></div>
          {toast && <div className="escan-capture-toast show">{toast}</div>}
        </div>
      </div>

      <div className="escan-cam-controls">
        <button type="button" className="btn-primary escan-shutter" onClick={handleCapture} disabled={!captureReady}>
          <Camera size={18} /> Capture
        </button>
        <button type="button" className="btn-mini" onClick={onDone}><Check size={13} /> Done — Build PDF</button>
      </div>

      {pages.length > 0 && (
        <div className="escan-filmstrip">
          {pages.map((page, idx) => (
            <div key={page.id} className="escan-filmstrip-item">
              <img src={page.thumbSrc} alt={`Page ${idx + 1}`} />
              <span className="escan-filmstrip-num">{idx + 1}</span>
            </div>
          ))}
        </div>
      )}

      <p className="whisper-line" style={{ marginTop: '10px' }}>Hold the page flat inside the frame — the highlighted outline shows what we'll capture. Captured a few pages already? Tap Done — Build PDF any time.</p>
    </div>
  )
}

export default CameraCapture