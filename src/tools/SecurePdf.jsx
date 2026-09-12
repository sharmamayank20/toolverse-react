import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Eye, EyeOff, Check, X, Download, Loader2, CheckCircle2, AlertCircle, ArrowDownToLine, ShieldCheck } from 'lucide-react'
import CircularText from '../components/CircularText'
import '../utils/pdfWorker'
import { getDocument } from 'pdfjs-dist'
import { API_BASE } from '../config/api'
import { formatBytes } from '../utils/mergePdfHelpers'
import { MAX_FILE_BYTES, validateSecurePdfFile, computePasswordStrength } from '../utils/securePdfHelpers'

const STRENGTH_COLORS = ['var(--coral)', 'var(--coral)', 'var(--hl-bg)', 'var(--hl-bg)', 'var(--cobalt)']

function SecurePdf() {
  const [file, setFile] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [status, setStatus] = useState({ msg: 'Add a PDF to begin.', type: 'idle' })
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [securing, setSecuring] = useState(false)
  const [result, setResult] = useState(null) // { url, filename }

  const dragCounterRef = useRef(0)
  const fileInputRef = useRef(null)

  const strength = computePasswordStrength(password)
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword
  const canSecure = file && password.length >= 6 && passwordsMatch && !securing

  async function handleFile(f) {
    const check = validateSecurePdfFile(f)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }

    setStatus({ msg: 'Reading PDF...', type: 'loading' })
    setProgress(20)

    try {
      const buf = await f.arrayBuffer()
      const pdfDoc = await getDocument({ data: buf }).promise

      setFile(f)
      setPageCount(pdfDoc.numPages)
      setResult(null)

      setStatus({ msg: 'Ready. Enter a password to secure this PDF.', type: 'idle' })
      setProgress(0)
    } catch (err) {
      console.error('PDF load error:', err)
      setStatus({ msg: `That file couldn't be read as a PDF: ${err.message}`, type: 'error' })
      setProgress(0)
    }
  }

  function resetAll() {
    setFile(null)
    setPageCount(0)
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirm(false)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setStatus({ msg: 'Add a PDF to begin.', type: 'idle' })
    setProgress(0)
  }

  async function handleSecure() {
    const check = validateSecurePdfFile(file)
    if (!check.ok) { setStatus({ msg: check.msg, type: 'error' }); return }
    if (password.length < 6) { setStatus({ msg: 'Password must be at least 6 characters.', type: 'error' }); return }
    if (password !== confirmPassword) { setStatus({ msg: 'Passwords do not match.', type: 'error' }); return }

    setSecuring(true)
    setResult(null)
    setStatus({ msg: 'Preparing PDF...', type: 'loading' })
    setProgress(15)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('password', password)

      setStatus({ msg: 'Uploading to server...', type: 'loading' })
      setProgress(35)

      const response = await fetch(`${API_BASE}/api/secure-pdf`, { method: 'POST', body: formData })

      setStatus({ msg: 'Encrypting PDF...', type: 'loading' })
      setProgress(65)

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Server error: ${response.status}`)
      }

      setStatus({ msg: 'Preparing download...', type: 'loading' })
      setProgress(85)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const base = (file.name || 'document.pdf').replace(/\.pdf$/i, '') || 'document'
      const filename = `${base}-secured.pdf`

      setProgress(100)
      setStatus({ msg: 'PDF secured successfully!', type: 'success' })
      setResult({ url, filename })

      const tempLink = document.createElement('a')
      tempLink.href = url
      tempLink.download = filename
      tempLink.click()
    } catch (err) {
      console.error('Secure failed:', err)
      setStatus({ msg: `Error: ${err.message}`, type: 'error' })
      setProgress(0)
    } finally {
      setSecuring(false)
    }
  }

  function handleDownload() {
    if (!result) return
    const a = document.createElement('a')
    a.href = result.url
    a.download = result.filename
    a.click()
  }

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">PDF</span><span className="num">CATALOG NO. 105</span></div>
            <h1>Secure PDF</h1>
            <p>Add password protection to your PDF documents with strong encryption.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">SERVER-SIDE</span>
              <span className="tool-chip">UP TO 20MB</span>
            </div>
          </div>
          <CircularText text="SECURE.SYS • PDF ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>

        {!file ? (
          <div className="upload-stage" style={{ maxWidth: '620px', margin: '0 auto' }}>
            <div
              className={`dropzone ${dragging ? 'drag' : ''}`}
              onClick={() => { if (status.type !== 'loading') fileInputRef.current?.click() }}
              onDragEnter={e => { e.preventDefault(); if (status.type === 'loading') return; dragCounterRef.current += 1; setDragging(true) }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={e => { e.preventDefault(); dragCounterRef.current -= 1; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragging(false) } }}
              onDrop={e => { e.preventDefault(); dragCounterRef.current = 0; setDragging(false); if (status.type === 'loading') return; if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
              style={{ textAlign: 'center' }}
            >
              {status.type === 'loading' ? (
                <div className="dropzone-loading">
                  <Loader2 size={32} className="rotating-icon" />
                  <div className="dropzone-loading-text">{status.msg}</div>
                </div>
              ) : (
                <div className="dropzone-content">
                  <div className="upload-icon-wrap"><Lock size={28} /></div>
                  <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', marginBottom: '6px' }}>Drag & drop a PDF</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)' }}>
                    or <span style={{ color: 'var(--cobalt)', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 700 }}>click to browse</span>
                  </div>
                  <div className="format-pills">
                    <span className="format-pill">PDF</span>
                    <span className="format-pill size">≤ {formatBytes(MAX_FILE_BYTES)}</span>
                  </div>
                </div>
              )}
              <AnimatePresence>
                {dragging && (
                  <motion.div className="drop-overlay" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
                    <div className="drop-overlay-icon"><ArrowDownToLine size={26} /></div>
                    <div className="drop-overlay-text">Drop to load</div>
                  </motion.div>
                )}
              </AnimatePresence>
              <input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
            </div>
            <div className="privacy-badge">
              <ShieldCheck size={22} />
              <span>Your password is sent securely and never stored. Files are deleted from the server within 15 minutes.</span>
            </div>
          </div>
        ) : (
          <div className="tool-workbench">
            <div className="panel-card">
              <div className="panel-head">
                <h2>Input</h2>
                <button type="button" className="btn-mini" onClick={resetAll}>CHANGE PDF</button>
              </div>

              <div className="secpdf-file-summary">
                <div className="secpdf-file-name">{file.name}</div>
                <div className="secpdf-file-meta">
                  <span>{formatBytes(file.size)}</span>
                  <span className="dot">•</span>
                  <span>{pageCount} page{pageCount === 1 ? '' : 's'}</span>
                </div>
              </div>

              <div className="field" style={{ marginBottom: '8px' }}>
                <label>Password</label>
                <div className="secpdf-password-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter strong password"
                  />
                  <button type="button" className="btn-mini mpdf-icon-btn secpdf-eye-btn" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(v => !v)}>
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="secpdf-strength">
                    <div className="secpdf-strength-bar">
                      <div className="secpdf-strength-fill" style={{ width: `${(strength.score / 4) * 100}%`, background: STRENGTH_COLORS[strength.score] }}></div>
                    </div>
                    <span className="secpdf-strength-label">{strength.label}</span>
                  </div>
                )}
                <p className="whisper-line">Use a strong password with letters, numbers, and symbols. Minimum 6 characters.</p>
              </div>

              <div className="field" style={{ marginBottom: '16px' }}>
                <label>Confirm Password</label>
                <div className="secpdf-password-wrap">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                  />
                  <button type="button" className="btn-mini mpdf-icon-btn secpdf-eye-btn" aria-label={showConfirm ? 'Hide password' : 'Show password'} onClick={() => setShowConfirm(v => !v)}>
                    {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {confirmPassword.length > 0 && (
                  <div className={`secpdf-match ${passwordsMatch ? 'ok' : 'error'}`}>
                    {passwordsMatch ? <Check size={13} /> : <X size={13} />}
                    <span>{passwordsMatch ? 'Passwords match' : 'Passwords do not match'}</span>
                  </div>
                )}
              </div>

              <button type="button" className="btn-primary" onClick={handleSecure} disabled={!canSecure}>
                {securing ? 'SECURING...' : 'Secure PDF'}
              </button>
            </div>

            <div className="panel-card">
              <div className="panel-head"><h2>Status</h2></div>

              <div className={`status-line ${status.type}`} style={{ marginBottom: '10px' }}>
                {status.type === 'loading' && <Loader2 size={14} className="rotating-icon" />}
                {status.type === 'success' && <CheckCircle2 size={14} />}
                {status.type === 'error' && <AlertCircle size={14} />}
                <span>{status.msg}</span>
              </div>
              <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div>

              <div className="privacy-badge" style={{ marginTop: '20px' }}>
                <ShieldCheck size={20} />
                <span>Anyone with the password can open this PDF. Keep it safe — it can't be recovered if lost.</span>
              </div>

              {result && (
                <button type="button" className="btn-primary" style={{ marginTop: '16px' }} onClick={handleDownload}>
                  <Download size={16} /> Download secured PDF
                </button>
              )}
            </div>
          </div>
        )}

      </main>
    </>
  )
}

export default SecurePdf