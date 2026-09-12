import { useState, useMemo, useEffect, useRef } from 'react'
import Collapsible from '../components/Collapsible'
import CircularText from '../components/CircularText'
import { Scale, Leaf, Copy, Check, Save, AlertTriangle, Trash2, Plus } from 'lucide-react'
import {
  calcBMI, bmiCategory, bmiWhisper, idealWeightRange,
  bmrMifflin, activityFactor, bodyFatUSNavy, bodyFatClass,
  weeklyChangeNeeded, kcalFromWeekly, tipsForCategory, goalCautions,
  cmFromFtIn, kgFromLbs, cmFromIn,
} from '../utils/healthMath'

const LOG_KEY = 'toolverse_health_weightlog'
function loadLog() { try { return JSON.parse(localStorage.getItem(LOG_KEY)) ?? [] } catch { return [] } }
function saveLog(list) { try { localStorage.setItem(LOG_KEY, JSON.stringify(list)) } catch {} }

function HealthCalculator() {
  const [gender, setGender] = useState('na')
  const [heightUnit, setHeightUnit] = useState('cm')
  const [weightUnit, setWeightUnit] = useState('kg')
  const [circUnit, setCircUnit] = useState('cm')

  const [heightCmInput, setHeightCmInput] = useState('')
  const [heightFt, setHeightFt] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [weight, setWeight] = useState('')
  const [age, setAge] = useState('')
  const [activity, setActivity] = useState('sedentary')

  const [waist, setWaist] = useState('')
  const [neck, setNeck] = useState('')
  const [hip, setHip] = useState('')

  const [targetWeight, setTargetWeight] = useState('')
  const [targetTimeline, setTargetTimeline] = useState('')
  const [timelineUnit, setTimelineUnit] = useState('weeks')

  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [weightLog, setWeightLog] = useState(() => loadLog())

  // keep the previous unit around so toggling converts existing values, matching the original
  const prevWeightUnit = useRef(weightUnit)
  const prevCircUnit = useRef(circUnit)

  useEffect(() => {
    if (prevWeightUnit.current !== weightUnit && weight !== '') {
      const v = parseFloat(weight)
      if (Number.isFinite(v)) {
        const converted = weightUnit === 'kg' ? kgFromLbs(v) : v / 0.45359237
        setWeight((Math.round(converted * 10) / 10).toString())
      }
    }
    prevWeightUnit.current = weightUnit
  }, [weightUnit])

  useEffect(() => {
    if (prevCircUnit.current !== circUnit) {
      const convert = v => {
        if (v === '') return v
        const n = parseFloat(v)
        if (!Number.isFinite(n)) return v
        const converted = circUnit === 'cm' ? cmFromIn(n) : n / 2.54
        return (Math.round(converted * 10) / 10).toString()
      }
      setWaist(w => convert(w))
      setNeck(n => convert(n))
      setHip(h => convert(h))
    }
    prevCircUnit.current = circUnit
  }, [circUnit])

  const heightCm = useMemo(() => {
    if (heightUnit === 'cm') {
      const h = parseFloat(heightCmInput)
      return Number.isFinite(h) && h > 0 ? h : null
    }
    const ft = parseFloat(heightFt) || 0
    const inch = parseFloat(heightIn) || 0
    const cm = cmFromFtIn(ft, inch)
    return cm > 0 ? cm : null
  }, [heightUnit, heightCmInput, heightFt, heightIn])

  const weightKg = useMemo(() => {
    const w = parseFloat(weight)
    if (!Number.isFinite(w) || w <= 0) return null
    return weightUnit === 'kg' ? w : kgFromLbs(w)
  }, [weight, weightUnit])

  const waistCm = useMemo(() => {
    const v = parseFloat(waist)
    if (!Number.isFinite(v) || v <= 0) return null
    return circUnit === 'cm' ? v : cmFromIn(v)
  }, [waist, circUnit])

  const neckCm = useMemo(() => {
    const v = parseFloat(neck)
    if (!Number.isFinite(v) || v <= 0) return null
    return circUnit === 'cm' ? v : cmFromIn(v)
  }, [neck, circUnit])

  const hipCm = useMemo(() => {
    const v = parseFloat(hip)
    if (!Number.isFinite(v) || v <= 0) return null
    return circUnit === 'cm' ? v : cmFromIn(v)
  }, [hip, circUnit])

  const validAge = useMemo(() => {
    const a = parseFloat(age)
    return Number.isFinite(a) && a > 0 ? a : null
  }, [age])

  const heightEntered = heightUnit === 'cm' ? heightCmInput !== '' : (heightFt !== '' || heightIn !== '')
  const heightInvalid = heightEntered && heightCm == null
  const weightInvalid = weight !== '' && weightKg == null

  const bmi = heightCm && weightKg ? calcBMI(heightCm, weightKg) : null
  const category = bmi ? bmiCategory(bmi) : null
  const meterPct = bmi == null ? 0 : Math.min(Math.max(((bmi - 10) / (40 - 10)) * 100, 0), 100)
  const meterColor = bmi == null ? 'var(--muted)'
    : bmi < 18.5 ? 'var(--cobalt)'
    : bmi < 25 ? 'var(--cobalt)'
    : bmi < 30 ? 'var(--acid)'
    : 'var(--coral)'
  const chipClass = category === 'Normal' ? 'green' : (category === 'Overweight' || category === 'Underweight') ? 'amber' : category === 'Obese' ? 'red' : ''

  const bmr = validAge && heightCm && weightKg ? bmrMifflin(gender, validAge, heightCm, weightKg) : null
  const tdee = bmr ? bmr * activityFactor(activity) : null

  const bodyFat = useMemo(() => {
    if (!heightCm || !waistCm || !neckCm) return { status: 'missing' }
    const bf = bodyFatUSNavy({ gender, waist: waistCm, neck: neckCm, hip: hipCm, height: heightCm })
    if (bf === 'needs-gender') return { status: 'needs-gender' }
    if (gender === 'female' && !hipCm) return { status: 'needs-hip' }
    if (bf != null && isFinite(bf) && bf > 0 && bf < 70) return { status: 'ok', value: bf, cls: bodyFatClass(gender, bf) }
    return { status: 'invalid' }
  }, [heightCm, waistCm, neckCm, hipCm, gender])

  const weeks = targetTimeline ? (timelineUnit === 'weeks' ? parseFloat(targetTimeline) : parseFloat(targetTimeline) * 4.345) : null
  const validTargetWeight = useMemo(() => {
    const t = parseFloat(targetWeight)
    return Number.isFinite(t) && t > 0 ? t : null
  }, [targetWeight])

  const goal = useMemo(() => {
    if (!weightKg || !validTargetWeight || !weeks || weeks <= 0) return null
    const perWeek = weeklyChangeNeeded(weightKg, validTargetWeight, weeks)
    const kcalDay = kcalFromWeekly(perWeek)
    const targetDailyCalories = tdee != null ? tdee + kcalDay : null
    const cautions = goalCautions(perWeek, targetDailyCalories, gender)
    return { perWeek, kcalDay, targetDailyCalories, cautions }
  }, [weightKg, validTargetWeight, weeks, tdee, gender])

  function handleReset() {
    setGender('na'); setHeightUnit('cm'); setWeightUnit('kg'); setCircUnit('cm')
    setHeightCmInput(''); setHeightFt(''); setHeightIn(''); setWeight(''); setAge(''); setActivity('sedentary')
    setWaist(''); setNeck(''); setHip('')
    setTargetWeight(''); setTargetTimeline(''); setTimelineUnit('weeks')
  }

  function buildSummary() {
    const lines = [`BMI: ${bmi.toFixed(1)} (${category})`]
    lines.push(`Ideal weight range: ${idealWeightRange(heightCm).map(v => v.toFixed(1)).join('–')} kg`)
    if (bmr) lines.push(`BMR: ${Math.round(bmr)} kcal/day  •  TDEE: ${Math.round(tdee)} kcal/day`)
    if (bodyFat.status === 'ok') lines.push(`Body fat: ${bodyFat.value.toFixed(1)}% (${bodyFat.cls})`)
    if (goal) lines.push(`Goal: ${goal.perWeek >= 0 ? '+' : ''}${goal.perWeek.toFixed(2)} kg/week  •  ~${Math.abs(Math.round(goal.kcalDay))} kcal/day ${goal.perWeek < 0 ? 'deficit' : 'surplus'}`)
    return lines.join('\n')
  }

  async function handleCopy() {
    if (bmi == null) return
    try {
      await navigator.clipboard.writeText(buildSummary())
      setCopied(true); setCopyError(false)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopyError(true)
      setTimeout(() => setCopyError(false), 2000)
    }
  }

  function handleSaveTxt() {
    if (bmi == null) return
    const blob = new Blob([buildSummary()], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'health-summary.txt'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function handleLogWeight() {
    if (!weightKg) return
    const entry = { date: new Date().toISOString().slice(0, 10), weightKg, bmi: bmi != null ? Math.round(bmi * 10) / 10 : null }
    const next = [entry, ...weightLog].slice(0, 30)
    setWeightLog(next)
    saveLog(next)
  }

  function removeLogEntry(index) {
    const next = weightLog.filter((_, i) => i !== index)
    setWeightLog(next)
    saveLog(next)
  }

  function clearLog() {
    setWeightLog([])
    saveLog([])
  }

  return (
    <>
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb"><span className="cat">CALCULATOR</span><span className="num">CATALOG NO. 005</span></div>
            <h1>Health</h1>
            <p>Calculate BMI and explore BMR, body fat, and gentle goal guidance.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">CLIENT-SIDE</span>
              <span className="tool-chip">LIVE CALCULATION</span>
            </div>
          </div>
          <CircularText text="VITALS.SYS • METABOLIC ENGINE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '44px 40px 100px' }}>
        <div className="tool-workbench">

          {/* INPUTS */}
          <div className="panel-card">
            <div className="panel-head">
              <h2>Inputs</h2>
              <div className="seg tiny" style={{ maxWidth: '260px' }}>
                <label><input type="radio" name="gender" checked={gender === 'male'} onChange={() => setGender('male')} />Male</label>
                <label><input type="radio" name="gender" checked={gender === 'female'} onChange={() => setGender('female')} />Female</label>
                <label><input type="radio" name="gender" checked={gender === 'na'} onChange={() => setGender('na')} />Prefer not</label>
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Height Unit</label>
                <div className="seg">
                  <label><input type="radio" checked={heightUnit === 'cm'} onChange={() => setHeightUnit('cm')} />cm</label>
                  <label><input type="radio" checked={heightUnit === 'ftin'} onChange={() => setHeightUnit('ftin')} />ft/in</label>
                </div>
              </div>
              <div className="field">
                <label>Weight Unit</label>
                <div className="seg">
                  <label><input type="radio" checked={weightUnit === 'kg'} onChange={() => setWeightUnit('kg')} />kg</label>
                  <label><input type="radio" checked={weightUnit === 'lbs'} onChange={() => setWeightUnit('lbs')} />lbs</label>
                </div>
              </div>
            </div>

            <div className="field-row">
              {heightUnit === 'cm' ? (
                <div className="field"><label>Height (cm)</label><input type="number" value={heightCmInput} onChange={e => setHeightCmInput(e.target.value)} placeholder="e.g., 175" /></div>
              ) : (
                <>
                  <div className="field"><label>Feet</label><input type="number" value={heightFt} onChange={e => setHeightFt(e.target.value)} placeholder="ft" /></div>
                  <div className="field"><label>Inches</label><input type="number" value={heightIn} onChange={e => setHeightIn(e.target.value)} placeholder="in" /></div>
                </>
              )}
              <div className="field"><label>Weight</label><input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder={weightUnit === 'kg' ? 'e.g., 68' : 'e.g., 150'} /></div>
            </div>

            {heightInvalid && <p style={{ color: 'var(--coral)', fontSize: '12px', marginBottom: '10px' }}>Height needs to be a positive number.</p>}
            {weightInvalid && <p style={{ color: 'var(--coral)', fontSize: '12px', marginBottom: '10px' }}>Weight needs to be a positive number.</p>}

            <div className="field-row">
              <div className="field"><label>Age (optional)</label><input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="e.g., 28" /></div>
              <div className="field"><label>Activity</label>
                <select value={activity} onChange={e => setActivity(e.target.value)}>
                  <option value="sedentary">Sedentary</option><option value="light">Light</option>
                  <option value="moderate">Moderate</option><option value="intense">Intense</option>
                  <option value="veryintense">Very Intense</option>
                </select>
              </div>
              {gender === 'female' && (
                <div className="field"><label>Hip</label><input type="number" value={hip} onChange={e => setHip(e.target.value)} placeholder={circUnit === 'cm' ? 'cm' : 'in'} /></div>
              )}
            </div>

            <Collapsible title="Body Measurements (optional)">
              <div className="field-row">
                <div className="field"><label>Waist</label><input type="number" value={waist} onChange={e => setWaist(e.target.value)} placeholder={circUnit === 'cm' ? 'cm' : 'in'} /></div>
                <div className="field"><label>Neck</label><input type="number" value={neck} onChange={e => setNeck(e.target.value)} placeholder={circUnit === 'cm' ? 'cm' : 'in'} /></div>
              </div>
              <div className="field">
                <label>Measure Unit</label>
                <div className="seg">
                  <label><input type="radio" checked={circUnit === 'cm'} onChange={() => setCircUnit('cm')} />cm</label>
                  <label><input type="radio" checked={circUnit === 'in'} onChange={() => setCircUnit('in')} />in</label>
                </div>
              </div>
            </Collapsible>

            <Collapsible title="Goal Tracker (optional)">
              <div className="field-row">
                <div className="field"><label>Target Weight</label><input type="number" value={targetWeight} onChange={e => setTargetWeight(e.target.value)} placeholder="e.g., 65" /></div>
                <div className="field"><label>Timeline</label><input type="number" value={targetTimeline} onChange={e => setTargetTimeline(e.target.value)} placeholder="e.g., 8" /></div>
                <div className="field"><label>Unit</label>
                  <select value={timelineUnit} onChange={e => setTimelineUnit(e.target.value)}>
                    <option value="weeks">Weeks</option><option value="months">Months</option>
                  </select>
                </div>
              </div>
            </Collapsible>

            <Collapsible title="Weight Log (optional)">
              <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>Log today's weight to see your trend over time. Stored only in this browser.</p>
              <button type="button" className="btn-mini" onClick={handleLogWeight} disabled={!weightKg} style={{ marginBottom: '14px' }}>
                <Plus size={13} /> LOG TODAY'S WEIGHT
              </button>
              {weightLog.length > 0 && (
                <>
                  {(() => {
                    const maxW = Math.max(...weightLog.map(e => e.weightKg))
                    const minW = Math.min(...weightLog.map(e => e.weightKg))
                    const range = maxW - minW || 1
                    return (
                      <ul className="tips-list" style={{ listStyle: 'none', padding: 0 }}>
                        {weightLog.map((entry, i) => (
                          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--muted)', width: '78px', flexShrink: 0 }}>{entry.date}</span>
                            <div style={{ flex: 1, height: '6px', background: 'var(--panel)', border: '1px solid var(--muted)', position: 'relative' }}>
                              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${((entry.weightKg - minW) / range) * 100}%`, minWidth: '4px', background: 'var(--cobalt)' }} />
                            </div>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', width: '54px', textAlign: 'right', flexShrink: 0 }}>{entry.weightKg.toFixed(1)}kg</span>
                            <button type="button" className="btn-mini" style={{ padding: '4px' }} onClick={() => removeLogEntry(i)} aria-label="Remove this log entry"><Trash2 size={11} /></button>
                          </li>
                        ))}
                      </ul>
                    )
                  })()}
                  <button type="button" className="btn-mini" onClick={clearLog} style={{ marginTop: '8px' }}>CLEAR LOG</button>
                </>
              )}
            </Collapsible>

            <button type="button" className="btn-mini" onClick={handleReset} style={{ marginTop: '10px' }}>RESET</button>
          </div>

          {/* RESULTS */}
          <div className="panel-card">
            <div className="panel-head"><h2>Preview</h2></div>

            {bmi == null ? (
              <p style={{ color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}>
                Enter height and weight to see tailored guidance.
              </p>
            ) : (
              <>
                <div className="panel-head" style={{ border: 'none', paddingBottom: 0, marginBottom: '10px' }}>
                  <h2 style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}><Scale size={14} /> BMI</h2>
                  <span className={`chip-status ${chipClass}`}>{category}</span>
                </div>
                <div className="bmi-meter"><div className="bmi-meter-fill" style={{ width: `${meterPct}%`, background: meterColor }}></div></div>
                <p className="result-readout"><strong>{bmi.toFixed(1)}</strong> BMI · Ideal: <strong>{idealWeightRange(heightCm).map(v => v.toFixed(1)).join('–')} kg</strong></p>
                <p className="whisper-line">{bmiWhisper(category)}</p>
                <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px', marginBottom: '16px' }}>
                  BMI doesn't account for muscle mass, bone density, or body composition — it's a general screening tool, not a diagnosis.
                </p>

                <Collapsible title="BMR & Calories">
                  {bmr ? (
                    <>
                      <div className="field-row">
                        <div className="kpi-tile"><span className="num">{Math.round(bmr)}</span><span className="label">BMR kcal/day</span></div>
                        <div className="kpi-tile"><span className="num">{Math.round(tdee)}</span><span className="label">TDEE kcal/day</span></div>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '10px' }}>To stay where you are, you need ~{Math.round(tdee)} kcal/day.</p>
                    </>
                  ) : <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Add your age to see BMR and daily calories.</p>}
                </Collapsible>

                <Collapsible title="Body Fat">
                  {bodyFat.status === 'ok' ? (
                    <>
                      <div className="field-row">
                        <div className="kpi-tile"><span className="num">{bodyFat.value.toFixed(1)}%</span><span className="label">Body Fat</span></div>
                        <div className="kpi-tile"><span className="num" style={{ fontSize: '14px' }}>{bodyFat.cls}</span><span className="label">Classification</span></div>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '10px' }}>U.S. Navy method using height, neck, waist, and hip (for females).</p>
                    </>
                  ) : (
                    <p style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {bodyFat.status === 'needs-gender' ? 'Select Male or Female above — the formula differs by gender.'
                        : bodyFat.status === 'needs-hip' ? 'Add a hip measurement — the female formula needs it.'
                        : 'Enter waist and neck measurements for an estimate.'}
                    </p>
                  )}
                </Collapsible>

                <Collapsible title="Goals">
                  {goal ? (
                    <>
                      <div className="field-row">
                        <div className="kpi-tile"><span className="num">{goal.perWeek >= 0 ? '+' : ''}{goal.perWeek.toFixed(2)}</span><span className="label">kg / week</span></div>
                        <div className="kpi-tile"><span className="num">{goal.perWeek >= 0 ? '+' : ''}{Math.round(goal.kcalDay)}</span><span className="label">kcal / day</span></div>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '10px' }}>
                        To reach {targetWeight}kg in {weeks.toFixed(1)} weeks, aim for ~{Math.abs(Math.round(goal.kcalDay))} kcal {goal.perWeek < 0 ? 'deficit' : 'surplus'}/day
                        {goal.targetDailyCalories != null && <> (roughly {Math.round(goal.targetDailyCalories)} kcal/day total, based on your TDEE)</>}.
                      </p>
                      {goal.cautions.length > 0 && (
                        <div style={{ marginTop: '10px', padding: '10px', border: '1px solid var(--coral)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {goal.cautions.map((c, i) => (
                            <p key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '11px', color: 'var(--coral)', margin: 0 }}>
                              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '1px' }} /> {c}
                            </p>
                          ))}
                        </div>
                      )}
                    </>
                  ) : <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Enter target weight and a timeline to see the path.</p>}
                </Collapsible>

                <div style={{ marginTop: '16px' }}>
                  <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '13px', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><Leaf size={14} /> Health Tips</h3>
                  <ul className="tips-list">
                    {tipsForCategory(category).map((tip, i) => <li key={i}>{tip}</li>)}
                  </ul>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button type="button" className="btn-mini" onClick={handleCopy}>
                    {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'COPIED' : 'COPY SUMMARY'}
                  </button>
                  <button type="button" className="btn-mini" onClick={handleSaveTxt}><Save size={13} /> SAVE .TXT</button>
                </div>
                {copyError && (
                  <p style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--coral)', fontSize: '12px', marginTop: '10px' }}>
                    <AlertTriangle size={13} /> Could not copy — select and copy manually.
                  </p>
                )}
              </>
            )}
          </div>

        </div>
      </main>
    </>
  )
}

export default HealthCalculator