import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UploadCloud, Link2, Copy, Check, RotateCcw, ArrowDownToLine, Info, AlertCircle, CheckCircle2, Plug, X } from 'lucide-react'
import CircularText from '../components/CircularText'
import Modal from '../components/Modal'
import { useFileShare, formatBytes, supportsFileSystemAccess, FALLBACK_MAX_SIZE } from '../hooks/useFileShare'

function FileShare() {
  const [mode, setMode] = useState('send')
  const [queuedFiles, setQueuedFiles] = useState([])
  const [codeInput, setCodeInput] = useState('')
  const [dragging, setDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const dragCounterRef = useRef(0)

  const { status, progress, roomCode, currentFileLabel, fileCountLabel, connectionState, createRoom, joinRoom, teardown, setStatus } = useFileShare()

  function addFiles(fileList) {
    const next = [...queuedFiles]
    for (const f of fileList) {
      if (!supportsFileSystemAccess && f.size > FALLBACK_MAX_SIZE) {
        setStatus(`"${f.name}" is over 1GB. This browser can't stream it directly to disk — try Chrome or Edge, or pick a smaller file.`, 'error')
        continue
      }
      next.push(f)
    }
    setQueuedFiles(next)
  }

  function removeFile(i) {
    setQueuedFiles(queuedFiles.filter((_, idx) => idx !== i))
  }

  function handleGenerateCode() {
    if (queuedFiles.length === 0) return
    createRoom(queuedFiles)
  }

  function handleResetSend() {
    setQueuedFiles([])
    teardown()
    setStatus('Add files, then generate a code to share.', 'idle')
  }

  function handleJoin() {
    const code = codeInput.trim()
    if (!/^\d{8}$/.test(code)) {
      setStatus('Enter the 8-digit code exactly as shared.', 'error')
      return
    }
    joinRoom(code)
  }

  function handleResetReceive() {
    setCodeInput('')
    teardown()
    setStatus('Enter a code to receive a file.', 'idle')
  }

  function switchMode(next) {
    if (next === mode) return
    teardown()
    setMode(next)
    setQueuedFiles([])
    setCodeInput('')
    setStatus(next === 'send' ? 'Add files, then generate a code to share.' : 'Enter a code to receive a file.', 'idle')
  }

  function copyCode() {
    if (!roomCode) return
    navigator.clipboard.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">DEV</span><span className="num">CATALOG NO. 0XX</span></div>
            <h1>File Share</h1>
            <p>
              Send files directly, browser to browser — nothing touches our servers, not one byte.{' '}
              <button type="button" className="info-btn" onClick={() => setShowInfo(true)}><Info size={13} /> How this works</button>
            </p>
            <div className="tool-chips">
              <span className="tool-chip accent">PEER-TO-PEER</span>
              <span className="tool-chip">ZERO STORAGE</span>
              <span className="tool-chip">WEBRTC</span>
            </div>
          </div>
          <CircularText text="P2P.SYS • WEBRTC ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>
        <div className="tool-workbench">
          <div className="panel-card">
            <div className="panel-head"><h2>Transfer</h2></div>

            <div className="mode-toggle" role="tablist" aria-label="Send or receive">
              <button type="button" className={`btn-mini ${mode === 'send' ? 'accent' : ''}`} aria-pressed={mode === 'send'} onClick={() => switchMode('send')}>
                <UploadCloud size={13} /> Send
              </button>
              <button type="button" className={`btn-mini ${mode === 'receive' ? 'accent' : ''}`} aria-pressed={mode === 'receive'} onClick={() => switchMode('receive')}>
                <ArrowDownToLine size={13} /> Receive
              </button>
            </div>

            {mode === 'send' ? (
              <>
                <div className="field" style={{ marginBottom: '14px' }}>
                  <label>Select files</label>
                  <div
                    className={`dropzone ${dragging ? 'drag' : ''}`}
                    onClick={() => document.getElementById('fsFileInput').click()}
                    onDragEnter={e => { e.preventDefault(); dragCounterRef.current += 1; setDragging(true) }}
                    onDragOver={e => e.preventDefault()}
                    onDragLeave={e => { e.preventDefault(); dragCounterRef.current -= 1; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragging(false) } }}
                    onDrop={e => { e.preventDefault(); dragCounterRef.current = 0; setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}
                    style={{ textAlign: 'center' }}
                  >
                    <div className="dropzone-content">
                      <div className="upload-icon-wrap"><UploadCloud size={28} /></div>
                      <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '16px', marginBottom: '6px' }}>Drag & drop files</div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)' }}>
                        or <span style={{ color: 'var(--cobalt)', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 700 }}>click to browse</span>
                      </div>
                      <div className="format-pills">
                        <span className="format-pill">ANY TYPE</span>
                        <span className="format-pill size">{supportsFileSystemAccess ? 'NO SIZE LIMIT' : '≤ 1GB'}</span>
                      </div>
                    </div>
                    <AnimatePresence>
                      {dragging && (
                        <motion.div className="drop-overlay" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
                          <div className="drop-overlay-icon"><ArrowDownToLine size={26} /></div>
                          <div className="drop-overlay-text">Drop to queue</div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <input id="fsFileInput" type="file" multiple hidden onChange={e => { if (e.target.files.length) addFiles(e.target.files); e.target.value = '' }} />
                  </div>
                </div>

                {queuedFiles.length > 0 && (
                  <div className="fs-file-queue">
                    {queuedFiles.map((f, i) => (
                      <div className="fs-queue-item" key={`${f.name}-${i}`}>
                        <span className="fs-qi-name">{f.name}</span>
                        <span className="fs-qi-size">{formatBytes(f.size)}</span>
                        {connectionState === 'idle' && (
                          <button type="button" className="fs-qi-remove" aria-label={`Remove ${f.name}`} onClick={() => removeFile(i)}><X size={12} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button type="button" className="btn-primary" onClick={handleGenerateCode} disabled={queuedFiles.length === 0 || connectionState !== 'idle'} style={{ marginTop: '16px' }}>
                  <Link2 size={16} /> {connectionState === 'idle' ? 'GENERATE CODE' : 'CODE GENERATED'}
                </button>
                <button type="button" className="btn-mini" onClick={handleResetSend} style={{ marginTop: '10px', width: '100%', justifyContent: 'center' }}>
                  <RotateCcw size={12} /> RESET
                </button>
              </>
            ) : (
              <>
                <div className="field" style={{ marginBottom: '10px' }}>
                  <label htmlFor="fsCodeInput">Enter code</label>
                  <input
                    id="fsCodeInput"
                    type="text"
                    className="code-input-lg"
                    placeholder="00000000"
                    maxLength={8}
                    inputMode="numeric"
                    autoComplete="off"
                    value={codeInput}
                    onChange={e => setCodeInput(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '16px' }}>
                  Chrome/Edge will ask for a download folder once. Pick or create a subfolder — Chrome blocks direct access to Downloads/Desktop/Documents themselves.
                </p>
                <button type="button" className="btn-primary" onClick={handleJoin} disabled={codeInput.length !== 8 || connectionState !== 'idle'}>
                  <Plug size={16} /> CONNECT
                </button>
                <button type="button" className="btn-mini" onClick={handleResetReceive} style={{ marginTop: '10px', width: '100%', justifyContent: 'center' }}>
                  <RotateCcw size={12} /> RESET
                </button>
              </>
            )}
          </div>

          <div className="panel-card">
            <div className="panel-head">
              <h2>Status</h2>
              <span className="tool-chip">{connectionState.toUpperCase()}</span>
            </div>

            <div className={`status-line ${status.type}`} style={{ marginBottom: '12px' }}>
              {status.type === 'error' && <AlertCircle size={14} />}
              {status.type === 'success' && <CheckCircle2 size={14} />}
              <span>{status.msg}</span>
            </div>

            <AnimatePresence>
              {roomCode && (
                <motion.div className="code-display-panel" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
                  <div className="code-display-label">Share this code</div>
                  <div className="code-display-value">{roomCode}</div>
                  <button type="button" className="btn-mini" onClick={copyCode}>
                    {copied ? <><Check size={12} /> COPIED</> : <><Copy size={12} /> COPY</>}
                  </button>
                  <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--muted)', marginTop: '10px' }}>Keep this tab open until the transfer finishes.</p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div>

            <div className="field-row" style={{ marginTop: '16px' }}>
              <div className="kpi-tile"><span className="num" style={{ fontSize: '13px' }}>{currentFileLabel}</span><span className="label">Current File</span></div>
              <div className="kpi-tile"><span className="num">{fileCountLabel}</span><span className="label">Files</span></div>
            </div>

            <div style={{ marginTop: '20px', padding: '14px 16px', border: '2px solid var(--fg)' }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>How It Works</div>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6 }}>
                <strong>Direct:</strong> Files stream browser-to-browser over an encrypted WebRTC channel.<br />
                <strong>Private:</strong> Our server only helps two browsers find each other — it never sees file contents.<br />
                <strong>Ephemeral:</strong> Close the sender's tab and the file is gone. No copies, anywhere.
              </p>
            </div>
          </div>
        </div>
      </main>

      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="How This Tool Works">
        <h4>Pipeline</h4>
        <ol>
          <li>The sender picks files and requests an 8-digit code from our signaling server.</li>
          <li>The receiver enters that code — our server introduces the two browsers by socket id only.</li>
          <li>The two browsers negotiate a direct <strong>WebRTC</strong> connection (with a TURN relay as fallback if a direct path isn't possible).</li>
          <li>File bytes stream straight through that encrypted peer-to-peer channel, in 64KB chunks, with backpressure to avoid overwhelming either side.</li>
          <li>Our server never sees file contents — only enough signaling data (offer/answer/ICE candidates) to make the introduction.</li>
        </ol>
        <p>Codes expire after 10 minutes if unused, and can only be claimed once.</p>
      </Modal>
    </>
  )
}

export default FileShare