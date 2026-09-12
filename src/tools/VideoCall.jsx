import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Video, VideoOff, Mic, MicOff, PhoneOff, Copy, Check, Plug, Info, AlertCircle, CheckCircle2, User } from 'lucide-react'
import CircularText from '../components/CircularText'
import Modal from '../components/Modal'
import { useVideoCall } from '../hooks/useVideoCall'

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const s = (totalSeconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function VideoCall() {
  const [mode, setMode] = useState('start')
  const [codeInput, setCodeInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  const {
    status, roomCode, connectionState, micOn, camOn, remoteCamOn, callSeconds, remoteName,
    localVideoRef, remoteVideoRef, startCall, answerCall, toggleMic, toggleCam, teardown
  } = useVideoCall()

  const inCall = connectionState !== 'idle'

  function switchMode(next) {
    if (next === mode || inCall) return
    setMode(next)
    setCodeInput('')
  }

  function handleJoin() {
    const code = codeInput.trim()
    if (!/^\d{8}$/.test(code)) return
    answerCall(code, nameInput.trim() || null)
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
            <h1>Video Call</h1>
            <p>
              Face-to-face calls, browser to browser — encrypted, peer-to-peer, camera off by default.{' '}
              <button type="button" className="info-btn" onClick={() => setShowInfo(true)}><Info size={13} /> How this works</button>
            </p>
            <div className="tool-chips">
              <span className="tool-chip accent">PEER-TO-PEER</span>
              <span className="tool-chip">CAMERA OFF BY DEFAULT</span>
              <span className="tool-chip">AUTO-RECONNECT</span>
            </div>
          </div>
          <CircularText text="VIDEO.SYS • P2P CALLING • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '620px', margin: '0 auto', padding: '44px 20px 100px' }}>
        <div className="panel-card">
          <div className="panel-head">
            <h2>Call</h2>
            <span className="tool-chip">{connectionState.toUpperCase()}</span>
          </div>

          {!inCall && (
            <div className="mode-toggle" role="tablist" aria-label="Start or join a call">
              <button type="button" className={`btn-mini ${mode === 'start' ? 'accent' : ''}`} aria-pressed={mode === 'start'} onClick={() => switchMode('start')}>
                <Video size={13} /> Start Call
              </button>
              <button type="button" className={`btn-mini ${mode === 'join' ? 'accent' : ''}`} aria-pressed={mode === 'join'} onClick={() => switchMode('join')}>
                <Plug size={13} /> Join Call
              </button>
            </div>
          )}

          {!inCall && (
            <div className="field" style={{ marginBottom: '14px' }}>
              <label htmlFor="videoNameInput">Your name (optional)</label>
              <input
                id="videoNameInput"
                type="text"
                placeholder="e.g. Mayank"
                maxLength={40}
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
              />
            </div>
          )}

          <div className={`status-line ${status.type}`} style={{ marginBottom: '14px' }}>
            {status.type === 'error' && <AlertCircle size={14} />}
            {status.type === 'success' && <CheckCircle2 size={14} />}
            <span>{status.msg}</span>
          </div>

          <AnimatePresence>
            {roomCode && connectionState === 'waiting' && (
              <motion.div className="code-display-panel" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
                <div className="code-display-label">Share this code</div>
                <div className="code-display-value">{roomCode}</div>
                <button type="button" className="btn-mini" onClick={copyCode}>
                  {copied ? <><Check size={12} /> COPIED</> : <><Copy size={12} /> COPY</>}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {!inCall && mode === 'start' && (
            <button type="button" className="btn-primary" onClick={() => startCall(nameInput.trim() || null)}>
              <Video size={16} /> START CALL
            </button>
          )}

          {!inCall && mode === 'join' && (
            <>
              <div className="field" style={{ marginBottom: '14px' }}>
                <label htmlFor="videoCodeInput">Enter code</label>
                <input
                  id="videoCodeInput"
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
              <button type="button" className="btn-primary" onClick={handleJoin} disabled={codeInput.length !== 8}>
                <Plug size={16} /> JOIN CALL
              </button>
            </>
          )}

          {inCall && (
            <>
              <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
                {remoteName ? `In call with ${remoteName}` : 'In call'}
              </div>

              <div className={`video-stage ${!remoteCamOn ? 'cam-off' : ''}`}>
                <video ref={remoteVideoRef} autoPlay playsInline />
                {!remoteCamOn && (
                  <div className="video-placeholder">
                    <div className="video-placeholder-icon"><User size={28} /></div>
                    <div className="video-placeholder-label">{remoteName ? `${remoteName}'s camera is off` : 'Camera is off'}</div>
                  </div>
                )}

                <div className={`local-video-pip ${!camOn ? 'cam-off' : ''}`}>
                  <video ref={localVideoRef} autoPlay playsInline muted />
                  {!camOn && <User size={18} color="var(--badge-paper)" />}
                </div>
              </div>

              <div className="call-timer">{formatDuration(callSeconds)}</div>
              <div className="call-controls">
                <button type="button" className={`call-control-btn ${!micOn ? 'muted' : ''}`} onClick={toggleMic} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'} aria-pressed={!micOn}>
                  {micOn ? <Mic size={22} /> : <MicOff size={22} />}
                </button>
                <button type="button" className={`call-control-btn ${!camOn ? 'muted' : ''}`} onClick={toggleCam} aria-label={camOn ? 'Turn camera off' : 'Turn camera on'} aria-pressed={!camOn}>
                  {camOn ? <Video size={22} /> : <VideoOff size={22} />}
                </button>
                <button type="button" className="call-control-btn hang-up" onClick={() => teardown()} aria-label="Hang up">
                  <PhoneOff size={22} />
                </button>
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: '20px', padding: '14px 16px', border: '2px solid var(--fg)' }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>How It Works</div>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6 }}>
            <strong>Direct:</strong> Audio and video stream browser-to-browser over an encrypted WebRTC channel.<br />
            <strong>Private:</strong> Our server only helps two browsers find each other — it never sees the call.<br />
            <strong>Camera-first-off:</strong> Your camera stays off until you turn it on, every time.
          </p>
        </div>
      </main>

      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="How This Tool Works">
        <h4>Pipeline</h4>
        <ol>
          <li>One person starts a call and gets an 8-digit code from our signaling server.</li>
          <li>The other person enters that code — our server introduces the two browsers by socket id only.</li>
          <li>The two browsers negotiate a direct <strong>WebRTC</strong> audio + video connection (relayed through an encrypted TURN server over port 443 if a direct path isn't possible).</li>
          <li>Your camera starts off by default every time — you choose when to turn it on, per call.</li>
          <li>If the connection drops, it automatically attempts to reconnect without ending the call.</li>
        </ol>
        <p>Nothing about the call is stored anywhere — codes expire after 10 minutes if unused.</p>
      </Modal>
    </>
  )
}

export default VideoCall