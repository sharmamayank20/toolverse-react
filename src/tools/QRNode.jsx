import { useState, useRef, useEffect, useCallback } from 'react'
import QRCodeStyling from 'qr-code-styling'
import CircularText from '../components/CircularText'
import { jsPDF } from 'jspdf'
import { Download, Infinity as InfinityIcon, CheckCircle2, Eye, X, AlertCircle, RotateCcw, ArrowLeftRight, Copy } from 'lucide-react'

// Both lists are restricted to values qr-code-styling actually recognizes.
// The legacy version offered "circle"/"diamond" for eye style, which aren't
// real library values — it silently fell back to a plain square for both,
// which is why those options looked like they did nothing.
const DOT_STYLE_OPTIONS = [
  { value: 'square', label: 'Square' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'dots', label: 'Dots' },
]
const EYE_FRAME_OPTIONS = [
  { value: 'square', label: 'Square' },
  { value: 'dot', label: 'Dot' },
  { value: 'extra-rounded', label: 'Extra Rounded' },
  { value: 'rounded', label: 'Rounded' },
]
const EYE_BALL_OPTIONS = [
  { value: 'square', label: 'Square' },
  { value: 'dot', label: 'Dot' },
  { value: 'extra-rounded', label: 'Extra Rounded' },
  { value: 'rounded', label: 'Rounded' },
]

// Small representative previews so the picker shows the actual shape instead
// of just a text label — these are simplified (a real QR's rounded/dots
// styling depends on neighboring modules), but accurately convey the shape
// family so picking one isn't a guess. Uses currentColor so it follows the
// button's own text color (dark when unpressed, light when pressed).
function DotStylePreview({ style }) {
  const cells = [0, 1, 2].flatMap(row => [0, 1, 2].map(col => ({ row, col })))
  return (
    <svg width="28" height="28" viewBox="0 0 21 21">
      {cells.map(({ row, col }) => {
        const x = col * 7, y = row * 7
        if (style === 'dots') return <circle key={`${row}-${col}`} cx={x + 3.5} cy={y + 3.5} r="2.6" fill="currentColor" />
        if (style === 'rounded') return <rect key={`${row}-${col}`} x={x + 0.6} y={y + 0.6} width="5.8" height="5.8" rx="1.8" fill="currentColor" />
        return <rect key={`${row}-${col}`} x={x + 0.6} y={y + 0.6} width="5.8" height="5.8" fill="currentColor" />
      })}
    </svg>
  )
}

function EyeFramePreview({ style }) {
  const rx = style === 'extra-rounded' ? 7 : style === 'rounded' ? 3.5 : 0
  if (style === 'dot') return <svg width="28" height="28" viewBox="0 0 21 21"><circle cx="10.5" cy="10.5" r="9" fill="none" stroke="currentColor" strokeWidth="2.6" /></svg>
  return <svg width="28" height="28" viewBox="0 0 21 21"><rect x="1.3" y="1.3" width="18.4" height="18.4" rx={rx} fill="none" stroke="currentColor" strokeWidth="2.6" /></svg>
}

function EyeBallPreview({ style }) {
  const rx = style === 'extra-rounded' ? 4 : style === 'rounded' ? 2 : 0
  if (style === 'dot') return <svg width="28" height="28" viewBox="0 0 21 21"><circle cx="10.5" cy="10.5" r="7" fill="currentColor" /></svg>
  return <svg width="28" height="28" viewBox="0 0 21 21"><rect x="3.5" y="3.5" width="14" height="14" rx={rx} fill="currentColor" /></svg>
}

const COLOR_SWATCHES = ['#0D0D0F', '#2440FF', '#FF4B3E', '#E8FF3D', '#0F9D58', '#F7F7F2']

// Purely informational — never restricts what the user can type, just gives
// a quick visual confirmation that e.g. a phone number will scan as a phone
// number and not get read as plain text.
function detectContentType(value) {
  const v = value.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return 'URL'
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'EMAIL'
  if (/^\+?[0-9][0-9\s\-()]{6,}$/.test(v)) return 'PHONE'
  if (/^wifi:/i.test(v)) return 'WI-FI'
  return 'TEXT'
}

function QRNode() {
  const qrContainerRef = useRef(null)
  const qrInstanceRef = useRef(null)

  const [text, setText] = useState('')
  const [size, setSize] = useState(200) // on-screen preview size only — does not affect download resolution
  const [errorCorrection, setErrorCorrection] = useState('M')
  const [fgColor, setFgColor] = useState('#2440FF')
  const [bgColor, setBgColor] = useState('#F7F7F2')
  const [transparentBg, setTransparentBg] = useState(false)
  const [dotStyle, setDotStyle] = useState('square')
  const [eyeFrameStyle, setEyeFrameStyle] = useState('square')
  const [eyeBallStyle, setEyeBallStyle] = useState('square')
  const [logoDataUrl, setLogoDataUrl] = useState(null)
  const [logoFileName, setLogoFileName] = useState(null)
  const [downloadFormat, setDownloadFormat] = useState('png')
  const [exportQuality, setExportQuality] = useState('hd') // 'hd' | '4k' — downloads are always high-res, regardless of preview size
  const [status, setStatus] = useState(null) // { msg, type: 'error' | 'success' }
  const logoInputRef = useRef(null)

  const EXPORT_RESOLUTIONS = { hd: 1080, '4k': 2160 }

  // Single source of truth for QR styling options, parameterized only by
  // target pixel size — used for both the live preview AND downloads, so
  // they can never drift out of sync with each other.
  function buildQrConfig(targetSize, dataOverride) {
    return {
      width: targetSize, height: targetSize,
      data: dataOverride !== undefined ? dataOverride : text,
      image: logoDataUrl || '',
      dotsOptions: { color: fgColor, type: dotStyle },
      backgroundOptions: { color: transparentBg ? 'transparent' : bgColor },
      cornersSquareOptions: { type: eyeFrameStyle, color: fgColor },
      cornersDotOptions: { type: eyeBallStyle, color: fgColor },
      imageOptions: { crossOrigin: 'anonymous', margin: 5, imageSize: 0.15 },
      qrOptions: { errorCorrectionLevel: errorCorrection },
    }
  }

  // create the QR instance once
  useEffect(() => {
    qrInstanceRef.current = new QRCodeStyling(buildQrConfig(size, ''))
    qrInstanceRef.current.append(qrContainerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // update it whenever any setting changes
  useEffect(() => {
    if (!qrInstanceRef.current) return
    qrInstanceRef.current.update(buildQrConfig(size))
  }, [text, size, errorCorrection, fgColor, bgColor, transparentBg, dotStyle, eyeFrameStyle, eyeBallStyle, logoDataUrl])

  function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setStatus({ msg: 'Logo must be an image file.', type: 'error' })
      if (logoInputRef.current) logoInputRef.current.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus({ msg: 'Logo image exceeds 5 MB.', type: 'error' })
      if (logoInputRef.current) logoInputRef.current.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = ev => { setLogoDataUrl(ev.target.result); setLogoFileName(file.name); setStatus(null) }
    reader.readAsDataURL(file)
  }

  function handleRemoveLogo() {
    setLogoDataUrl(null)
    setLogoFileName(null)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  const triggerDownload = useCallback((url, filename) => {
    const a = document.createElement('a')
    a.href = url; a.download = filename
    a.click()
  }, [])

  async function handleDownload() {
    if (!text.trim()) {
      setStatus({ msg: 'Enter some text or a URL before downloading.', type: 'error' })
      return
    }
    // Downloads always render from a fresh, dedicated instance at a proper
    // print resolution (1080px "HD" or 2160px "4K") — never from the small
    // on-screen preview instance. That's what fixes the blur: the preview's
    // "Size" slider is purely a display convenience and no longer has any
    // bearing on what actually gets exported.
    const exportSize = EXPORT_RESOLUTIONS[exportQuality] || EXPORT_RESOLUTIONS.hd
    const qr = new QRCodeStyling(buildQrConfig(exportSize))
    try {
      if (downloadFormat === 'png') {
        const blob = await qr.getRawData('png')
        const url = URL.createObjectURL(blob)
        triggerDownload(url, 'qr_code.png')
        URL.revokeObjectURL(url)
      } else if (downloadFormat === 'jpg') {
        const pngBlob = await qr.getRawData('png')
        const pngUrl = URL.createObjectURL(pngBlob)
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.width; canvas.height = img.height
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0)
          canvas.toBlob(jpgBlob => {
            const jpgUrl = URL.createObjectURL(jpgBlob)
            triggerDownload(jpgUrl, 'qr_code.jpg')
            URL.revokeObjectURL(jpgUrl)
            URL.revokeObjectURL(pngUrl)
          }, 'image/jpeg', 0.92)
        }
        img.src = pngUrl
      } else if (downloadFormat === 'svg') {
        const svg = await qr.getRawData('svg')
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        triggerDownload(url, 'qr_code.svg')
        URL.revokeObjectURL(url)
      } else if (downloadFormat === 'pdf') {
        const pngBlob = await qr.getRawData('png')
        const reader = new FileReader()
        reader.onload = ev => {
          // Physical page/image size is now a fixed, sensible print size
          // (3x3 inches) — decoupled from both the preview slider and the
          // export pixel resolution. The old version tied the PDF's page
          // size in points directly to the pixel slider, so a small preview
          // size produced a tiny printed page no matter how sharp the image
          // data was. High pixel resolution embedded in a fixed physical
          // size is what actually gets you print quality.
          const PDF_SIZE_PT = 216 // 3 inches at 72pt/inch
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [PDF_SIZE_PT, PDF_SIZE_PT] })
          pdf.addImage(ev.target.result, 'PNG', 0, 0, PDF_SIZE_PT, PDF_SIZE_PT)
          pdf.save('qr_code.pdf')
        }
        reader.readAsDataURL(pngBlob)
      }
      setStatus({ msg: `Downloaded as ${downloadFormat.toUpperCase()} (${exportQuality.toUpperCase()}).`, type: 'success' })
    } catch (err) {
      console.error('QR download failed:', err)
      setStatus({ msg: 'Download failed. Please try again.', type: 'error' })
    }
  }

  function handleSwapColors() {
    setFgColor(bgColor)
    setBgColor(fgColor)
  }

  const clipboardSupported = typeof window !== 'undefined' && !!navigator.clipboard?.write && typeof window.ClipboardItem !== 'undefined'

  async function handleCopyImage() {
    if (!text.trim()) {
      setStatus({ msg: 'Enter some text or a URL first.', type: 'error' })
      return
    }
    try {
      const exportSize = EXPORT_RESOLUTIONS[exportQuality] || EXPORT_RESOLUTIONS.hd
      const qr = new QRCodeStyling(buildQrConfig(exportSize))
      const blob = await qr.getRawData('png')
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
      setStatus({ msg: 'Copied QR code to clipboard.', type: 'success' })
    } catch (err) {
      console.error('Copy to clipboard failed:', err)
      setStatus({ msg: 'Could not copy — try downloading instead.', type: 'error' })
    }
  }

  function handleResetSettings() {
    setSize(200); setErrorCorrection('M')
    setFgColor('#2440FF'); setBgColor('#F7F7F2'); setTransparentBg(false)
    setDotStyle('square'); setEyeFrameStyle('square'); setEyeBallStyle('square')
    setDownloadFormat('png'); setExportQuality('hd')
    handleRemoveLogo()
    setStatus(null)
  }

  return (
    <>
      <div className="tool-header">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
        <div>
        <div className="tool-crumb"><span className="cat">DEV</span><span className="num">CATALOG NO. 002</span></div>
          <h1>QRNode</h1>
          <p>Customize your QR code with colors, shapes, and a logo — download in PNG, JPG, SVG, or PDF.</p>
        <div className="tool-chips">
        <span className="tool-chip accent">CLIENT-SIDE</span>
        <span className="tool-chip">4 FORMATS</span>
      </div>
      </div>
    <CircularText text="QRNODE.SYS • 4 FORMATS • " spinDuration={18} onHover="speedUp" />
  </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>
        <div className="tool-workbench">

          <div className="panel-card">
            <div className="panel-head"><h2>Settings</h2></div>

            <div className="field" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ marginBottom: 0 }}>Text or URL</label>
                {detectContentType(text) && <span className="tool-chip">{detectContentType(text)}</span>}
              </div>
              <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="Enter text or URL" />
            </div>

            <div className="field-row">
              <div className="field">
                <label>Preview Size: {size}px</label>
                <input type="range" min="100" max="500" value={size} onChange={e => setSize(+e.target.value)} />
              </div>
              <div className="field">
                <label>Error Correction</label>
                <select value={errorCorrection} onChange={e => setErrorCorrection(e.target.value)}>
                  <option value="L">L (Low)</option><option value="M">M</option><option value="Q">Q</option><option value="H">H (High)</option>
                </select>
              </div>
            </div>

            <div className="field" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ marginBottom: 0 }}>Colors</label>
                <button type="button" className="btn-mini" onClick={handleSwapColors} title="Swap foreground and background"><ArrowLeftRight size={12} /> SWAP</button>
              </div>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase' }}>Foreground</div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {COLOR_SWATCHES.map(c => (
                      <button key={c} type="button" className={`qrnode-swatch ${fgColor.toLowerCase() === c.toLowerCase() ? 'active' : ''}`} style={{ background: c }} onClick={() => setFgColor(c)} aria-label={`Set foreground to ${c}`} aria-pressed={fgColor.toLowerCase() === c.toLowerCase()} />
                    ))}
                    <div className="color-input-wrap"><input type="color" value={fgColor} onChange={e => setFgColor(e.target.value)} aria-label="Custom foreground color" /></div>
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase' }}>Background</div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {COLOR_SWATCHES.map(c => (
                      <button key={c} type="button" className={`qrnode-swatch ${bgColor.toLowerCase() === c.toLowerCase() ? 'active' : ''}`} style={{ background: c }} onClick={() => setBgColor(c)} disabled={transparentBg} aria-label={`Set background to ${c}`} aria-pressed={bgColor.toLowerCase() === c.toLowerCase()} />
                    ))}
                    <div className="color-input-wrap"><input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} disabled={transparentBg} aria-label="Custom background color" /></div>
                  </div>
                </div>
              </div>
            </div>

            <label className="toggle-switch" style={{ marginBottom: '16px' }}>
              <input type="checkbox" checked={transparentBg} onChange={e => setTransparentBg(e.target.checked)} />
              <span className="track"></span>Transparent Background
            </label>

            <div className="field" style={{ marginBottom: '16px' }}>
              <label>Dot Style</label>
              <div className="qrnode-style-row">
                {DOT_STYLE_OPTIONS.map(o => (
                  <button
                    key={o.value} type="button" title={o.label} aria-label={o.label} aria-pressed={dotStyle === o.value}
                    className={`qrnode-style-btn ${dotStyle === o.value ? 'active' : ''}`}
                    onClick={() => setDotStyle(o.value)}
                  >
                    <DotStylePreview style={o.value} />
                    <span>{o.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Eye Frame</label>
                <div className="qrnode-style-row">
                  {EYE_FRAME_OPTIONS.map(o => (
                    <button
                      key={o.value} type="button" title={o.label} aria-label={o.label} aria-pressed={eyeFrameStyle === o.value}
                      className={`qrnode-style-btn ${eyeFrameStyle === o.value ? 'active' : ''}`}
                      onClick={() => setEyeFrameStyle(o.value)}
                    >
                      <EyeFramePreview style={o.value} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Eye Ball</label>
                <div className="qrnode-style-row">
                  {EYE_BALL_OPTIONS.map(o => (
                    <button
                      key={o.value} type="button" title={o.label} aria-label={o.label} aria-pressed={eyeBallStyle === o.value}
                      className={`qrnode-style-btn ${eyeBallStyle === o.value ? 'active' : ''}`}
                      onClick={() => setEyeBallStyle(o.value)}
                    >
                      <EyeBallPreview style={o.value} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="field" style={{ marginBottom: '16px' }}>
              <label>Logo (Center)</label>
              {logoDataUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '2px solid var(--fg)', padding: '8px', background: 'var(--bg)' }}>
                  <img src={logoDataUrl} alt="Logo" style={{ width: '32px', height: '32px', objectFit: 'contain', border: '2px solid var(--fg)' }} />
                  <span style={{ flex: 1, minWidth: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{logoFileName}</span>
                  <button type="button" className="btn-mini" onClick={handleRemoveLogo}><X size={12} /> REMOVE</button>
                </div>
              ) : (
                <div className="file-input-wrap">
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoChange} />
                </div>
              )}
            </div>

            <div className="field-row">
              <div className="field">
                <label>Download Format</label>
                <select value={downloadFormat} onChange={e => setDownloadFormat(e.target.value)}>
                  <option value="png">PNG</option><option value="jpg">JPG</option><option value="svg">SVG</option><option value="pdf">PDF</option>
                </select>
              </div>
              <div className="field">
                <label>Export Quality</label>
                <select value={exportQuality} onChange={e => setExportQuality(e.target.value)}>
                  <option value="hd">HD (1080px)</option>
                  <option value="4k">4K (2160px)</option>
                </select>
              </div>
            </div>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: 'var(--muted)', marginTop: '-8px', marginBottom: '16px' }}>
              Downloads always render at full resolution, regardless of preview size — safe to print at any reasonable size. SVG is vector-based and sharp at any scale either way.
            </p>

            <button type="button" className="btn-primary" onClick={handleDownload}><Download size={16} /> DOWNLOAD</button>

            {clipboardSupported && (
              <button type="button" className="btn-mini" style={{ marginTop: '10px' }} onClick={handleCopyImage}>
                <Copy size={13} /> COPY IMAGE TO CLIPBOARD
              </button>
            )}

            {status && (
              <div className={`status-line ${status.type}`} style={{ marginTop: '12px' }}>
                {status.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                <span>{status.msg}</span>
              </div>
            )}

            <button type="button" className="btn-mini" style={{ marginTop: '16px', alignSelf: 'flex-start' }} onClick={handleResetSettings}>
              <RotateCcw size={13} /> RESET ALL SETTINGS
            </button>
          </div>

          <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="panel-head" style={{ width: '100%' }}><h2>Preview</h2></div>
            <div className="qr-preview-wrap" style={{ position: 'relative' }}>
              <div ref={qrContainerRef}></div>
              {!text.trim() && (
                <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)', textAlign: 'center', padding: '20px' }}>
                  Enter text or a URL to generate your QR code.
                </p>
              )}
            </div>

            <div className="field-row" style={{ width: '100%', marginTop: '20px' }}>
              <div className="kpi-tile"><span className="num"><InfinityIcon size={20} style={{ margin: '0 auto' }} /></span><span className="label">Styles</span></div>
              <div className="kpi-tile"><span className="num">4</span><span className="label">Formats</span></div>
              <div className="kpi-tile"><span className="num"><CheckCircle2 size={20} style={{ margin: '0 auto' }} /></span><span className="label">Branding</span></div>
              <div className="kpi-tile"><span className="num"><Eye size={20} style={{ margin: '0 auto' }} /></span><span className="label">Live Preview</span></div>
            </div>
          </div>

        </div>
      </main>
    </>
  )
}

export default QRNode