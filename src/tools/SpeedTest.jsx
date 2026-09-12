import { useState, useRef, useEffect } from 'react'
import CloudflareSpeedTest from '@cloudflare/speedtest'
import { Zap, ArrowDown, ArrowUp, Radio, Loader2 } from 'lucide-react'
import CircularText from '../components/CircularText'

const HISTORY_KEY = 'toolverse_speedtest_history'
const MAX_HISTORY = 10
const MAX_GAUGE_MBPS = 1000 // full-scale needle/arc reading, matches legacy tool

// Same measurement sequence as Cloudflare's own default, minus the packetLoss
// step (that one needs our own TURN server credentials, which we don't run).
const MEASUREMENTS = [
  { type: 'latency', numPackets: 1 },
  { type: 'download', bytes: 1e5, count: 1, bypassMinDuration: true },
  { type: 'latency', numPackets: 20 },
  { type: 'download', bytes: 1e5, count: 9 },
  { type: 'download', bytes: 1e6, count: 8 },
  { type: 'upload', bytes: 1e5, count: 8 },
  { type: 'upload', bytes: 1e6, count: 6 },
  { type: 'download', bytes: 1e7, count: 6 },
  { type: 'upload', bytes: 1e7, count: 4 },
  { type: 'download', bytes: 2.5e7, count: 4 },
  { type: 'upload', bytes: 2.5e7, count: 4 },
  { type: 'download', bytes: 1e8, count: 3 },
  { type: 'upload', bytes: 5e7, count: 3 },
  { type: 'download', bytes: 2.5e8, count: 2 },
]

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) ?? [] }
  catch { return [] }
}
function saveHistory(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)) } catch {}
}

// bits-per-second -> Mbps (decimal, matches industry convention / Ookla)
function formatMbps(bps) {
  if (bps == null || isNaN(bps)) return null
  return Math.round((bps / 1e6) * 10) / 10
}

function qualityFor(downloadMbps) {
  if (downloadMbps == null) return null
  if (downloadMbps >= 100) return { tier: 'excellent', label: 'Excellent', desc: 'Perfect for 4K/8K streaming, online gaming, and large file transfers.' }
  if (downloadMbps >= 50) return { tier: 'good', label: 'Good', desc: 'Great for HD streaming, video calls, and smooth browsing.' }
  if (downloadMbps >= 25) return { tier: 'good', label: 'Good', desc: 'Suitable for HD streaming and video conferencing.' }
  if (downloadMbps >= 10) return { tier: 'fair', label: 'Fair', desc: 'Adequate for SD streaming and basic browsing.' }
  return { tier: 'poor', label: 'Poor', desc: 'Connection may struggle with video calls and streaming.' }
}

function SpeedTest() {
  const [isTesting, setIsTesting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [gaugeSpeed, setGaugeSpeed] = useState(0) // live Mbps shown on the dial while testing
  const [phaseLabel, setPhaseLabel] = useState('Ready to test your connection')
  const [statusLine, setStatusLine] = useState('Click "Start Speed Test" to begin.')
  const [download, setDownload] = useState(null)
  const [upload, setUpload] = useState(null)
  const [ping, setPing] = useState(null)
  const [history, setHistory] = useState(() => loadHistory())
  const [errorMsg, setErrorMsg] = useState(null)

  const engineRef = useRef(null)
  const completedRef = useRef(0)

  // Stop any in-flight measurement if the user navigates away mid-test — this
  // is an SPA, so the component can unmount without a full page reload.
  useEffect(() => () => { engineRef.current?.pause() }, [])

  function runTest() {
    if (isTesting) return
    setIsTesting(true)
    setErrorMsg(null)
    completedRef.current = 0
    setProgress(0)
    setGaugeSpeed(0)
    setDownload(null); setUpload(null); setPing(null)
    setPhaseLabel('Connecting to Cloudflare edge network...')
    setStatusLine('Starting speed test...')

    try {
      const engine = new CloudflareSpeedTest({
        autoStart: false,
        measurements: MEASUREMENTS,
        // hard cap so a single request on a very slow link can't stall the whole test
        bandwidthAbortRequestDuration: 10000,
      })
      engineRef.current = engine

      engine.onResultsChange = ({ type }) => {
        completedRef.current += 1
        setProgress(Math.min(95, Math.round((completedRef.current / MEASUREMENTS.length) * 100)))

        if (type === 'latency') {
          const p = engine.results.getUnloadedLatency()
          if (p != null) { setPing(Math.round(p)); setPhaseLabel('Measuring latency to Cloudflare edge...'); setStatusLine('Testing ping latency...') }
        } else if (type === 'download') {
          const mbps = formatMbps(engine.results.getDownloadBandwidth())
          if (mbps != null) { setDownload(mbps); setGaugeSpeed(mbps); setPhaseLabel('Testing download speed...'); setStatusLine('Testing download speed...') }
        } else if (type === 'upload') {
          const mbps = formatMbps(engine.results.getUploadBandwidth())
          if (mbps != null) { setUpload(mbps); setGaugeSpeed(mbps); setPhaseLabel('Testing upload speed...'); setStatusLine('Testing upload speed...') }
        }
      }

      engine.onFinish = (results) => {
        const finalDown = formatMbps(results.getDownloadBandwidth())
        const finalUp = formatMbps(results.getUploadBandwidth())
        const rawPing = results.getUnloadedLatency()
        const finalPing = rawPing != null ? Math.round(rawPing) : null

        setProgress(100)
        setDownload(finalDown); setUpload(finalUp); setPing(finalPing)
        setGaugeSpeed(finalDown ?? 0)
        setPhaseLabel(`Download: ${finalDown ?? '—'} Mbps • Upload: ${finalUp ?? '—'} Mbps • Ping: ${finalPing ?? '—'}ms`)
        setStatusLine('Speed test complete.')

        const entry = {
          download: finalDown, upload: finalUp, ping: finalPing,
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        }
        setHistory(prev => {
          const next = [entry, ...prev].slice(0, MAX_HISTORY)
          saveHistory(next)
          return next
        })
        setIsTesting(false)
      }

      engine.onError = (error) => {
        console.error('Speed test error:', error)
        setErrorMsg(String(error || 'An error occurred during testing.'))
        setStatusLine('Test failed. Please check your connection and try again.')
        setProgress(0)
        setGaugeSpeed(0)
        setIsTesting(false)
      }

      engine.play()
    } catch (error) {
      console.error('Speed test failed to start:', error)
      setErrorMsg('An error occurred starting the test.')
      setStatusLine('Test failed. Please check your connection and try again.')
      setIsTesting(false)
    }
  }

  function clearHistory() {
    if (!confirm('Clear all test history?')) return
    setHistory([])
    saveHistory([])
  }

  const gaugePercent = Math.min((gaugeSpeed / MAX_GAUGE_MBPS) * 100, 100)
  const needleRotation = -90 + Math.min((gaugeSpeed / MAX_GAUGE_MBPS) * 180, 180)
  const arcLength = 251
  const arcOffset = arcLength - (arcLength * gaugePercent) / 100
  const quality = qualityFor(download)

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">DEV</span><span className="num">CATALOG NO. 026</span></div>
            <h1>Speed Test</h1>
            <p>Measure your download, upload speed, and ping latency against Cloudflare's global edge network.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">CLOUDFLARE EDGE</span>
              <span className="tool-chip">NO SIGNUP</span>
            </div>
          </div>
          <CircularText text="NET.SYS • DOWNLOAD • UPLOAD • PING • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>
        <div className="tool-workbench">

          <div className="panel-card">
            <div className="panel-head">
              <h2>Test Controls</h2>
              <span className="tool-chip">ACCURATE</span>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '18px' }}>
              <svg viewBox="0 0 200 120" style={{ width: '100%', maxWidth: '260px' }}>
                <g stroke="var(--muted)" strokeWidth="2">
                  <line x1="16" y1="100" x2="6" y2="100" />
                  <line x1="27.3" y1="58" x2="18.6" y2="53" />
                  <line x1="58" y1="27.3" x2="53" y2="18.6" />
                  <line x1="100" y1="16" x2="100" y2="6" />
                  <line x1="142" y1="27.3" x2="147" y2="18.6" />
                  <line x1="172.7" y1="58" x2="181.4" y2="53" />
                  <line x1="184" y1="100" x2="194" y2="100" />
                </g>
                <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--fg)" strokeOpacity="0.15" strokeWidth="10" />
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="url(#speedGaugeGradient)"
                  strokeWidth="10"
                  strokeDasharray={arcLength}
                  strokeDashoffset={arcOffset}
                  style={{ transition: 'stroke-dashoffset 0.4s var(--ease-smooth)' }}
                />
                <polygon
                  points="100,30 105,102 100,96 95,102"
                  fill="var(--cobalt)"
                  stroke="var(--fg)"
                  strokeWidth="1"
                  style={{ transformOrigin: '100px 100px', transform: `rotate(${needleRotation}deg)`, transition: 'transform 0.8s var(--ease-smooth)' }}
                />
                <rect x="94" y="94" width="12" height="12" fill="var(--cobalt)" stroke="var(--fg)" strokeWidth="2" />
                <defs>
                  <linearGradient id="speedGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style={{ stopColor: 'var(--cobalt)' }} />
                    <stop offset="100%" style={{ stopColor: 'var(--acid)' }} />
                  </linearGradient>
                </defs>
              </svg>

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
                <span style={{ fontFamily: 'Anton, sans-serif', fontSize: '32px', color: 'var(--fg)' }}>{gaugeSpeed.toFixed(1)}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', color: 'var(--muted)' }}>Mbps</span>
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{phaseLabel}</div>
            </div>

            <button type="button" className="btn-primary" onClick={runTest} disabled={isTesting}>
              {isTesting ? <Loader2 size={14} className="rotating-icon" /> : <Zap size={14} />}
              {isTesting ? 'Testing...' : 'Start Speed Test'}
            </button>

            <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${progress}%` }} /></div>

            <div style={{ border: '2px dashed var(--fg)', padding: '14px', marginTop: '16px' }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>How it works</div>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--fg)' }}>Download:</strong> Measures data arrival speed from Cloudflare's nearest edge location.<br />
                <strong style={{ color: 'var(--fg)' }}>Upload:</strong> Measures data sending speed to that same edge location.<br />
                <strong style={{ color: 'var(--fg)' }}>Ping:</strong> Measures round-trip latency to the edge.
              </p>
            </div>

            <button type="button" className="btn-mini" style={{ marginTop: '16px', alignSelf: 'flex-start' }} onClick={clearHistory}>Clear History</button>
          </div>

          <div className="panel-card">
            <div className="panel-head"><h2>Results</h2></div>

            <div className={`status-line ${errorMsg ? 'error' : ''}`} style={{ marginBottom: '16px' }}>
              <span>{errorMsg || statusLine}</span>
            </div>

            <div className="field-row">
              <div className="kpi-tile">
                <span className="num">{download ?? '—'}</span>
                <span className="label">Download Mbps</span>
              </div>
              <div className="kpi-tile">
                <span className="num">{upload ?? '—'}</span>
                <span className="label">Upload Mbps</span>
              </div>
              <div className="kpi-tile">
                <span className="num">{ping ?? '—'}</span>
                <span className="label">Ping ms</span>
              </div>
            </div>

            {quality && (
              <div style={{ border: '2px solid var(--fg)', padding: '14px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase' }}>Connection Quality</span>
                  <span className={`tool-chip ${quality.tier === 'excellent' ? 'accent' : ''}`}>{quality.label}</span>
                </div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6 }}>{quality.desc}</p>
              </div>
            )}

            <div className="panel-head" style={{ marginTop: '4px' }}><h2 style={{ fontSize: '13px' }}>Test History</h2></div>
            {history.length === 0 ? (
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
                No tests yet. Start a test to see results here.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {history.map((h, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < history.length - 1 ? '1px solid var(--muted)' : 'none' }}>
                    <div style={{ display: 'flex', gap: '14px', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ArrowDown size={12} /> {h.download ?? '—'}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ArrowUp size={12} /> {h.upload ?? '—'}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Radio size={12} /> {h.ping ?? '—'}ms</span>
                    </div>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--muted)' }}>{h.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </>
  )
}

export default SpeedTest
