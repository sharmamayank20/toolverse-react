import { useState, useRef, useEffect } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Rocket, Square } from 'lucide-react'
import CircularText from '../components/CircularText'

const UNITS = {
  kmh: { label: 'km/h', factor: 3.6 },
  mph: { label: 'mph', factor: 2.23694 },
  ms: { label: 'm/s', factor: 1 },
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function VelocityTracker() {
  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const routeLineRef = useRef(null)
  const markerRef = useRef(null)
  const watchIdRef = useRef(null)
  const lastPointRef = useRef(null)
  const durationTimerRef = useRef(null)
  const startTimeRef = useRef(null)

  const [unit, setUnit] = useState('kmh')
  const [tracking, setTracking] = useState(false)
  const [speedMs, setSpeedMs] = useState(0)
  const [maxSpeedMs, setMaxSpeedMs] = useState(0)
  const [avgSpeedMs, setAvgSpeedMs] = useState(0)
  const [speedSamples, setSpeedSamples] = useState([])
  const [distanceKm, setDistanceKm] = useState(0)
  const [pointCount, setPointCount] = useState(0)
  const [duration, setDuration] = useState('00:00')
  const [gpsStatus, setGpsStatus] = useState('GPS OFF')
  const [statusLine, setStatusLine] = useState('Enable GPS to start tracking.')
  const [loc, setLoc] = useState({ lat: '—', lng: '—', acc: '—', heading: '—' })

  useEffect(() => {
    mapRef.current = L.map(mapDivRef.current, { zoomControl: true }).setView([20, 0], 2)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(mapRef.current)
    routeLineRef.current = L.polyline([], { color: '#2440FF', weight: 4 }).addTo(mapRef.current)
    return () => mapRef.current?.remove()
  }, [])

  const unitInfo = UNITS[unit]
  const displaySpeed = speedMs * unitInfo.factor
  const maxGaugeSpeed = unit === 'kmh' ? 120 : unit === 'mph' ? 75 : 33
  const pct = Math.max(0, Math.min(1, displaySpeed / maxGaugeSpeed))
  const needleAngle = -90 + pct * 180
  const dashOffset = 251 - pct * 251

  function onPosition(pos) {
    const { latitude, longitude, speed, accuracy, heading } = pos.coords
    setGpsStatus('GPS ON')
    setLoc({
      lat: latitude.toFixed(5), lng: longitude.toFixed(5),
      acc: accuracy ? accuracy.toFixed(0) + ' m' : '—',
      heading: (heading || heading === 0) ? heading.toFixed(0) + '°' : '—',
    })

    let s = speed
    if (s == null && lastPointRef.current) {
      const last = lastPointRef.current
      const dt = (pos.timestamp - last.t) / 1000
      const dist = haversine(last.lat, last.lng, latitude, longitude)
      s = dt > 0 ? dist / dt : 0
    }
    s = s || 0

    if (lastPointRef.current) {
      const last = lastPointRef.current
      const d = haversine(last.lat, last.lng, latitude, longitude)
      setDistanceKm(prev => prev + d / 1000)
    }
    lastPointRef.current = { lat: latitude, lng: longitude, t: pos.timestamp }

    setSpeedMs(s)
    setMaxSpeedMs(prev => Math.max(prev, s))
    setSpeedSamples(prev => {
      const next = [...prev, s]
      setAvgSpeedMs(next.reduce((a, b) => a + b, 0) / next.length)
      return next
    })
    setPointCount(prev => prev + 1)

    const latlng = [latitude, longitude]
    routeLineRef.current.addLatLng(latlng)
    if (!markerRef.current) {
      markerRef.current = L.circleMarker(latlng, { radius: 7, color: '#0D0D0F', weight: 2, fillColor: '#E8FF3D', fillOpacity: 1 }).addTo(mapRef.current)
      mapRef.current.setView(latlng, 17)
    } else {
      markerRef.current.setLatLng(latlng)
      mapRef.current.panTo(latlng)
    }
    setStatusLine('Tracking…')
  }

  function handleStart() {
    if (!navigator.geolocation) { setStatusLine('Geolocation not supported by this browser.'); return }
    setTracking(true)
    startTimeRef.current = Date.now()
    lastPointRef.current = null
    setSpeedSamples([]); setMaxSpeedMs(0); setAvgSpeedMs(0); setDistanceKm(0); setPointCount(0)
    routeLineRef.current?.setLatLngs([])
    setStatusLine('Acquiring GPS signal…')

    watchIdRef.current = navigator.geolocation.watchPosition(onPosition, err => {
      setStatusLine('GPS error: ' + err.message)
      setGpsStatus('GPS ERROR')
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 })

    durationTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
      const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
      const ss = String(elapsed % 60).padStart(2, '0')
      setDuration(`${mm}:${ss}`)
    }, 1000)
  }

  function handleStop() {
    setTracking(false)
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    if (durationTimerRef.current) clearInterval(durationTimerRef.current)
    setStatusLine('Stopped. Press Start to track again.')
    setGpsStatus('GPS OFF')
  }

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">UTILITY</span><span className="num">CATALOG NO. 024</span></div>
            <h1>Velocity Tracker</h1>
            <p>Real-time GPS speed tracking for walking, running, or driving — draws your live route as you move.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">CLIENT-SIDE</span>
              <span className="tool-chip">GPS REQUIRED</span>
            </div>
          </div>
          <CircularText text="LIVE TELEMETRY • GPS.SYS • " spinDuration={16} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1300px', margin: '0 auto', padding: '44px 40px 100px' }}>
        <div className="bento">

          <div className="panel-card tile-hero">
            <div className="panel-head"><h2>Live Speed</h2><span className="tool-chip">{gpsStatus}</span></div>

            <div className="gauge-wrap">
              <svg viewBox="0 0 200 120" className="gauge-svg">
                <g>
                  <line x1="16" y1="100" x2="6" y2="100" className="tick" />
                  <line x1="27.3" y1="58" x2="18.6" y2="53" className="tick" />
                  <line x1="58" y1="27.3" x2="53" y2="18.6" className="tick" />
                  <line x1="100" y1="16" x2="100" y2="6" className="tick" />
                  <line x1="142" y1="27.3" x2="147" y2="18.6" className="tick" />
                  <line x1="172.7" y1="58" x2="181.4" y2="53" className="tick" />
                  <line x1="184" y1="100" x2="194" y2="100" className="tick" />
                </g>
                <path className="gauge-track" d="M 20 100 A 80 80 0 0 1 180 100" fill="none" strokeWidth="10" />
                <path className="gauge-arc" d="M 20 100 A 80 80 0 0 1 180 100" fill="none" strokeWidth="10" strokeDasharray="251" strokeDashoffset={dashOffset} />
                <polygon points="100,30 105,102 100,96 95,102" className="gauge-needle" style={{ transformOrigin: '100px 100px', transform: `rotate(${needleAngle}deg)` }} />
                <rect x="94" y="94" width="12" height="12" className="gauge-hub" />
              </svg>
              <div className="speed-readout">
                <div className="speed-value">{displaySpeed.toFixed(1)}</div>
                <div className="speed-unit">{unitInfo.label}</div>
              </div>
            </div>

            <p style={{ textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>{statusLine}</p>

            <div className="field" style={{ marginBottom: '14px' }}>
              <label>Speed Unit</label>
              <select value={unit} onChange={e => setUnit(e.target.value)}>
                <option value="kmh">Kilometers per hour (km/h)</option>
                <option value="mph">Miles per hour (mph)</option>
                <option value="ms">Meters per second (m/s)</option>
              </select>
            </div>

            {!tracking ? (
            <button type="button" className="btn-primary" onClick={handleStart}><Rocket size={16} /> START TRACKING</button>
            ) : (
            <button type="button" className="btn-primary" style={{ background: 'var(--coral)' }} onClick={handleStop}><Square size={16} /> STOP</button>
            )}
          </div>

          <div className="panel-card tile-map">
            <div className="panel-head"><h2>Route Map</h2><span className="tool-chip">{pointCount} POINTS</span></div>
            <div id="routeMap" ref={mapDivRef}></div>
            <p className="map-note">Start tracking to draw your route. Map data © OpenStreetMap contributors.</p>
          </div>

          <div className="panel-card tile-kmax kpi-tile-big"><span className="num">{(maxSpeedMs * unitInfo.factor).toFixed(1)}</span><span className="unit">Max Speed ({unitInfo.label})</span></div>
          <div className="panel-card tile-kavg kpi-tile-big"><span className="num">{(avgSpeedMs * unitInfo.factor).toFixed(1)}</span><span className="unit">Avg Speed ({unitInfo.label})</span></div>
          <div className="panel-card tile-kdist kpi-tile-big"><span className="num">{distanceKm.toFixed(2)}</span><span className="unit">Distance (km)</span></div>
          <div className="panel-card tile-kdur kpi-tile-big"><span className="num">{duration}</span><span className="unit">Duration</span></div>

          <div className="panel-card tile-loc">
            <div className="panel-head"><h2>Location Details</h2></div>
            <div className="info-row"><span>Latitude</span><strong>{loc.lat}</strong></div>
            <div className="info-row"><span>Longitude</span><strong>{loc.lng}</strong></div>
            <div className="info-row"><span>Accuracy</span><strong>{loc.acc}</strong></div>
            <div className="info-row"><span>Heading</span><strong>{loc.heading}</strong></div>
          </div>

          <div className="panel-card tile-tips">
            <div className="panel-head"><h2>Usage Tips</h2></div>
            <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--fg)' }}>Walking:</strong> ~5 km/h · <strong style={{ color: 'var(--fg)' }}>Running:</strong> ~10–15 km/h · <strong style={{ color: 'var(--fg)' }}>Cycling:</strong> ~20–30 km/h · <strong style={{ color: 'var(--fg)' }}>Driving:</strong> 40–120 km/h<br /><br />
              Works best outdoors with a clear sky view. Accuracy improves after 10–20 seconds.
            </p>
          </div>

        </div>
      </main>
    </>
  )
}

export default VelocityTracker