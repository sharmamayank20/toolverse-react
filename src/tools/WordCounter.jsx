import { useState, useMemo } from 'react'
import { Copy, Check, Trash2, Info, Clock, Mic, Hash, AlignLeft, BookOpen } from 'lucide-react'
import CircularText from '../components/CircularText'
import Modal from '../components/Modal'

const LIMIT_PRESETS = [
  { label: 'No limit', value: 0 },
  { label: 'X / Twitter post (280)', value: 280 },
  { label: 'SMS message (160)', value: 160 },
  { label: 'Meta description (160)', value: 160 },
  { label: 'YouTube title (100)', value: 100 },
  { label: 'Instagram caption (2,200)', value: 2200 },
]

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'for', 'with', 'it', 'this', 'that', 'as', 'at', 'be', 'by', 'from', 'i', 'you', 'he', 'she', 'we', 'they'])

function formatDuration(minutes) {
  if (minutes <= 0) return '0 sec'
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} sec`
  return `${Math.ceil(minutes)} min`
}

function toTitleCase(text) {
  return text.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
}
function toSentenceCase(text) {
  const lower = text.toLowerCase()
  return lower.replace(/(^\s*\w|[.!?]\s+\w)/g, (m) => m.toUpperCase())
}

function WordCounter() {
  const [text, setText] = useState('')
  const [charLimit, setCharLimit] = useState(0)
  const [copied, setCopied] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  const stats = useMemo(() => {
    const trimmed = text.trim()
    const words = trimmed ? trimmed.split(/\s+/) : []
    const wordCount = words.length
    const charCount = text.length
    const charCountNoSpaces = text.replace(/\s/g, '').length

    const sentenceCount = trimmed ? text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean).length : 0
    const paragraphCount = trimmed ? text.split(/\n+/).map((p) => p.trim()).filter(Boolean).length : 0

    const cleanWords = words.map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, ''))
    const totalLetters = cleanWords.reduce((sum, w) => sum + w.length, 0)
    const avgWordLength = wordCount ? (totalLetters / wordCount).toFixed(1) : '0.0'
    const longestWord = cleanWords.reduce((longest, w) => (w.length > longest.length ? w : longest), '')

    const freq = new Map()
    cleanWords.forEach((w) => {
      const lower = w.toLowerCase()
      if (lower.length < 3 || STOPWORDS.has(lower)) return
      freq.set(lower, (freq.get(lower) || 0) + 1)
    })
    const topWords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)

    return {
      wordCount, charCount, charCountNoSpaces, sentenceCount, paragraphCount,
      avgWordLength, longestWord: longestWord || '—',
      readingTime: formatDuration(wordCount / 200),
      speakingTime: formatDuration(wordCount / 130),
      topWords
    }
  }, [text])

  function applyCase(fn) {
    setText(fn(text))
  }
  function handleCopy() {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const limitActive = charLimit > 0
  const overLimit = limitActive && stats.charCount > charLimit
  const limitPct = limitActive ? Math.min(100, (stats.charCount / charLimit) * 100) : 0

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">TEXT</span><span className="num">CATALOG NO. 001</span></div>
            <h1>Word Counter</h1>
            <p>
              Count words, characters, and reading time — plus limit checks and quick case fixes.{' '}
              <button type="button" className="info-btn" onClick={() => setShowInfo(true)}><Info size={13} /> How this works</button>
            </p>
            <div className="tool-chips">
              <span className="tool-chip accent">CLIENT-SIDE</span>
              <span className="tool-chip">NO UPLOAD NEEDED</span>
            </div>
          </div>
          <CircularText text="TEXT.SYS • WORD ANALYSIS • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>
        <div className="tool-workbench">
          <div className="panel-card">
            <div className="panel-head"><h2>Your Text</h2></div>

            <div className="field" style={{ marginBottom: '10px' }}>
              <label htmlFor="wcTextarea">Text</label>
              <textarea
                id="wcTextarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type or paste your text here…"
                rows={12}
                style={{
                  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: '14px', lineHeight: 1.6,
                  background: 'var(--bg)', color: 'var(--fg)', border: '2px solid var(--fg)',
                  padding: '12px', outline: 'none', resize: 'vertical'
                }}
              />
            </div>

            <div className="wc-btn-row">
              <button type="button" className="btn-mini" onClick={() => applyCase((t) => t.toUpperCase())}>UPPERCASE</button>
              <button type="button" className="btn-mini" onClick={() => applyCase((t) => t.toLowerCase())}>lowercase</button>
              <button type="button" className="btn-mini" onClick={() => applyCase(toTitleCase)}>Title Case</button>
              <button type="button" className="btn-mini" onClick={() => applyCase(toSentenceCase)}>Sentence case</button>
            </div>
            <div className="wc-btn-row">
              <button type="button" className="btn-mini" onClick={handleCopy} disabled={!text}>
                {copied ? <><Check size={12} /> COPIED</> : <><Copy size={12} /> COPY TEXT</>}
              </button>
              <button type="button" className="btn-mini" onClick={() => setText('')} disabled={!text}>
                <Trash2 size={12} /> CLEAR
              </button>
            </div>

            <div className="field" style={{ marginTop: '18px', marginBottom: limitActive ? '10px' : 0 }}>
              <label htmlFor="wcLimitSelect">Check against a character limit</label>
              <select id="wcLimitSelect" value={charLimit} onChange={(e) => setCharLimit(Number(e.target.value))}>
                {LIMIT_PRESETS.map((p) => <option key={p.label} value={p.value}>{p.label}</option>)}
              </select>
            </div>

            {limitActive && (
              <>
                <div className="progress-bar-wrap">
                  <div className="progress-bar-fill" style={{ width: `${limitPct}%`, background: overLimit ? 'var(--coral)' : undefined }} />
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: overLimit ? 'var(--coral)' : 'var(--muted)', marginTop: '6px' }}>
                  {overLimit ? `${stats.charCount - charLimit} characters over the limit` : `${charLimit - stats.charCount} characters remaining`}
                </div>
              </>
            )}
          </div>

          <div className="panel-card">
            <div className="panel-head"><h2>Stats</h2></div>

            <div className="field-row">
              <div className="kpi-tile"><span className="num">{stats.wordCount}</span><span className="label">Words</span></div>
              <div className="kpi-tile"><span className="num">{stats.charCount}</span><span className="label">Characters</span></div>
              <div className="kpi-tile"><span className="num">{stats.charCountNoSpaces}</span><span className="label">No Spaces</span></div>
            </div>
            <div className="field-row" style={{ marginTop: '10px' }}>
              <div className="kpi-tile"><span className="num">{stats.sentenceCount}</span><span className="label">Sentences</span></div>
              <div className="kpi-tile"><span className="num">{stats.paragraphCount}</span><span className="label">Paragraphs</span></div>
              <div className="kpi-tile"><span className="num">{stats.avgWordLength}</span><span className="label">Avg Word Len</span></div>
            </div>
            <div className="field-row" style={{ marginTop: '10px' }}>
              <div className="kpi-tile"><span className="num" style={{ fontSize: '16px' }}>{stats.readingTime}</span><span className="label"><Clock size={9} style={{ verticalAlign: '-1px', marginRight: '3px' }} />Reading Time</span></div>
              <div className="kpi-tile"><span className="num" style={{ fontSize: '16px' }}>{stats.speakingTime}</span><span className="label"><Mic size={9} style={{ verticalAlign: '-1px', marginRight: '3px' }} />Speaking Time</span></div>
              <div className="kpi-tile"><span className="num" style={{ fontSize: '13px', wordBreak: 'break-word' }}>{stats.longestWord}</span><span className="label">Longest Word</span></div>
            </div>

            <div style={{ marginTop: '20px' }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '10px' }}>
                <Hash size={11} style={{ verticalAlign: '-1px', marginRight: '4px' }} />Most Used Words
              </div>
              {stats.topWords.length === 0 ? (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'var(--muted)' }}>Start typing to see your most-used words.</div>
              ) : (
                <div className="wc-btn-row">
                  {stats.topWords.map(([word, count]) => (
                    <span key={word} className="tool-chip">{word} · {count}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="How This Tool Works">
        <h4>Calculations</h4>
        <ol>
          <li><strong>Reading time</strong> assumes an average reading speed of 200 words per minute.</li>
          <li><strong>Speaking time</strong> assumes an average speaking pace of 130 words per minute.</li>
          <li><strong>Sentences</strong> are counted by splitting on <code>. ! ?</code>, which is a good approximation but can miscount abbreviations (e.g. "Mr. Smith").</li>
          <li><strong>Most Used Words</strong> filters out very short words and common filler words (the, and, is, etc.) so the list stays meaningful.</li>
        </ol>
        <p>Everything runs entirely in your browser — your text is never sent anywhere.</p>
      </Modal>
    </>
  )
}

export default WordCounter