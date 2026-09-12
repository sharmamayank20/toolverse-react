import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Plug, Copy, Check, Info, AlertCircle, LogOut, Paperclip, Send, FileIcon, Download, Users } from 'lucide-react'
import CircularText from '../components/CircularText'
import Modal from '../components/Modal'
import { useChatRoom, formatBytes, MAX_CHAT_FILE_SIZE } from '../hooks/useChatRoom'

const PALETTE = [
  { bg: 'var(--cobalt)', fg: 'var(--badge-paper)' },
  { bg: 'var(--coral)', fg: 'var(--badge-paper)' },
  { bg: 'var(--acid)', fg: 'var(--badge-ink)' },
]
function paletteFor(id) {
  if (!id) return { bg: 'var(--panel)', fg: 'var(--fg)' }
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % PALETTE.length
  return PALETTE[hash]
}
function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function MessageBubble({ msg }) {
  const own = msg.from === 'me'
  const palette = paletteFor(msg.from)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={`chat-bubble-row ${own ? 'own' : ''}`}
    >
      <div className="chat-bubble">
        {!own && <div className="chat-bubble-name" style={{ color: palette.bg }}>{msg.name}</div>}

        {msg.type === 'text' ? (
          <div className="chat-bubble-content">{msg.text}</div>
        ) : (
          <div className="chat-file-bubble">
            <div className="chat-file-icon"><FileIcon size={16} /></div>
            <div className="chat-file-info">
              <div className="chat-file-name">{msg.fileName}</div>
              <div className="chat-file-size">{formatBytes(msg.fileSize)}</div>
              {!msg.done && (
                <div className="chat-file-progress"><div className="chat-file-progress-fill" style={{ width: `${msg.progress}%` }} /></div>
              )}
            </div>
            {msg.done && (
              <a className="chat-file-download" href={msg.blobUrl} download={msg.fileName} aria-label={`Download ${msg.fileName}`}>
                <Download size={18} />
              </a>
            )}
          </div>
        )}

        <div className="chat-bubble-time">{formatTime(msg.ts)}</div>
      </div>
    </motion.div>
  )
}

function ChatRoom() {
  const [mode, setMode] = useState('create')
  const [nameInput, setNameInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [textInput, setTextInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  const { status, roomCode, connectionState, members, messages, createRoom, joinRoom, sendText, sendFile, leaveRoom } = useChatRoom()

  const scrollRef = useRef(null)
  const fileInputRef = useRef(null)
  const inRoom = connectionState === 'in-room'

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  function handleCreate() {
    createRoom(nameInput.trim() || null)
  }
  function handleJoin() {
    const code = codeInput.trim()
    if (!/^\d{8}$/.test(code)) return
    joinRoom(code, nameInput.trim() || null)
  }
  function copyCode() {
    if (!roomCode) return
    navigator.clipboard.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  function handleSend() {
    if (!textInput.trim()) return
    sendText(textInput)
    setTextInput('')
  }
  function handleAttach(e) {
    const file = e.target.files?.[0]
    if (file) sendFile(file)
    e.target.value = ''
  }

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">DEV</span><span className="num">CATALOG NO. 0XX</span></div>
            <h1>Chat Room</h1>
            <p>
              Anonymous group chat, up to 4 people — encrypted, peer-to-peer, nothing ever stored.{' '}
              <button type="button" className="info-btn" onClick={() => setShowInfo(true)}><Info size={13} /> How this works</button>
            </p>
            <div className="tool-chips">
              <span className="tool-chip accent">PEER-TO-PEER</span>
              <span className="tool-chip">UP TO 4 PEOPLE</span>
              <span className="tool-chip">FILE SHARING</span>
            </div>
          </div>
          <CircularText text="CHAT.SYS • P2P MESH • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '44px 20px 100px' }}>
        {!inRoom ? (
          <div className="panel-card">
            <div className="panel-head"><h2>Join or Create</h2></div>

            <div className="mode-toggle" role="tablist" aria-label="Create or join a chat">
              <button type="button" className={`btn-mini ${mode === 'create' ? 'accent' : ''}`} aria-pressed={mode === 'create'} onClick={() => setMode('create')}>
                <MessageSquare size={13} /> Create Room
              </button>
              <button type="button" className={`btn-mini ${mode === 'join' ? 'accent' : ''}`} aria-pressed={mode === 'join'} onClick={() => setMode('join')}>
                <Plug size={13} /> Join Room
              </button>
            </div>

            <div className="field" style={{ marginBottom: '14px' }}>
              <label htmlFor="chatNameInput">Your name (optional)</label>
              <input id="chatNameInput" type="text" placeholder="e.g. Mayank" maxLength={40} value={nameInput} onChange={e => setNameInput(e.target.value)} />
            </div>

            <div className={`status-line ${status.type}`} style={{ marginBottom: '14px' }}>
              {status.type === 'error' && <AlertCircle size={14} />}
              <span>{status.msg}</span>
            </div>

            {mode === 'create' ? (
              <button type="button" className="btn-primary" onClick={handleCreate}>
                <MessageSquare size={16} /> CREATE ROOM
              </button>
            ) : (
              <>
                <div className="field" style={{ marginBottom: '14px' }}>
                  <label htmlFor="chatCodeInput">Enter code</label>
                  <input
                    id="chatCodeInput" type="text" className="code-input-lg" placeholder="00000000" maxLength={8}
                    inputMode="numeric" autoComplete="off" value={codeInput}
                    onChange={e => setCodeInput(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <button type="button" className="btn-primary" onClick={handleJoin} disabled={codeInput.length !== 8}>
                  <Plug size={16} /> JOIN ROOM
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="chat-shell">
              <div className="chat-header">
                <div className="chat-header-left">
                  <div className="chat-avatar-stack">
                    {members.map((m) => {
                      const p = paletteFor(m.peerId)
                      return <div key={m.peerId} className="chat-avatar" style={{ background: p.bg, color: p.fg }} title={m.name}>{initials(m.name)}</div>
                    })}
                  </div>
                  <span className="chat-code-badge"><Users size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} />{members.length + 1}/4 · {roomCode}</span>
                </div>
                  <div className="chat-header-actions">
                  <button type="button" className="btn-mini" onClick={copyCode} aria-label={copied ? 'Code copied' : 'Copy room code'}>
                    {copied ? <Check size={12} /> : <Copy size={12} />}<span className="btn-label">{copied ? ' COPIED' : ' COPY CODE'}</span>
                  </button>
                  <button type="button" className="btn-mini" onClick={leaveRoom} aria-label="Leave chat">
                    <LogOut size={12} /><span className="btn-label"> LEAVE</span>
                  </button>
                </div>
              </div>

              <div className="chat-messages" ref={scrollRef}>
                {messages.length === 0 && (
                  <div className="chat-empty-state">
                    <MessageSquare size={32} />
                    <span>No messages yet — say hello</span>
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {messages.map((msg) =>
                    msg.type === 'system' ? (
                      <motion.div key={msg.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="chat-system-msg">{msg.text}</motion.div>
                    ) : (
                      <MessageBubble key={msg.id} msg={msg} />
                    )
                  )}
                </AnimatePresence>
              </div>

              <div className="chat-input-bar">
                <input ref={fileInputRef} type="file" hidden onChange={handleAttach} />
                <button type="button" className="chat-icon-btn" onClick={() => fileInputRef.current.click()} aria-label="Attach a file" title={`Max ${formatBytes(MAX_CHAT_FILE_SIZE)}`}>
                  <Paperclip size={16} />
                </button>
                <input
                  type="text" placeholder="Type a message…" value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
                />
                <button type="button" className="chat-icon-btn send" onClick={handleSend} disabled={!textInput.trim()} aria-label="Send message">
                  <Send size={16} />
                </button>
              </div>
            </div>

            {status.type === 'error' && (
              <div className="status-line error" style={{ marginTop: '10px' }}><AlertCircle size={14} /><span>{status.msg}</span></div>
            )}
          </>
        )}
      </main>

      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="How This Tool Works">
        <h4>Pipeline</h4>
        <ol>
          <li>One person creates a room and gets an 8-digit code; up to 3 others can join with it (4 total).</li>
          <li>Our server only introduces everyone by socket id and tracks who's in the room — it never sees a single message or file.</li>
          <li>Everyone connects directly to everyone else (a "mesh") over encrypted <strong>WebRTC</strong> data channels, relayed through TURN over port 443 if a direct path isn't possible.</li>
          <li>Text and files travel peer-to-peer only. A file you send goes out once per other person in the room.</li>
          <li>Nothing is ever stored — leave the room and every message and file is gone, for everyone.</li>
        </ol>
        <p>File attachments are capped at {formatBytes(MAX_CHAT_FILE_SIZE)}.</p>
      </Modal>
    </>
  )
}

export default ChatRoom