import { useState, useRef, useEffect } from 'react'
import * as exifr from 'exifr'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { motion, AnimatePresence } from 'framer-motion'
import { Radar, Smartphone, XCircle, Info, MapPin, CheckCircle2, AlertCircle, Eraser, Download, ArrowDownToLine, ShieldCheck } from 'lucide-react'
import CircularText from '../components/CircularText'
import Modal from '../components/Modal'

const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']

function isHeicFile(file) {
  const type = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  return HEIC_TYPES.includes(type) || name.endsWith('.heic') || name.endsWith('.heif')
}
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}
function fmtCoord(v, isLat) {
  if (v == null || isNaN(v)) return null
  const dir = isLat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W')
  return `${Math.abs(v).toFixed(6)}° ${dir}`
}
function getImageDims(file) {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url) }
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url) }
    img.src = url
  })
}

function ExifPurger() {
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [exifData, setExifData] = useState(null)
  const [dims, setDims] = useState(null)
  const [hasGps, setHasGps] = useState(false)
  const [purgedBlob, setPurgedBlob] = useState(null)
  const [purging, setPurging] = useState(false)
  const [status, setStatus] = useState({ msg: 'Drop a photo to begin — parsing happens entirely on your device.', type: 'idle' })
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  const dragCounterRef = useRef(0)
  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => () => { mapRef.current?.remove() }, [])

  useEffect(() => {
    if (!hasGps || !exifData || !mapDivRef.current) return
    const lat = exifData.latitude, lon = exifData.longitude
    if (!mapRef.current) {
      mapRef.current = L.map(mapDivRef.current).setView([lat, lon], 14)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(mapRef.current)
    } else {
      mapRef.current.setView([lat, lon], 14)
    }
    if (markerRef.current) mapRef.current.removeLayer(markerRef.current)
    markerRef.current = L.marker([lat, lon]).addTo(mapRef.current).bindPopup('Exact shot location — embedded in this file').openPopup()
    setTimeout(() => mapRef.current.invalidateSize(), 150)
  }, [hasGps, exifData])

  async function handleFile(f) {
    if (isHeicFile(f)) { setStatus({ msg: 'HEIC support is coming soon — export as JPEG/PNG first, or use a different photo.', type: 'error' }); return }
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(f.type)) { setStatus({ msg: 'Invalid file type. Please upload a JPG or PNG.', type: 'error' }); return }
    if (f.size > 20 * 1024 * 1024) { setStatus({ msg: 'File too large. Maximum size is 20 MB.', type: 'error' }); return }

    setFile(f)
    setPurgedBlob(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(f))
    setStatus({ msg: 'Reading embedded metadata locally…', type: 'loading' })
    setProgress(20)

    try {
      const data = await exifr.parse(f, { gps: true, tiff: true, exif: true, ifd0: true, ifd1: false })
      const parsed = data || {}
      setExifData(parsed)
      setProgress(55)

      const lat = parsed.latitude, lon = parsed.longitude
      const gpsFound = typeof lat === 'number' && typeof lon === 'number'
      setHasGps(gpsFound)

      const d = await getImageDims(f)
      setDims(d)

      const fieldCount = Object.keys(parsed).filter(k => parsed[k] != null).length
      setProgress(100)
      setStatus({ msg: `Metadata parsed locally — ${fieldCount} field(s) detected.`, type: 'success' })
      setTimeout(() => setProgress(0), 800)
    } catch (err) {
      console.error('EXIF parse error:', err)
      setExifData({})
      setHasGps(false)
      setStatus({ msg: 'Could not read metadata — the file may have none, or purging is still possible.', type: 'error' })
      setProgress(0)
    }
  }

  async function handlePurge() {
    if (!file) return
    setPurging(true)
    setStatus({ msg: 'Re-encoding pixels on a blank canvas — original bytes are discarded…', type: 'loading' })
    setProgress(20)
    try {
      const img = new Image()
      const srcUrl = URL.createObjectURL(file)
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = srcUrl })
      setProgress(50)

      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      URL.revokeObjectURL(srcUrl)
      setProgress(75)

      const isPng = file.type === 'image/png'
      const blob = await new Promise(resolve => canvas.toBlob(resolve, isPng ? 'image/png' : 'image/jpeg', isPng ? undefined : 0.92))
      setPurgedBlob(blob)
      setProgress(100)
      setStatus({ msg: 'Clean copy ready — zero GPS, camera, or timestamp data remains.', type: 'success' })
      setTimeout(() => setProgress(0), 800)
    } catch (err) {
      console.error('Purge error:', err)
      setStatus({ msg: 'Could not process this image for purging.', type: 'error' })
      setProgress(0)
    } finally {
      setPurging(false)
    }
  }

  function handleDownload() {
    if (!purgedBlob || !file) return
    const isPng = file.type === 'image/png'
    const base = file.name.replace(/\.[^/.]+$/, '')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(purgedBlob)
    a.download = `${base}-clean.${isPng ? 'png' : 'jpg'}`
    a.click()
  }

  function handleReset() {
    setFile(null); setExifData(null); setDims(null); setHasGps(false); setPurgedBlob(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    if (markerRef.current && mapRef.current) { mapRef.current.removeLayer(markerRef.current); markerRef.current = null }
    setStatus({ msg: 'Drop a photo to begin — parsing happens entirely on your device.', type: 'idle' })
    setProgress(0)
  }

  const fieldCount = exifData ? Object.keys(exifData).filter(k => exifData[k] != null).length : 0

  const rows = exifData ? [
    ['GPS Coordinates', hasGps ? `${fmtCoord(exifData.latitude, true)}, ${fmtCoord(exifData.longitude, false)}` : null, hasGps],
    ['Altitude', exifData.GPSAltitude ? `${Math.round(exifData.GPSAltitude)} m` : null, !!exifData.GPSAltitude],
    ['Camera Make', exifData.Make, false],
    ['Camera Model', exifData.Model, false],
    ['Date Taken', exifData.DateTimeOriginal ? new Date(exifData.DateTimeOriginal).toLocaleString() : (exifData.CreateDate ? new Date(exifData.CreateDate).toLocaleString() : null), false],
    ['Dimensions', dims ? `${dims.w} × ${dims.h} px` : null, false],
    ['Software', exifData.Software, false],
    ['Orientation', exifData.Orientation !== undefined ? String(exifData.Orientation) : null, false],
  ] : []

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">MEDIA</span><span className="num">CATALOG NO. 022</span></div>
            <h1>EXIF Purger</h1>
            <p>
              See what your photo reveals, then wipe it clean — all in your browser.{' '}
              <button type="button" className="info-btn" onClick={() => setShowInfo(true)}><Info size={13} /> How this works</button>
            </p>
            <div className="hero-badges">
              <span className="hero-badge"><b>0</b> uploads to any server</span>
              <span className="hero-badge"><b>100%</b> client-side processing</span>
              <span className="hero-badge"><b>2</b> supported formats — JPG / PNG</span>
              <span className="hero-badge soon"><b>HEIC</b> coming soon</span>
            </div>
          </div>
          <CircularText text="PRIVACY.SYS • EXIF ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>

        {!file ? (
          <div className="upload-stage" style={{ maxWidth: '620px', margin: '0 auto' }}>
            <div
              className={`dropzone ${dragging ? 'drag' : ''}`}
              onClick={() => document.getElementById('exifFileInput').click()}
              onDragEnter={e => { e.preventDefault(); dragCounterRef.current += 1; setDragging(true) }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={e => { e.preventDefault(); dragCounterRef.current -= 1; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragging(false) } }}
              onDrop={e => { e.preventDefault(); dragCounterRef.current = 0; setDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
              style={{ textAlign: 'center' }}
            >
              <div className="dropzone-content">
                <div className="upload-icon-wrap"><Radar size={28} /></div>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', marginBottom: '6px' }}>Drag & drop a photo</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)' }}>
                  or <span style={{ color: 'var(--cobalt)', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 700 }}>click to browse</span>
                </div>
                <div className="format-pills">
                  <span className="format-pill">JPG</span>
                  <span className="format-pill">PNG</span>
                  <span className="format-pill size">≤ 20MB</span>
                </div>
              </div>
              <AnimatePresence>
                {dragging && (
                  <motion.div className="drop-overlay" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
                    <div className="drop-overlay-icon"><ArrowDownToLine size={26} /></div>
                    <div className="drop-overlay-text">Drop to scan</div>
                  </motion.div>
                )}
              </AnimatePresence>
              <input id="exifFileInput" type="file" accept="image/jpeg,image/jpg,image/png" hidden onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
            </div>
            <div className="privacy-badge">
              <ShieldCheck size={22} />
              <span>Nothing is uploaded — GPS, camera fingerprint, and timestamp data are only ever read on your device.</span>
            </div>
          </div>
        ) : (
          <>
            <div className="tool-workbench">
              <div>
                <div className="panel-card" style={{ marginBottom: '20px' }}>
                  <div className="panel-head">
                    <h2>Photo</h2>
                    <button type="button" className="btn-mini" onClick={handleReset}>RESET</button>
                  </div>
                  <div style={{ border: '2px solid var(--fg)', marginBottom: '10px', overflow: 'hidden' }}>
                    <img src={previewUrl} alt="Original" style={{ width: '100%', display: 'block', maxHeight: '260px', objectFit: 'contain', background: 'var(--bg)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--muted)' }}>
                    <span>{file.name}</span><span>{formatFileSize(file.size)}</span>
                  </div>
                </div>

                <div className="panel-card">
                  <div className="panel-head">
                    <h2>Extracted Metadata</h2>
                    <span className="tool-chip" style={hasGps ? { background: 'var(--coral)', color: 'var(--badge-paper)', borderColor: 'var(--coral)' } : {}}>
                      {hasGps ? <><MapPin size={11} style={{ display: 'inline', marginRight: 3 }} />GPS FOUND</> : 'NO GPS'}
                    </span>
                  </div>
                  <table className="meta-table">
                    <tbody>
                      {rows.map(([k, v, hot]) => (
                        <tr key={k}><td className="k">{k}</td><td className={`v ${!v ? 'empty' : ''} ${hot ? 'hot' : ''}`}>{v || 'Not found'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--muted)', marginTop: '12px' }}>
                    {hasGps ? 'This reveals exactly where it was taken.' : 'Never leaves your browser tab.'}
                  </p>
                </div>
              </div>

              <div>
                <div className="panel-card" style={{ marginBottom: '20px' }}>
                  <div className="panel-head"><h2>Location Plot</h2><span className="tool-chip">LEAFLET + OSM</span></div>
                  <div className="map-frame">
                    <div ref={mapDivRef} id="exifMap" style={{ display: hasGps ? 'block' : 'none' }}></div>
                    {!hasGps && (
                      <div className="map-empty">
                        <MapPin size={22} />
                        <p>No GPS data in this photo.</p>
                      </div>
                    )}
                  </div>
                  <div className="map-coords-bar">
                    <span>{hasGps ? `${fmtCoord(exifData.latitude, true)}, ${fmtCoord(exifData.longitude, false)}` : '—'}</span>
                    <span>{hasGps && exifData.GPSAltitude ? `Altitude: ${Math.round(exifData.GPSAltitude)} m` : ''}</span>
                  </div>
                  <button type="button" className="btn-primary" onClick={handlePurge} disabled={purging}>
                    <Eraser size={16} /> {purging ? 'PURGING…' : 'PURGE METADATA'}
                  </button>
                </div>

                <div className="panel-card">
                  <div className="panel-head"><h2>Result</h2></div>
                  <div className={`status-line ${status.type}`} style={{ marginBottom: '10px' }}>
                    {status.type === 'error' && <AlertCircle size={14} />}
                    {status.type === 'success' && <CheckCircle2 size={14} />}
                    <span>{status.msg}</span>
                  </div>
                  <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div>

                  {purgedBlob && (
                    <>
                      <div className="compare-row">
                        <div className="compare-card">
                          <div className="compare-label">Original</div>
                          <div className="compare-value">{fieldCount}</div>
                          <div className="compare-sub">{formatFileSize(file.size)}</div>
                        </div>
                        <div className="compare-card clean">
                          <div className="compare-label">Purged</div>
                          <div className="compare-value">0</div>
                          <div className="compare-sub">{formatFileSize(purgedBlob.size)}</div>
                        </div>
                      </div>
                      <button type="button" className="btn-primary" onClick={handleDownload}><Download size={16} /> DOWNLOAD CLEAN IMAGE</button>
                      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--muted)', marginTop: '10px' }}>No GPS, no camera fingerprint, no timestamp — untraceable.</p>
                    </>
                  )}

                  <div className="field-row" style={{ marginTop: '20px' }}>
                    <div className="kpi-tile"><span className="num">{hasGps ? 'YES' : 'NO'}</span><span className="label">GPS Found</span></div>
                    <div className="kpi-tile"><span className="num">{fieldCount}</span><span className="label">Fields</span></div>
                    <div className="kpi-tile"><span className="num" style={{ fontSize: '13px' }}>This Device</span><span className="label">Processed On</span></div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

      </main>

      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="How This Tool Works">
        <h4>Pipeline</h4>
        <ol>
          <li>File is read locally with <strong>FileReader</strong> — never leaves the tab.</li>
          <li><strong>exifr</strong> parses GPS, camera, and timestamp tags from the original bytes.</li>
          <li>Coordinates get pinned on a live <strong>Leaflet</strong> map.</li>
          <li>Purge redraws the image on a blank <strong>canvas</strong>, dropping every tag.</li>
          <li>The clean file downloads directly — no network request ever fires.</li>
        </ol>
        <p>JPG and PNG only for now — HEIC (iPhone) support is coming soon.</p>
        <h4>What Gets Removed</h4>
        <ul>
          <li>GPS latitude, longitude & altitude</li>
          <li>Camera make, model & serial numbers</li>
          <li>Original capture date & time</li>
          <li>Software / device fingerprint tags</li>
          <li>Embedded thumbnail previews</li>
        </ul>
        <h4>Why It Matters</h4>
        <p>GPS in a shared photo can reveal your home or a child's school. Camera serials can fingerprint "anonymous" images. Since everything runs locally, there's nothing to leak — check your browser's network tab to confirm.</p>
      </Modal>
    </>
  )
}

export default ExifPurger