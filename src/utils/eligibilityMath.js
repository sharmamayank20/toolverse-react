import { SCHEMA, EXAM_META } from './eligibilityData'

export function makeDateFromParts(y, m, d) {
  if (!y || !m || !d) return null
  const dt = new Date(Number(y), Number(m) - 1, Number(d))
  if (isNaN(dt.getTime()) || dt.getFullYear() !== Number(y) || (dt.getMonth() + 1) !== Number(m) || dt.getDate() !== Number(d)) return null
  return dt
}
export function yearsBetween(d1, d2) {
  let years = d2.getFullYear() - d1.getFullYear()
  const m1 = d1.getMonth(), m2 = d2.getMonth()
  if (m2 < m1 || (m2 === m1 && d2.getDate() < d1.getDate())) years--
  return years
}
export function addMonths(d, m) { const x = new Date(d); x.setMonth(x.getMonth() + m); return x }
export function fmtMonthYear(d) { return d.toLocaleString('en-IN', { month: 'short', year: 'numeric' }) }

const buildAnnualRange = (today = new Date(), pastYears = 20, futureYears = 15) =>
  Array.from({ length: pastYears + futureYears + 1 }, (_, i) => addMonths(today, (i - pastYears) * 12))
const buildSemiAnnualRange = (today = new Date(), pastYears = 20, futureYears = 15) =>
  Array.from({ length: (pastYears + futureYears) * 2 + 1 }, (_, i) => addMonths(today, (i - pastYears * 2) * 6))

/* ---------------- CDS bespoke module ---------------- */

function cdsEduOK(service, edu) { return (SCHEMA.CDS.education[service] || []).includes(edu) }
function maritalAllowedCDS(service, married) {
  const rule = SCHEMA.CDS.marital[service]
  const flag = married ? "Married" : "Unmarried"
  return rule ? rule.allowed.includes(flag) : true
}
function ageOkCDS(service, dob, refDate, ctx = {}) {
  const age = yearsBetween(dob, refDate)
  const band = SCHEMA.CDS.ages[service]; if (!band) return false
  const max = (service === "AFA" && ctx.cpl) ? band.cplMax : band.max
  return age >= band.min && age <= max
}
function buildCDSCyclesForward(today = new Date()) {
  const out = []; const startY = today.getFullYear(), endY = startY + 8
  SCHEMA.CDS.cycles.forEach(cyc => {
    for (let y = startY; y <= endY; y++) {
      const written = new Date(y, cyc.writtenMonth - 1, 1)
      if (written < today) continue
      const commence = new Date(y + 1, cyc.commenceMonth - 1, cyc.commenceDay)
      out.push({ cycle: cyc.name, year: y, written, commence })
    }
  })
  return out
}
function cdsCommencementDateFor(cycleName, examYear) {
  if (cycleName === "CDS I") return new Date(examYear + 1, 0, 1)
  if (cycleName === "CDS II") return new Date(examYear + 1, 6, 1)
  return null
}
function allCDSCyclesInRange(startYear, endYear) {
  const out = []
  for (let y = startYear; y <= endYear; y++) {
    out.push({ cycle: "CDS I", examYear: y, commence: cdsCommencementDateFor("CDS I", y) })
    out.push({ cycle: "CDS II", examYear: y, commence: cdsCommencementDateFor("CDS II", y) })
  }
  return out
}

function findLastCDS(dob, edu, married, service, cpl) {
  if (!cdsEduOK(service, edu)) return { found: false, reason: "Education qualification not met for this academy." }
  if (!maritalAllowedCDS(service, married)) return { found: false, reason: "Marital status not permitted for this academy." }

  const band = SCHEMA.CDS.ages[service]
  if (!band) return { found: false, reason: "Unknown service." }

  // A brute-force scan over a bounded range is far simpler to get right than
  // working backward from a computed "cap year" — the previous shortcut
  // silently skipped valid later cycles for candidates whose birthday fell
  // after CDS II's July commencement month, undercounting by up to a full
  // cycle. Scanning a small, bounded set of candidate dates and filtering by
  // actual age is trivial to verify correct and can't have that class of bug.
  const maxCap = (service === "AFA" && cpl) ? band.cplMax : band.max
  const startYear = dob.getFullYear() + Math.floor(band.min) - 2
  const endYear = dob.getFullYear() + Math.ceil(maxCap) + 2
  const candidates = allCDSCyclesInRange(startYear, endYear)
    .filter(c => ageOkCDS(service, dob, c.commence, { cpl }))
    .sort((a, b) => a.commence - b.commence)

  if (candidates.length === 0) return { found: false, reason: "No age-eligible cycle found in search horizon." }
  const last = candidates[candidates.length - 1]
  return { found: true, cycle: last.cycle, year: last.examYear, commence: last.commence }
}

export function computeCDS(dob, edu, married, cpl, prevAttempts, service) {
  const result = findLastCDS(dob, edu, married, service, cpl)
  const attemptsMade = Math.max(0, Number(prevAttempts) || 0)
  const lines = [`Preference: ${service}`]

  const forward = buildCDSCyclesForward(new Date())
  const upcomingElig = forward.filter(c => ageOkCDS(service, dob, c.commence, { cpl }) && cdsEduOK(service, edu) && maritalAllowedCDS(service, married))
  const next = upcomingElig[0] || null

  if (!result.found) {
    return {
      attemptsMade, attemptsLeft: 0, eligibleNow: !!next,
      nextWindow: next ? `${next.cycle} ${next.year} → Commences ${fmtMonthYear(next.commence)}` : "None",
      lastWindow: "None", lastReal: "None",
      detailLines: [...lines, result.reason],
    }
  }

  const lastAttemptLabel = `${result.cycle} ${result.year}`
  const attemptsLeft = Math.max(0, upcomingElig.length - attemptsMade)
  const lastWindow = `${result.cycle} ${result.year} → Commences ${fmtMonthYear(result.commence)}`
  lines.push(`Last Attempt (age at commencement): ${lastAttemptLabel}`)
  if (next) lines.push(`Next Window: ${next.cycle} ${next.year} → Commences ${fmtMonthYear(next.commence)}`)
  lines.push(`Last Window: ${lastWindow}`)
  if (cpl && service === 'AFA') lines.push('CPL relaxation considered.')
  if (!next) lines.push(`This academy's age window appears to have passed — the last eligible cycle was ${lastAttemptLabel}.`)

  return {
    attemptsMade, attemptsLeft, eligibleNow: !!next,
    nextWindow: next ? `${next.cycle} ${next.year} → Commences ${fmtMonthYear(next.commence)}` : "None",
    lastWindow, lastReal: lastAttemptLabel, detailLines: lines,
  }
}

/* ---------------- Generic engine ---------------- */

export function computeGeneric(examKey, dob, edu, cat, married, prevAttempts, ctx = {}) {
  const cfg = EXAM_META[examKey]
  if (!cfg) return { attemptsMade: 0, attemptsLeft: 0, eligibleNow: false, nextWindow: "—", lastWindow: "—", lastReal: "—", detailLines: ["Exam not recognized."] }

  const attemptsMade = Math.max(0, Number(prevAttempts) || 0)
  const fullCtx = { ...ctx, edu, cat, married }

  const minAge = cfg.noAgeLimit ? -Infinity : (typeof cfg.minAge === "function" ? cfg.minAge(cat, fullCtx) : cfg.minAge)
  const maxAge = cfg.noAgeLimit ? Infinity : (typeof cfg.maxAge === "function" ? cfg.maxAge(cat, fullCtx) : cfg.maxAge)
  const noUpperCap = maxAge === Infinity
  const eduOK = cfg.eduCheck(edu, fullCtx)
  const maritalOK = cfg.maritalCheck ? cfg.maritalCheck(married, fullCtx) : true
  const gateOK = cfg.gateCheck ? cfg.gateCheck(fullCtx) : true

  const windowsFn = cfg.cadence === "semiannual" ? buildSemiAnnualRange : buildAnnualRange
  const allWindows = windowsFn()
  const eligWindows = allWindows.filter(ref => { const a = yearsBetween(dob, ref); return a >= minAge && a <= maxAge })
  const now = new Date()
  const futureElig = eligWindows.filter(d => d >= now)
  const next = futureElig[0] || null
  // The chronologically last eligible window overall — may be in the past
  // (already aged out) or the future (haven't reached the cap yet). Reporting
  // a real past date here instead of a bare "None" is what actually answers
  // "when was my last shot at this" for someone past the age window.
  const last = eligWindows[eligWindows.length - 1] || null
  const agedOut = !next && !!last

  const attemptsLeft = cfg.limitedAttempts ? Math.max(0, futureElig.length - attemptsMade) : Infinity
  const eligibleNow = !!next && eduOK && maritalOK && gateOK

  const lines = cfg.lines({ minAge, maxAge, eduOK, maritalOK, gateOK, ctx: fullCtx, edu })
  if (!gateOK && cfg.gateCheck) lines.push("Complete the required selection above to confirm eligibility.")
  if (agedOut) lines.push(`This exam's age window appears to have passed — the last eligible cycle was around ${fmtMonthYear(last)}.`)

  return {
    attemptsMade, attemptsLeft, eligibleNow,
    nextWindow: next ? fmtMonthYear(next) : "None",
    lastWindow: noUpperCap ? "No upper age limit" : (last ? fmtMonthYear(last) : "None"),
    lastReal: noUpperCap ? "No upper age limit" : (last ? fmtMonthYear(last) : "None"),
    detailLines: lines,
  }
}