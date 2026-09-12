import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, User, Trash2, Send, Paperclip, X, Sparkles, Copy, Check, RotateCw, File, FileText } from 'lucide-react'
import { renderMessageHTML, getStoredCode, resetCodeBlockStore } from '../utils/chatMarkdown'
import CircularText from '../components/CircularText'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'
const STORAGE_KEY = 'toolverse_chat_history_v1'

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf', 'text/plain']
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024

const SUGGESTED_PROMPTS = [
  'Explain quantum computing in simple terms',
  'Write a professional email for a job application',
  'Help me debug this JavaScript code',
  'What are the benefits of regular exercise?',
  'Explain blockchain technology',
  'Give me 5 productivity tips',
]

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}


function getFileExt(name = '') {
  const parts = name.split('.')
  return parts.length > 1 ? parts.pop().toUpperCase() : 'FILE'
}

function getFileIcon(mimeType) {
  if (mimeType === 'application/pdf' || mimeType === 'text/plain') return FileText
  return File
}

function AttachmentChip({ attachment }) {
  if (!attachment) return null
  const isImage = attachment.mimeType?.startsWith('image/')

  if (isImage && attachment.previewUrl) {
    return (
      <div className="chat-image-chip">
        <img src={attachment.previewUrl} alt={attachment.name} />
        <span className="chat-file-ext">{getFileExt(attachment.name)}</span>
      </div>
    )
  }

  const Icon = getFileIcon(attachment.mimeType)
  return (
    <div className="chat-file-card">
      <span className="chat-file-icon"><Icon size={16} /></span>
      <div className="chat-file-info">
        <div className="chat-file-name">{attachment.name}</div>
        <div className="chat-file-ext">{getFileExt(attachment.name)}</div>
      </div>
    </div>
  )
}



function ChatAssistant() {
  const [messages, setMessages] = useState(loadHistory)
  const [input, setInput] = useState('')
  const [pendingAttachment, setPendingAttachment] = useState(null)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const [copiedMessageId, setCopiedMessageId] = useState(null)

  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  }, [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [input])

  const handleClear = () => {
    if (messages.length === 0) return
    if (!window.confirm('Clear the entire conversation? This cannot be undone.')) return
    messages.forEach(m => { if (m.attachment?.previewUrl) URL.revokeObjectURL(m.attachment.previewUrl) })
    setMessages([])
    resetCodeBlockStore()
    setError('')
  }

  const handleAttachClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError(`Unsupported file type: ${file.type || 'unknown'}`)
      return
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError('File too large (max 15MB).')
      return
    }
    setError('')
    const base64 = await fileToBase64(file)
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    setPendingAttachment({ mimeType: file.type, base64, previewUrl, name: file.name })
  }

  const clearAttachment = (revoke = true) => {
  if (revoke && pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl)
  setPendingAttachment(null)
  }

  const buildHistoryForApi = (msgs) =>
    msgs
      .filter(m => m.role === 'user' || m.role === 'model')
      .map(m => ({ role: m.role, parts: [{ text: m.text || '' }] }))

  const sendMessage = useCallback(async (rawText) => {
    const text = rawText.trim()
    if (!text && !pendingAttachment) return
    if (isSending) return

    setError('')
    const historyForApi = buildHistoryForApi(messages)

      const userMsg = {
      role: 'user',
      text,
      attachment: pendingAttachment
        ? { name: pendingAttachment.name, mimeType: pendingAttachment.mimeType, previewUrl: pendingAttachment.previewUrl }
        : null,
      timestamp: Date.now(),
    }

    const attachmentPayload = pendingAttachment
      ? { mimeType: pendingAttachment.mimeType, data: pendingAttachment.base64 }
      : undefined

    setMessages(prev => [...prev, userMsg])
    setInput('')
    clearAttachment(false)   // was clearAttachment() — this is the actual bug fix
    setIsSending(true)

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: historyForApi, attachment: attachmentPayload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')

      setMessages(prev => [...prev, { role: 'model', text: data.reply, timestamp: data.timestamp || Date.now() }])
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setMessages(prev => [...prev, {
        role: 'model',
        text: "I couldn't process that — please try again in a moment.",
        timestamp: Date.now(),
        failed: true,
      }])
    } finally {
      setIsSending(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, pendingAttachment, isSending])

  const handleCopyMessage = (text, id) => {
  navigator.clipboard.writeText(text).then(() => {
    setCopiedMessageId(id)
    setTimeout(() => setCopiedMessageId(prev => (prev === id ? null : prev)), 1500)
  })
}

const handleRetry = useCallback(async (failedIndex) => {
  if (isSending) return
  const userIndex = failedIndex - 1
  const userMsg = messages[userIndex]
  if (!userMsg || userMsg.role !== 'user') return

  const historyForApi = buildHistoryForApi(messages.slice(0, userIndex))
  setMessages(prev => prev.filter((_, i) => i !== failedIndex))
  setError('')
  setIsSending(true)

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMsg.text, history: historyForApi }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed')
    setMessages(prev => [...prev, { role: 'model', text: data.reply, timestamp: data.timestamp || Date.now() }])
  } catch (err) {
    setError(err.message || 'Something went wrong. Please try again.')
    setMessages(prev => [...prev, {
      role: 'model', text: "I couldn't process that — please try again in a moment.",
      timestamp: Date.now(), failed: true,
    }])
  } finally {
    setIsSending(false)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [messages, isSending])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // Event delegation for copy buttons injected via dangerouslySetInnerHTML —
  // these aren't React elements, so they can't have onClick props directly.
  const handleBodyClick = (e) => {
    const btn = e.target.closest('.code-copy-btn')
    if (!btn) return
    const id = btn.getAttribute('data-code-id')
    const code = getStoredCode(id)
    navigator.clipboard.writeText(code).then(() => {
      const label = btn.querySelector('span')
      if (!label) return
      const prevText = label.textContent
      label.textContent = 'Copied'
      btn.classList.add('copied')
      setTimeout(() => {
        label.textContent = prevText
        btn.classList.remove('copied')
      }, 1500)
    })
  }

  const turns = Math.ceil(messages.length / 2)

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">DEV TOOLS</span><span className="num">CATALOG NO. 031</span></div>
            <h1>AI Assistant</h1>
            <p>Conversational AI powered by Gemini 2.5 Flash — text, code, and file understanding.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">GEMINI 2.5</span>
              <span className="tool-chip">SERVER-BACKED</span>
            </div>
          </div>
          <CircularText text="BLITZ AI • GEMINI 2.5 FLASH • " spinDuration={16} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>
        <div className="panel-card chat-console">
          <div className="panel-head chat-console-head">
            <div className="chat-console-title">
              <span className="chat-avatar chat-avatar-ai"><Bot size={16} /></span>
              <div>
                <h2>Blitz AI</h2>
                <div className="chat-console-status">
                  <span className={`chat-status-dot ${isSending ? 'busy' : ''}`} />
                  <span>{isSending ? 'Thinking…' : 'Ready'}</span>
                </div>
              </div>
            </div>
            <button type="button" className="btn-mini" onClick={handleClear} aria-label="Clear conversation">
              <Trash2 size={13} /> Clear
            </button>
          </div>

          <div className="chat-console-body" onClick={handleBodyClick}>
            {messages.length === 0 && (
              <div className="chat-welcome">
                <span className="chat-avatar chat-avatar-ai chat-avatar-lg"><Sparkles size={22} /></span>
                <h3>Welcome to TOOLVERSE AI</h3>
                <p>Ask a question, paste some code, or attach a file to get started.</p>
                <div className="chat-prompts-grid">
                  {SUGGESTED_PROMPTS.map(p => (
                    <button key={p} type="button" className="btn-mini chat-prompt-chip" onClick={() => sendMessage(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((m, i) => (
                <motion.div
                  key={m.timestamp + '-' + i}
                  className={`chat-message ${m.role === 'user' ? 'chat-message-user' : 'chat-message-ai'}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className={`chat-avatar ${m.role === 'user' ? 'chat-avatar-user' : 'chat-avatar-ai'}`}>
                    {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                  </span>
                                    <div className={`chat-bubble ${m.failed ? 'chat-bubble-error' : ''}`}>
                                        {m.attachment && (
                      <div className="chat-attachment-preview">
                        <AttachmentChip attachment={m.attachment} />
                      </div>
                    )}
                    {m.role === 'model'
                      ? <div className="chat-markdown" dangerouslySetInnerHTML={{ __html: renderMessageHTML(m.text) }} />
                      : <p className="chat-plain-text">{m.text}</p>}

                    <div className="chat-bubble-meta">
                      <span className="chat-timestamp">
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="chat-message-actions">
                        <button
                          type="button"
                          className={`chat-action-btn ${copiedMessageId === i ? 'copied' : ''}`}
                          onClick={() => handleCopyMessage(m.text, i)}
                          aria-label="Copy message"
                        >
                          {copiedMessageId === i ? <Check size={11} /> : <Copy size={11} />}
                          {copiedMessageId === i ? 'Copied' : 'Copy'}
                        </button>
                        {m.failed && (
                          <button
                            type="button"
                            className="chat-action-btn retry"
                            onClick={() => handleRetry(i)}
                            aria-label="Retry message"
                          >
                            <RotateCw size={11} /> Retry
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            <AnimatePresence>
              {isSending && (
                <motion.div
                  className="chat-message chat-message-ai"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="chat-avatar chat-avatar-ai"><Bot size={14} /></span>
                  <div className="chat-bubble chat-typing">
                    <span className="chat-typing-dot" />
                    <span className="chat-typing-dot" />
                    <span className="chat-typing-dot" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>

          {error && <p className="chat-error-line">{error}</p>}

          {pendingAttachment && (
            <div className="chat-pending-attachment">
              <AttachmentChip attachment={pendingAttachment} />
              <button type="button" className="chat-remove-attachment" onClick={() => clearAttachment(true)} aria-label="Remove attachment">
                <X size={12} />
              </button>
            </div>
          )}

          <div className="chat-input-row">
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_MIME_TYPES.join(',')}
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button type="button" className="btn-mini chat-attach-btn" onClick={handleAttachClick} aria-label="Attach a file">
              <Paperclip size={14} />
            </button>
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder="Type your message…"
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              className="btn-primary inline chat-send-btn"
              onClick={() => sendMessage(input)}
              disabled={isSending || (!input.trim() && !pendingAttachment)}
              aria-label="Send message"
            >
              <Send size={15} />
            </button>
          </div>

          <div className="chat-stats-bar">
            <span><strong>{messages.length}</strong> messages</span>
            <span><strong>{turns}</strong> turns</span>
            <span>Gemini 2.5 Flash</span>
          </div>
        </div>
      </main>
    </>
  )
}

export default ChatAssistant