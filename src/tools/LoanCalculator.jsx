import { useState, useEffect, useRef, useMemo } from 'react'
import Collapsible from '../components/Collapsible'
import CircularText from '../components/CircularText'
import { Copy, Check, AlertCircle } from 'lucide-react'
import { buildSchedule, periodsFor, currency, frequencyChip, monthsFrom } from '../utils/loanMath'

function LoanCalculator() {
  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState('')
  const [tenure, setTenure] = useState('')
  const [tenureUnit, setTenureUnit] = useState('months')
  const [freq, setFreq] = useState('monthly')
  const [downPayment, setDownPayment] = useState('')
  const [processingFee, setProcessingFee] = useState('')
  const [loanType, setLoanType] = useState('personal')
  const [age, setAge] = useState('')
  const [prepayAmount, setPrepayAmount] = useState('')
  const [prepayAt, setPrepayAt] = useState('')
  const [prepayUnit, setPrepayUnit] = useState('months')

  const [altRate, setAltRate] = useState('')
  const [altTenure, setAltTenure] = useState('')
  const [altTenureUnit, setAltTenureUnit] = useState('months')
  const [altDownPayment, setAltDownPayment] = useState('')
  const [altProcessingFee, setAltProcessingFee] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  const canvasRef = useRef(null)

  const months = useMemo(() => {
    const t = parseInt(tenure, 10) || 0
    return monthsFrom(t, tenureUnit)
  }, [tenure, tenureUnit])

  const principal = useMemo(() => {
    const amt = parseInt(amount, 10) || 0
    const dp = parseInt(downPayment, 10) || 0
    const fee = parseInt(processingFee, 10) || 0
    return Math.max(0, amt - dp + fee)
  }, [amount, downPayment, processingFee])

  const rateNum = rate === '' ? null : parseFloat(rate)
  const rateValid = rateNum !== null && !isNaN(rateNum) && rateNum >= 0
  const hasAmount = !!amount && parseInt(amount, 10) > 0
  const hasTenure = months > 0
  const isValid = hasAmount && hasTenure && rateValid && principal > 0

  const prepayAtPeriods = useMemo(() => {
    const p = parseInt(prepayAt, 10)
    if (!p) return null
    const pMonths = prepayUnit === 'years' ? p * 12 : p
    return periodsFor(pMonths, freq)
  }, [prepayAt, prepayUnit, freq])

  const schedule = useMemo(() => {
    if (!isValid) return null
    return buildSchedule({
      principal, apr: rateNum, months, freq,
      prepayAmt: parseInt(prepayAmount, 10) || 0,
      prepayAtPeriods,
    })
  }, [isValid, principal, rateNum, months, freq, prepayAmount, prepayAtPeriods])

  // draw the principal/interest pie whenever the schedule changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    ctx.clearRect(0, 0, w, h)
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 10

    const interest = schedule ? schedule.totalInterest : 0
    const p = schedule ? principal : 0
    const total = Math.max(1, p + interest)
    const angInterest = (interest / total) * Math.PI * 2

    ctx.beginPath(); ctx.moveTo(cx, cy)
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--coral').trim() || '#FF4B3E'
    ctx.arc(cx, cy, r, 0, angInterest); ctx.closePath(); ctx.fill()

    ctx.beginPath(); ctx.moveTo(cx, cy)
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--cobalt').trim() || '#2440FF'
    ctx.arc(cx, cy, r, angInterest, Math.PI * 2); ctx.closePath(); ctx.fill()
  }, [schedule, principal])

  const timelineNote = useMemo(() => {
    if (!isValid) {
      if (!hasAmount || !hasTenure) return { text: 'Enter amount, rate, and tenure to begin.', warn: false }
      if (!rateValid) return { text: "Interest rate can't be negative — enter 0 or higher.", warn: true }
      return { text: 'Down payment and fees leave nothing left to borrow — adjust the numbers.', warn: true }
    }
    const endAge = age ? (parseInt(age, 10) + months / 12) : null
    const timeline = `${Math.floor(months / 12)}y ${months % 12}m`
    let text = endAge ? `You'll be debt-free in ~${timeline}, around age ${Math.round(endAge)}.` : `You'll be debt-free in ~${timeline}.`
    if (schedule && schedule.prepayApplied > 0) {
      const N = periodsFor(months, freq)
      const finishedEarly = schedule.rows.length < N
      text += ` A ${currency(Math.round(schedule.prepayApplied))} prepayment is included in the totals below`
      text += finishedEarly ? `, closing the loan ${N - schedule.rows.length} payment${N - schedule.rows.length === 1 ? '' : 's'} early.` : '.'
    }
    return { text, warn: false }
  }, [isValid, hasAmount, hasTenure, rateValid, age, months, schedule, freq])

  const poeticLine = {
    home: 'This shelter is patient—stone and breath.',
    education: 'This knowledge has a cost; its returns are quiet and compounding.',
    vehicle: 'Wheels turn, seasons change—keep pace, keep grace.',
  }[loanType] || 'This loan walks beside you—steady, not silent.'

  function handleExportCsv() {
    if (!schedule) return
    const lines = ['#,Payment,Interest,Principal,Prepayment,Balance']
    schedule.rows.forEach(row => {
      lines.push([row.k, Math.round(row.payment), Math.round(row.interest), Math.round(row.principal), Math.round(row.prepay || 0), Math.round(row.balance)].join(','))
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'amortization-schedule.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const altRateValid = altRate === '' || (!isNaN(parseFloat(altRate)) && parseFloat(altRate) >= 0)

  // Live, not button-triggered — the old version only recomputed on click,
  // so changing any input afterward (main loan or alt fields) left the
  // comparison silently showing numbers from before the change.
  const compareResult = useMemo(() => {
    if (!isValid || !altRateValid) return null

    const aRate = altRate === '' ? rateNum : parseFloat(altRate)
    const aMonths = altTenure ? monthsFrom(parseInt(altTenure, 10) || 0, altTenureUnit) : months
    const aDown = altDownPayment === '' ? null : parseInt(altDownPayment, 10)
    const aFee = altProcessingFee === '' ? null : parseInt(altProcessingFee, 10)
    const aPrincipal = (aDown != null || aFee != null)
      ? Math.max(0, (parseInt(amount, 10) || 0) - (aDown ?? 0) + (aFee ?? 0))
      : principal

    if (aMonths <= 0 || aPrincipal <= 0) return null

    return buildSchedule({
      principal: aPrincipal, apr: aRate, months: aMonths, freq,
      prepayAmt: parseInt(prepayAmount, 10) || 0, prepayAtPeriods,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid, altRateValid, altRate, rateNum, altTenure, altTenureUnit, months, altDownPayment, altProcessingFee, amount, principal, freq, prepayAmount, prepayAtPeriods])

  function handleReset() {
    setAmount(''); setRate(''); setTenure(''); setTenureUnit('months'); setFreq('monthly')
    setDownPayment(''); setProcessingFee(''); setLoanType('personal'); setAge('')
    setPrepayAmount(''); setPrepayAt(''); setPrepayUnit('months')
    setAltRate(''); setAltTenure(''); setAltTenureUnit('months')
    setAltDownPayment(''); setAltProcessingFee(''); setCompareHint('')
  }

  async function handleCopySummary() {
    if (!isValid || !schedule) return
    const lines = [
      `${frequencyChip(freq)} EMI: ${currency(Math.round(schedule.emiValue))}`,
      `Total Interest: ${currency(Math.round(schedule.totalInterest))}`,
      `Total Payment: ${currency(Math.round(schedule.totalPayment))}`,
      `Payments: ${periodsFor(months, freq)}`,
      timelineNote.text,
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
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
            <div className="tool-crumb"><span className="cat">CALCULATOR</span><span className="num">CATALOG NO. 006</span></div>
            <h1>Loan &amp; EMI</h1>
            <p>Plan EMIs, visualize interest vs principal, and see a clear path to freedom.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">CLIENT-SIDE</span>
              <span className="tool-chip">LIVE CALCULATION</span>
            </div>
          </div>
          <CircularText text="FINANCE.SYS • AMORTIZATION ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>
        <div className="tool-workbench">

          {/* INPUTS */}
          <div className="panel-card">
            <div className="panel-head"><h2>Inputs</h2></div>

            <div className="field-row">
              <div className="field"><label>Loan Amount</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g., 500000" /></div>
              <div className="field"><label>Interest Rate (%)</label><input type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="e.g., 10.5" /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Tenure</label><input type="number" value={tenure} onChange={e => setTenure(e.target.value)} placeholder="e.g., 24" /></div>
              <div className="field"><label>Unit</label><select value={tenureUnit} onChange={e => setTenureUnit(e.target.value)}><option value="months">Months</option><option value="years">Years</option></select></div>
              <div className="field"><label>Frequency</label><select value={freq} onChange={e => setFreq(e.target.value)}><option value="monthly">Monthly</option><option value="biweekly">Bi-weekly</option><option value="weekly">Weekly</option></select></div>
            </div>

            <Collapsible title="Costs & Adjustments (optional)">
              <div className="field-row">
                <div className="field"><label>Down Payment</label><input type="number" value={downPayment} onChange={e => setDownPayment(e.target.value)} placeholder="e.g., 100000" /></div>
                <div className="field"><label>Processing Fee</label><input type="number" value={processingFee} onChange={e => setProcessingFee(e.target.value)} placeholder="e.g., 1500" /></div>
                <div className="field"><label>Loan Type</label>
                  <select value={loanType} onChange={e => setLoanType(e.target.value)}>
                    <option value="personal">Personal</option><option value="home">Home</option>
                    <option value="vehicle">Vehicle</option><option value="education">Education</option><option value="other">Other</option>
                  </select>
                </div>
              </div>
            </Collapsible>

            <Collapsible title="Borrower Profile (optional)">
              <div className="field-row">
                <div className="field"><label>Age</label><input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="e.g., 24" /></div>
              </div>
            </Collapsible>

            <Collapsible title="Early Repayment Simulation">
              <div className="field-row">
                <div className="field"><label>One-time Prepayment</label><input type="number" value={prepayAmount} onChange={e => setPrepayAmount(e.target.value)} placeholder="e.g., 50000" /></div>
                <div className="field"><label>Prepay After</label><input type="number" value={prepayAt} onChange={e => setPrepayAt(e.target.value)} placeholder="e.g., 6" /></div>
                <div className="field"><label>Unit</label><select value={prepayUnit} onChange={e => setPrepayUnit(e.target.value)}><option value="months">Months</option><option value="years">Years</option></select></div>
              </div>
            </Collapsible>

            <button type="button" className="btn-mini" onClick={handleReset} style={{ marginTop: '10px' }}>RESET</button>
          </div>

          {/* RESULTS */}
          <div className="panel-card">
            <div className="panel-head"><h2>Preview</h2></div>

            {!isValid ? (
              <p style={{ color: timelineNote.warn ? 'var(--coral)' : 'var(--muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}>
                {timelineNote.text}
              </p>
            ) : (
              <>
                <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', marginBottom: '16px' }}>
                  {frequencyChip(freq)} EMI {currency(Math.round(schedule.emiValue))} · {periodsFor(months, freq)} payments
                </p>

                <div className="field-row">
                  <div className="kpi-tile"><span className="num">{currency(Math.round(schedule.emiValue))}</span><span className="label">Installment</span></div>
                  <div className="kpi-tile"><span className="num">{currency(Math.round(schedule.totalInterest))}</span><span className="label">Total Interest</span></div>
                  <div className="kpi-tile"><span className="num">{currency(Math.round(schedule.totalPayment))}</span><span className="label">Total Payment</span></div>
                </div>

                <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--muted)', marginTop: '12px' }}>{timelineNote.text}</p>
                <p className="poetic-line">{poeticLine}</p>

                <button type="button" className="btn-mini" onClick={handleCopySummary} style={{ marginTop: '4px' }}>
                  {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'COPIED' : 'COPY SUMMARY'}
                </button>
                {copyError && (
                  <p style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--coral)', fontSize: '12px', marginTop: '8px' }}>
                    <AlertCircle size={13} /> Could not copy — select and copy manually.
                  </p>
                )}

                <div style={{ marginTop: '20px' }}>
                  <canvas ref={canvasRef} width="360" height="180" style={{ width: '100%', maxWidth: '360px' }}></canvas>
                  <div className="legend">
                    <span><i className="swatch principal"></i>Principal {currency(Math.round(principal))}</span>
                    <span><i className="swatch interest"></i>Interest {currency(Math.round(schedule.totalInterest))}</span>
                  </div>
                </div>

                <Collapsible title="Amortization Schedule">
                  <button type="button" className="btn-mini" onClick={handleExportCsv} style={{ marginBottom: '12px' }}>EXPORT CSV</button>
                  <div style={{ maxHeight: '340px', overflow: 'auto' }}>
                    <table className="amo-table">
                      <thead><tr><th>#</th><th>Payment</th><th>Interest</th><th>Principal</th><th>Balance</th></tr></thead>
                      <tbody>
                        {schedule.rows.map(row => (
                          <tr key={row.k}>
                            <td>{row.k}</td>
                            <td>{currency(Math.round(row.payment))}{row.prepay > 0 && <span className="prepay-tag"> +{currency(Math.round(row.prepay))}</span>}</td>
                            <td>{currency(Math.round(row.interest))}</td>
                            <td>{currency(Math.round(row.principal))}</td>
                            <td>{currency(Math.round(row.balance))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Collapsible>

                <Collapsible title="Compare Scenarios">
                  <div className="field-row">
                    <div className="field"><label>Alt. Rate %</label><input type="number" step="0.01" value={altRate} onChange={e => setAltRate(e.target.value)} placeholder="e.g., 9.8" /></div>
                    <div className="field"><label>Alt. Tenure</label><input type="number" value={altTenure} onChange={e => setAltTenure(e.target.value)} placeholder="e.g., 60" /></div>
                    <div className="field"><label>Unit</label><select value={altTenureUnit} onChange={e => setAltTenureUnit(e.target.value)}><option value="months">Months</option><option value="years">Years</option></select></div>
                  </div>
                  <div className="field-row">
                    <div className="field"><label>Alt. Down Payment</label><input type="number" value={altDownPayment} onChange={e => setAltDownPayment(e.target.value)} placeholder="same as current" /></div>
                    <div className="field"><label>Alt. Processing Fee</label><input type="number" value={altProcessingFee} onChange={e => setAltProcessingFee(e.target.value)} placeholder="same as current" /></div>
                  </div>
                  {!altRateValid && (
                    <p style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--coral)', fontSize: '12px', marginBottom: '10px' }}>
                      <AlertCircle size={13} /> Alt. rate can't be negative — enter 0 or higher.
                    </p>
                  )}

                  {compareResult && (
                    <div className="compare-grid">
                      <div className="compare-col">
                        <h5>Current</h5>
                        <div className="compare-row"><span>EMI</span><strong>{currency(Math.round(schedule.emiValue))}</strong></div>
                        <div className="compare-row"><span>Total Interest</span><strong>{currency(Math.round(schedule.totalInterest))}</strong></div>
                        <div className="compare-row"><span>Total Payment</span><strong>{currency(Math.round(schedule.totalPayment))}</strong></div>
                      </div>
                      <div className="compare-col">
                        <h5>Alternative</h5>
                        <div className="compare-row"><span>EMI</span><strong>{currency(Math.round(compareResult.emiValue))}</strong></div>
                        <div className="compare-row"><span>Total Interest</span><strong>{currency(Math.round(compareResult.totalInterest))}</strong></div>
                        <div className="compare-row"><span>Total Payment</span><strong>{currency(Math.round(compareResult.totalPayment))}</strong></div>
                      </div>
                    </div>
                  )}
                </Collapsible>
              </>
            )}
          </div>

        </div>
      </main>
    </>
  )
}

export default LoanCalculator