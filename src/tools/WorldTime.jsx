import { useState, useMemo } from 'react'
import CircularText from '../components/CircularText'
import { isValidDate, addToDate, calculateDifference, daysInMonth } from '../utils/dateMath'
import { ArrowLeftRight, Plus, Minus, Copy, Check, AlertCircle } from 'lucide-react'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const OFFSET_UNITS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]
const now = new Date()

function dateToFields(dt) {
  return { day: dt.getDate(), month: dt.getMonth() + 1, year: dt.getFullYear(), hour: dt.getHours(), minute: dt.getMinutes(), second: dt.getSeconds() }
}

function weekdayLabel(fields) {
  if (!isValidDate(fields.year, fields.month, fields.day)) return null
  return WEEKDAYS[new Date(fields.year, fields.month - 1, fields.day).getDay()]
}

function DateFields({ fields, onChange }) {
  const years = []
  for (let y = 1900; y <= now.getFullYear() + 20; y++) years.push(y)

  const maxDay = daysInMonth(fields.year, fields.month)
  const weekday = weekdayLabel(fields)

  // Changing month/year can leave the current day out of range (e.g. 31 ->
  // February) — clamp it down to the new month's last valid day instead of
  // silently becoming invalid, so the field never shows a date that can't exist.
  function changeMonthOrYear(patch) {
    const next = { ...fields, ...patch }
    const cap = daysInMonth(next.year, next.month)
    if (next.day > cap) next.day = cap
    onChange(next)
  }

  return (
    <>
      <div className="field-row">
        <div className="field"><label>Day</label>
          <select value={fields.day} onChange={e => onChange({ ...fields, day: +e.target.value })}>
            {Array.from({ length: maxDay }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="field"><label>Month</label>
          <select value={fields.month} onChange={e => changeMonthOrYear({ month: +e.target.value })}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field"><label>Year</label>
          <select value={fields.year} onChange={e => changeMonthOrYear({ year: +e.target.value })}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="field"><label>Hour</label>
          <select value={fields.hour} onChange={e => onChange({ ...fields, hour: +e.target.value })}>
            {Array.from({ length: 24 }, (_, i) => i).map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}</option>)}
          </select>
        </div>
        <div className="field"><label>Minute</label>
          <select value={fields.minute} onChange={e => onChange({ ...fields, minute: +e.target.value })}>
            {Array.from({ length: 60 }, (_, i) => i).map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
          </select>
        </div>
      </div>
      <div className="field" style={{ marginBottom: weekday ? '8px' : undefined }}>
        <label>Second</label>
        <select value={fields.second} onChange={e => onChange({ ...fields, second: +e.target.value })}>
          {Array.from({ length: 60 }, (_, i) => i).map(s => <option key={s} value={s}>{String(s).padStart(2, '0')}</option>)}
        </select>
      </div>
      {weekday && (
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--muted)' }}>{weekday}</p>
      )}
    </>
  )
}

function WorldTime() {
  const [d1, setD1] = useState(dateToFields(now))
  const [d2, setD2] = useState(dateToFields(now))
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [offsetAmount, setOffsetAmount] = useState(1)
  const [offsetUnit, setOffsetUnit] = useState('day')

  const result = useMemo(() => {
    if (!isValidDate(d1.year, d1.month, d1.day)) return { error: 'Date 1 is invalid. Please check the date values.' }
    if (!isValidDate(d2.year, d2.month, d2.day)) return { error: 'Date 2 is invalid. Please check the date values.' }
    return calculateDifference(d1, d2)
  }, [d1, d2])

  function applyOffset(amount, unit) {
    if (!isValidDate(d1.year, d1.month, d1.day)) return
    const base = new Date(d1.year, d1.month - 1, d1.day, d1.hour, d1.minute, d1.second)
    setD2(dateToFields(addToDate(base, amount, unit)))
  }

  function handleSwap() {
    setD1(d2)
    setD2(d1)
  }

  async function handleCopy() {
    if (result.error) return
    const text = [
      result.headline,
      `Calendar breakdown: ${result.years}y ${result.months}m ${result.days}d ${result.hours}h ${result.minutes}m ${result.seconds}s`,
      `Business days: ${result.businessDays.toLocaleString()}`,
      `Total days: ${result.totalDays.toLocaleString()}`,
      `Total months (approx): ${result.totalMonths.toFixed(2)}`,
      `Total hours: ${result.totalHours.toFixed(2)}`,
      `Total minutes: ${result.totalMinutes.toFixed(2)}`,
      `Total seconds: ${result.totalSeconds.toLocaleString()}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true); setCopyError(false)
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
            <div className="tool-crumb"><span className="cat">UTILITY</span><span className="num">CATALOG NO. 013</span></div>
            <h1>World Time</h1>
            <p>Pick two dates and get precise differences in years, months, days, and seconds.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">CLIENT-SIDE</span>
              <span className="tool-chip">24H CLOCK</span>
            </div>
          </div>
          <CircularText text="TOOLVERSE • WORLD TIME • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>
        <div className="tool-workbench">

          <div>
            <div className="panel-card" style={{ marginBottom: '20px' }}>
              <div className="panel-head">
                <h2>Date 1</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn-mini" onClick={handleSwap} title="Swap Date 1 and Date 2"><ArrowLeftRight size={12} /> SWAP</button>
                  <button type="button" className="btn-mini" onClick={() => setD1(dateToFields(new Date()))}>NOW</button>
                </div>
              </div>
              <DateFields fields={d1} onChange={setD1} />
            </div>

            <div className="panel-card">
              <div className="panel-head">
                <h2>Date 2</h2>
                <button type="button" className="btn-mini" onClick={() => setD2(dateToFields(new Date()))}>NOW</button>
              </div>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>SET DATE 2 RELATIVE TO DATE 1</p>
              <div className="offset-row">
                <button type="button" className="btn-mini" onClick={() => applyOffset(1, 'day')}>+1 DAY</button>
                <button type="button" className="btn-mini" onClick={() => applyOffset(1, 'week')}>+1 WEEK</button>
                <button type="button" className="btn-mini" onClick={() => applyOffset(1, 'month')}>+1 MONTH</button>
                <button type="button" className="btn-mini" onClick={() => applyOffset(1, 'year')}>+1 YEAR</button>
              </div>
              <div className="offset-row" style={{ marginBottom: '14px' }}>
                <button type="button" className="btn-mini" onClick={() => applyOffset(-1, 'day')}>-1 DAY</button>
                <button type="button" className="btn-mini" onClick={() => applyOffset(-1, 'week')}>-1 WEEK</button>
                <button type="button" className="btn-mini" onClick={() => applyOffset(-1, 'month')}>-1 MONTH</button>
                <button type="button" className="btn-mini" onClick={() => applyOffset(-1, 'year')}>-1 YEAR</button>
              </div>
              <div className="field-row" style={{ alignItems: 'flex-end' }}>
                <div className="field">
                  <label>Custom Offset</label>
                  <input type="number" min="1" value={offsetAmount} onChange={e => setOffsetAmount(Math.max(1, parseInt(e.target.value, 10) || 1))} />
                </div>
                <div className="field">
                  <label>Unit</label>
                  <select value={offsetUnit} onChange={e => setOffsetUnit(e.target.value)}>
                    {OFFSET_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}{offsetAmount === 1 ? '' : 's'}</option>)}
                  </select>
                </div>
              </div>
              <div className="offset-row" style={{ marginTop: '10px', marginBottom: '20px' }}>
                <button type="button" className="btn-mini" onClick={() => applyOffset(offsetAmount, offsetUnit)}><Plus size={12} /> ADD</button>
                <button type="button" className="btn-mini" onClick={() => applyOffset(-offsetAmount, offsetUnit)}><Minus size={12} /> SUBTRACT</button>
              </div>
              <DateFields fields={d2} onChange={setD2} />
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-head">
              <h2>Preview</h2>
              <button type="button" className="btn-mini" onClick={handleCopy} disabled={!!result.error}>
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>

            {copyError && (
              <p style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--coral)', fontSize: '12px', marginBottom: '12px' }}>
                <AlertCircle size={13} /> Could not copy — select and copy manually.
              </p>
            )}

            {result.error ? (
              <p style={{ color: 'var(--coral)', fontSize: '13px' }}>{result.error}</p>
            ) : (
              <>
                {result.wasSwapped && <p style={{ color: 'var(--acid)', fontSize: '12px', marginBottom: '12px' }}>Date 2 was earlier than Date 1 — showing the absolute duration between them.</p>}
                <div className="result-headline">{result.headline}</div>
                <div className="result-row"><span>Calendar breakdown</span><strong>{result.years}y {result.months}m {result.days}d {result.hours}h {result.minutes}m {result.seconds}s</strong></div>
                <div className="result-row"><span>Business days</span><strong>{result.businessDays.toLocaleString()}</strong></div>
                <div className="result-row"><span>Total days</span><strong>{result.totalDays.toLocaleString()}</strong></div>
                <div className="result-row"><span>Total months (approx)</span><strong>{result.totalMonths.toFixed(2)}</strong></div>
                <div className="result-row"><span>Total hours</span><strong>{result.totalHours.toFixed(2)}</strong></div>
                <div className="result-row"><span>Total minutes</span><strong>{result.totalMinutes.toFixed(2)}</strong></div>
                <div className="result-row"><span>Total seconds</span><strong>{result.totalSeconds.toLocaleString()}</strong></div>
              </>
            )}
          </div>

        </div>
      </main>
    </>
  )
}

export default WorldTime