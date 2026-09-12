import { useState, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CircularText from '../components/CircularText'
import { Check, Copy, Save, AlertCircle } from 'lucide-react'
import { EXAM_OPTIONS, SERVICE_FIELD, STD_CAT_RELAX } from '../utils/eligibilityData'
import { makeDateFromParts, computeCDS, computeGeneric } from '../utils/eligibilityMath'

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 1960 + 1 }, (_, i) => CURRENT_YEAR - i)

function EligibilityCalculator() {
  const [exam, setExam] = useState('')
  const [service, setService] = useState('')
  const [statepsc, setStatepsc] = useState('')
  const [dobDay, setDobDay] = useState('')
  const [dobMonth, setDobMonth] = useState('')
  const [dobYear, setDobYear] = useState('')
  const [education, setEducation] = useState('')
  const [prevAttempts, setPrevAttempts] = useState('0')
  const [category, setCategory] = useState('GEN')
  const [ugcType, setUgcType] = useState('')
  const [dgcaCpl, setDgcaCpl] = useState(false)
  const [married, setMarried] = useState(false)
  const [taEmployed, setTaEmployed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  const resultsRef = useRef(null)

  const serviceField = SERVICE_FIELD[exam]
  const showService = !!serviceField
  const showStatePsc = exam === 'STATE_PSC'
  const showCpl = (exam === 'CDS' && service === 'AFA') || (exam === 'AFCAT' && service === 'Flying')
  const showMarried = exam === 'CDS' || exam === 'NDA'
  const showTaEmployed = exam === 'TA'

  function handleExamChange(val) {
    setExam(val)
    setService('')
    setStatepsc('')
    setDgcaCpl(false)
    setMarried(false)
    setTaEmployed(false)
  }

  // Recalculates live as any input changes — the CHECK ELIGIBILITY button
  // below still exists (it scrolls to the results panel, useful on mobile
  // where the two panels stack), but results are never stale waiting on a click.
  const result = useMemo(() => {
    const dob = makeDateFromParts(dobYear, dobMonth, dobDay)
    if (!exam || !dob) return null

    if (exam === 'CDS') {
      return computeCDS(dob, education, married, dgcaCpl, prevAttempts, service || 'IMA')
    }
    const ctx = {
      cpl: dgcaCpl,
      branch: service || 'Flying',
      role: service || 'State Police SI',
      state: statepsc,
      employed: taEmployed,
      subtype: ugcType || 'AP',
    }
    return computeGeneric(exam, dob, education, category, married, prevAttempts, ctx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, service, statepsc, dobDay, dobMonth, dobYear, education, married, dgcaCpl, prevAttempts, category, ugcType, taEmployed])

  function handleViewResults() {
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleReset() {
    setExam(''); setService(''); setStatepsc('')
    setDobDay(''); setDobMonth(''); setDobYear('')
    setEducation(''); setPrevAttempts('0'); setCategory('GEN'); setUgcType('')
    setDgcaCpl(false); setMarried(false); setTaEmployed(false)
  }

  const summaryText = useMemo(() => {
    if (!result) return ''
    return [
      `Eligibility: ${result.eligibleNow ? 'Eligible' : 'Not Eligible'}`,
      `Attempts Made: ${result.attemptsMade}`,
      `Remaining Attempts: ${result.attemptsLeft === Infinity ? '∞' : result.attemptsLeft}`,
      `Eligible Now: ${result.eligibleNow ? 'Yes' : 'No'}`,
      `Next Window: ${result.nextWindow}`,
      `Last Window: ${result.lastWindow}`,
      `Last Attempt: ${result.lastReal}`,
      ...(result.detailLines || []).map(l => `• ${l}`),
    ].join('\n')
  }, [result])

  async function handleCopy() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(summaryText)
      setCopied(true); setCopyError(false)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopyError(true)
      setTimeout(() => setCopyError(false), 2000)
    }
  }
  function handleSaveTxt() {
    if (!result) return
    const blob = new Blob([summaryText], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'eligibility.txt'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">CALCULATOR</span><span className="num">CATALOG NO. 004</span></div>
            <h1>Eligibility</h1>
            <p>Check attempts, age windows, and eligibility across CDS, UPSC, NDA, AFCAT, CAPF, and 15+ more exams.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">CLIENT-SIDE</span>
              <span className="tool-chip">20+ EXAMS</span>
            </div>
          </div>
          <CircularText text="ADMIT.SYS • AGE WINDOW ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>
        <div className="tool-workbench">

          {/* INPUTS */}
          <div className="panel-card">
            <div className="panel-head"><h2>Inputs</h2></div>

            <div className="field" style={{ marginBottom: '16px' }}>
              <label>Exam</label>
              <select value={exam} onChange={e => handleExamChange(e.target.value)}>
                {EXAM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {showService && (
              <div className="field" style={{ marginBottom: '16px' }}>
                <label>{serviceField.label}</label>
                <select value={service} onChange={e => setService(e.target.value)}>
                  <option value="">Select</option>
                  {serviceField.options.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            {showStatePsc && (
              <div style={{ marginBottom: '16px' }}>
                <label className="field-label" style={{ display: 'block', marginBottom: '8px' }}>Select State PSC</label>
                <div className="state-chips">
                  {['UPPSC', 'MPPSC', 'BPSC'].map(s => (
                    <button key={s} type="button" className={`state-chip ${statepsc === s ? 'on' : ''}`} onClick={() => setStatepsc(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            <label className="field-label" style={{ display: 'block', marginBottom: '8px' }}>Date of Birth</label>
            <div className="field-row">
              <div className="field"><label>Day</label><select value={dobDay} onChange={e => setDobDay(e.target.value)}><option value="">DD</option>{DAYS.map(d => <option key={d} value={d}>{String(d).padStart(2, '0')}</option>)}</select></div>
              <div className="field"><label>Month</label><select value={dobMonth} onChange={e => setDobMonth(e.target.value)}><option value="">MM</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{String(i + 1).padStart(2, '0')} — {m}</option>)}</select></div>
              <div className="field"><label>Year</label><select value={dobYear} onChange={e => setDobYear(e.target.value)}><option value="">YYYY</option>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Education</label>
                <select value={education} onChange={e => setEducation(e.target.value)}>
                  <option value="">Select</option>
                  <option value="XII">10+2</option><option value="SCI_MATH_XII">10+2 with Physics & Maths</option>
                  <option value="GRAD">Graduation</option><option value="ENGG">Engineering</option>
                  <option value="PG">Post Graduation</option><option value="MPHIL">M.Phil</option>
                  <option value="PHD">Ph.D.</option><option value="LLB">LL.B</option><option value="LLM">LL.M</option><option value="OTHER">Other</option>
                </select>
              </div>
              <div className="field"><label>Previous Attempts</label><input type="number" min="0" value={prevAttempts} onChange={e => setPrevAttempts(e.target.value)} /></div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)}>
                  {Object.keys(STD_CAT_RELAX).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>UGC NET Subtype</label>
                <select value={ugcType} onChange={e => setUgcType(e.target.value)}>
                  <option value="">Auto (defaults to AP)</option>
                  <option value="AP">Assistant Professor (No upper age)</option>
                  <option value="JRF">JRF (Age limit applies)</option>
                </select>
              </div>
            </div>

            {showCpl && (
              <label className="chip-toggle"><input type="checkbox" checked={dgcaCpl} onChange={e => setDgcaCpl(e.target.checked)} /><span className="box"><Check size={12} /></span>DGCA Commercial Pilot License (AFA/AFCAT relaxation)</label>
            )}
            {showMarried && (
              <label className="chip-toggle"><input type="checkbox" checked={married} onChange={e => setMarried(e.target.checked)} /><span className="box"><Check size={12} /></span>Married (affects some academies)</label>
            )}
            {showTaEmployed && (
              <label className="chip-toggle"><input type="checkbox" checked={taEmployed} onChange={e => setTaEmployed(e.target.checked)} /><span className="box"><Check size={12} /></span>Gainfully employed (TA mandatory)</label>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button type="button" className="btn-primary" onClick={handleViewResults}>CHECK ELIGIBILITY</button>
              <button type="button" className="btn-mini" onClick={handleReset}>RESET</button>
            </div>
          </div>

          {/* RESULTS */}
          <div className="panel-card" ref={resultsRef}>
            <div className="panel-head"><h2>Result</h2></div>

            <AnimatePresence mode="wait">
              {!result ? (
                <motion.p
                  key="empty"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  style={{ color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}
                >
                  Fill in the exam and full Date of Birth to see live results.
                </motion.p>
              ) : (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className={`result-value-big ${result.eligibleNow ? 'eligible' : 'ineligible'}`}>
                    {result.eligibleNow ? 'Eligible' : 'Not Eligible'}
                  </div>

                  <div className="stat-grid">
                    <div className="kpi-tile"><span className="num">{result.attemptsMade}</span><span className="label">Attempts Made</span></div>
                    <div className="kpi-tile"><span className="num">{result.attemptsLeft === Infinity ? '∞' : result.attemptsLeft}</span><span className="label">Remaining</span></div>
                    <div className="kpi-tile"><span className="num">{result.eligibleNow ? 'Yes' : 'No'}</span><span className="label">Eligible Now</span></div>
                    <div className="kpi-tile"><span className="num" style={{ fontSize: '13px' }}>{result.nextWindow}</span><span className="label">Next Window</span></div>
                    <div className="kpi-tile"><span className="num" style={{ fontSize: '13px' }}>{result.lastWindow}</span><span className="label">Last Window</span></div>
                    <div className="kpi-tile"><span className="num" style={{ fontSize: '13px' }}>{result.lastReal}</span><span className="label">Last Attempt</span></div>
                  </div>

                  <ul className="result-bullets">
                    {(result.detailLines || []).map((line, i) => <li key={i}>{line}</li>)}
                  </ul>

                  <div style={{ display: 'flex', gap: '10px', marginBottom: copyError ? '10px' : 0 }}>
                    <button type="button" className="btn-mini" onClick={handleCopy}>
                      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'COPIED' : 'COPY SUMMARY'}
                    </button>
                    <button type="button" className="btn-mini" onClick={handleSaveTxt}><Save size={13} /> SAVE .TXT</button>
                  </div>
                  {copyError && (
                    <p style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--coral)', fontSize: '12px' }}>
                      <AlertCircle size={13} /> Could not copy — select and copy manually.
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </main>
    </>
  )
}

export default EligibilityCalculator