export const monthsFrom = (n, unit) => unit === 'years' ? Math.round(n * 12) : Math.round(n)

export const ratePerPeriod = (apr, freq) => {
  const rYear = (+apr || 0) / 100
  if (freq === 'monthly') return rYear / 12
  if (freq === 'biweekly') return rYear / 26
  if (freq === 'weekly') return rYear / 52
  return rYear / 12
}

export const periodsFor = (months, freq) => {
  if (freq === 'monthly') return months
  if (freq === 'biweekly') return Math.round(months * 26 / 12)
  if (freq === 'weekly') return Math.round(months * 52 / 12)
  return months
}

export const currency = n => isFinite(n) ? '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'

export function emi(P, r, n) {
  if (n <= 0) return 0
  if (r === 0) return P / n
  const pow = Math.pow(1 + r, n)
  return P * r * pow / (pow - 1)
}

export function buildSchedule({ principal, apr, months, freq, prepayAmt = 0, prepayAtPeriods = null }) {
  const r = ratePerPeriod(apr, freq)
  const N = periodsFor(months, freq)
  const fixedEmi = emi(principal, r, N)
  const rows = []
  let balance = principal
  let totalInt = 0
  let totalPay = 0
  let prepayApplied = 0

  for (let k = 1; k <= N; k++) {
    const interest = r * balance
    let principalComp = fixedEmi - interest
    let prepayThis = 0

    if (prepayAmt > 0 && prepayAtPeriods && k === prepayAtPeriods) {
      prepayThis = Math.min(prepayAmt, balance)
      balance = balance - prepayThis
      prepayApplied = prepayThis
    }

    if (principalComp > balance) principalComp = balance
    const pay = principalComp + interest + prepayThis
    balance = Math.max(0, balance - principalComp)

    rows.push({ k, payment: pay, interest, principal: principalComp, balance, prepay: prepayThis })
    totalInt += interest
    totalPay += pay
    if (balance <= 0) break
  }

  return { rows, totalInterest: totalInt, totalPayment: totalPay, emiValue: fixedEmi, prepayApplied }
}

export function frequencyChip(freq) {
  if (freq === 'monthly') return 'Monthly'
  if (freq === 'biweekly') return 'Bi-weekly'
  if (freq === 'weekly') return 'Weekly'
  return 'Monthly'
}