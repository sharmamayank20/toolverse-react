import { useState, useMemo } from 'react'
import { Eye, EyeOff, Copy, Check, Sparkles, ListChecks, Infinity as InfinityIcon, Zap, AlertCircle } from 'lucide-react'
import CircularText from '../components/CircularText'

function clampInt(v, min, max) { return Math.min(Math.max(v, min), max) }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
function randomChar(str) { return str[Math.floor(Math.random() * str.length)] }

const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const NUMBERS = '0123456789'
const SPECIAL = '!@#$%^&*()'

// A real entropy estimate (pool size actually present in the password, times
// length) rather than "count how many checkboxes are true" — the latter
// scores "Aa1!" the same as "Aa1!Aa1!Aa1!Aa1!", which isn't meaningfully true.
function estimatePoolSize(pw) {
  let size = 0
  if (/[a-z]/.test(pw)) size += 26
  if (/[A-Z]/.test(pw)) size += 26
  if (/[0-9]/.test(pw)) size += 10
  if (/[^A-Za-z0-9]/.test(pw)) size += 32 // reasonable estimate for the common symbol set
  return size
}
function estimateEntropyBits(pw) {
  const pool = estimatePoolSize(pw)
  if (!pool || !pw.length) return 0
  return pw.length * Math.log2(pool)
}

// Deliberately a rough, clearly-labeled estimate, not a precise prediction —
// real crack time depends heavily on how the password is hashed and stored,
// which this tool has no way of knowing. Assumes a fast offline attack
// (~10 billion guesses/sec), a commonly-cited ballpark for weakly-hashed
// or unsalted credential dumps.
function estimateCrackTime(bits) {
  if (bits <= 0) return '—'
  const guessesPerSecond = 1e10
  const seconds = Math.pow(2, bits) / guessesPerSecond / 2
  if (seconds < 1) return 'instantly'
  const units = [
    [60, 'seconds'], [60, 'minutes'], [24, 'hours'], [365, 'days'],
    [100, 'years'], [10, 'centuries'], [1000, 'millennia'],
  ]
  let value = seconds, unitLabel = 'seconds'
  for (const [factor, label] of units) {
    if (value < factor) { unitLabel = label; break }
    value /= factor
    unitLabel = label
  }
  if (unitLabel === 'millennia' && value > 1000) return 'billions of years+'
  return `~${value < 10 ? value.toFixed(1) : Math.round(value)} ${unitLabel}`
}

function strengthFromBits(bits) {
  if (bits === 0) return { text: '—', className: '', width: 0, color: 'transparent' }
  if (bits < 28) return { text: 'Very Weak', className: 'weak', width: 15, color: 'var(--coral)' }
  if (bits < 40) return { text: 'Weak', className: 'weak', width: 35, color: 'var(--coral)' }
  if (bits < 60) return { text: 'Medium', className: 'medium', width: 60, color: 'var(--acid)' }
  if (bits < 90) return { text: 'Strong', className: 'strong', width: 85, color: 'var(--cobalt)' }
  return { text: 'Very Strong', className: 'strong', width: 100, color: 'var(--cobalt)' }
}

function KeyForge() {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  const [includeLetters, setIncludeLetters] = useState(true)
  const [includeNumbers, setIncludeNumbers] = useState(true)
  const [includeSpecial, setIncludeSpecial] = useState(true)
  const [length, setLength] = useState(12)
  const [generateHint, setGenerateHint] = useState('')

  const criteria = useMemo(() => ({
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  }), [password])

  const entropyBits = useMemo(() => estimateEntropyBits(password), [password])
  const poolSize = useMemo(() => estimatePoolSize(password), [password])
  const crackTime = useMemo(() => estimateCrackTime(entropyBits), [entropyBits])
  const strength = useMemo(() => strengthFromBits(entropyBits), [entropyBits])

  function handleGenerate() {
    const pools = []
    // Letters guarantee BOTH cases separately (not one draw from a combined
    // pool) — drawing once from "a-zA-Z" could easily produce zero uppercase
    // letters, which would then fail the tool's own criteria checklist
    // immediately after generating.
    if (includeLetters) { pools.push(LOWER); pools.push(UPPER) }
    if (includeNumbers) pools.push(NUMBERS)
    if (includeSpecial) pools.push(SPECIAL)

    setGenerateHint('')
    if (pools.length === 0) {
      setGenerateHint('Select at least one character type to generate a password.')
      return
    }

    const len = clampInt(length, 6, 32)
    const charset = pools.join('')
    let chars = pools.map(pool => randomChar(pool))
    while (chars.length < len) chars.push(randomChar(charset))
    chars = chars.slice(0, len)
    shuffle(chars)
    const newPassword = chars.join('')

    setPassword(newPassword)
    setShowPassword(true)
    setCopied(false)
    setCopyError(false)
  }

  async function handleCopy() {
    if (!password) return
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setCopyError(false)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopyError(true)
      setTimeout(() => setCopyError(false), 2000)
    }
  }

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">DEV</span><span className="num">CATALOG NO. 017</span></div>
            <h1>Key Forge</h1>
            <p>Generate and evaluate strong passwords with live criteria, real entropy estimates, and instant copy.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">CLIENT-SIDE</span>
              <span className="tool-chip">NEVER STORED</span>
            </div>
          </div>
          <CircularText text="SECURITY.SYS • ENTROPY ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>
        <div className="tool-workbench">

          <div className="panel-card">
            <div className="panel-head"><h2>Password</h2></div>

            <div className="pwd-input-wrap has-two-actions">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setCopied(false); setCopyError(false) }}
                placeholder="Type a password, or generate one below"
                autoComplete="new-password"
              />
              <button type="button" className={`pwd-icon-btn ${showPassword ? 'active' : ''}`} onClick={() => setShowPassword(s => !s)} aria-label="Show or hide password">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              <button type="button" className="pwd-icon-btn copy-action" onClick={handleCopy} aria-label="Copy password" disabled={!password}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            {copyError && (
              <p style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--coral)', fontSize: '12px', marginTop: '8px' }}>
                <AlertCircle size={13} /> Could not copy — select and copy manually.
              </p>
            )}

            <div className={`strength-label ${strength.className}`}>Strength: {strength.text}</div>
            <div className="strength-bar">
              <div className="strength-bar-fill" style={{ width: `${strength.width || 0}%`, background: strength.color || 'transparent' }}></div>
            </div>

            <ul className="criteria-list">
              <li className={criteria.length ? 'met' : ''}>• Minimum 8 characters</li>
              <li className={criteria.uppercase ? 'met' : ''}>• Includes uppercase letter (A-Z)</li>
              <li className={criteria.lowercase ? 'met' : ''}>• Includes lowercase letter (a-z)</li>
              <li className={criteria.number ? 'met' : ''}>• Includes number (0-9)</li>
              <li className={criteria.special ? 'met' : ''}>• Includes special character (!@#$%^&*)</li>
            </ul>

            <button type="button" className="btn-primary" onClick={handleGenerate}><Sparkles size={16} /> GENERATE PASSWORD</button>
            {generateHint && <p style={{ color: 'var(--coral)', fontSize: '12px', marginTop: '10px' }}>{generateHint}</p>}

            <div style={{ marginTop: '20px' }}>
              <label className="toggle-switch"><input type="checkbox" checked={includeLetters} onChange={e => setIncludeLetters(e.target.checked)} /><span className="track"></span>Letters (a-z, A-Z)</label>
              <label className="toggle-switch"><input type="checkbox" checked={includeNumbers} onChange={e => setIncludeNumbers(e.target.checked)} /><span className="track"></span>Numbers (0-9)</label>
              <label className="toggle-switch"><input type="checkbox" checked={includeSpecial} onChange={e => setIncludeSpecial(e.target.checked)} /><span className="track"></span>Special Characters (!@#$%^&*)</label>

              <div className="field" style={{ marginTop: '10px' }}>
                <label>Length: {length}</label>
                <input type="range" min="6" max="32" step="1" value={length} onChange={e => setLength(parseInt(e.target.value, 10))} />
              </div>
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-head"><h2>Live Analysis</h2></div>
            <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '20px' }}>Strength, entropy, and estimated crack time update as you type.</p>
            <div className="field-row">
              <div className="kpi-tile"><span className="num">{password ? Math.round(entropyBits) : '—'}</span><span className="label">Bits of Entropy</span></div>
              <div className="kpi-tile"><span className="num" style={{ fontSize: '15px' }}>{password ? crackTime : '—'}</span><span className="label">Est. Crack Time</span></div>
              <div className="kpi-tile"><span className="num">{password ? poolSize : '—'}</span><span className="label">Char Pool Size</span></div>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '14px', lineHeight: 1.6 }}>
              Crack time is a rough estimate assuming ~10 billion guesses/second — a common ballpark for fast offline attacks. Real-world time depends heavily on how a password is stored and hashed, which this tool has no way of knowing.
            </p>
            <div className="field-row" style={{ marginTop: '16px' }}>
              <div className="kpi-tile"><span className="num"><ListChecks size={20} style={{ margin: '0 auto' }} /></span><span className="label">Live Criteria</span></div>
              <div className="kpi-tile"><span className="num"><InfinityIcon size={20} style={{ margin: '0 auto' }} /></span><span className="label">Variants</span></div>
              <div className="kpi-tile"><span className="num"><Zap size={20} style={{ margin: '0 auto' }} /></span><span className="label">Quick Copy</span></div>
            </div>
          </div>

        </div>
      </main>
    </>
  )
}

export default KeyForge
