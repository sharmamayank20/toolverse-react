export function isValidDate(year, month, day) {
  const dt = new Date(year, month - 1, day)
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day
}

export function addToDate(date, amount, unit) {
  const d = new Date(date)
  if (unit === 'day') d.setDate(d.getDate() + amount)
  else if (unit === 'week') d.setDate(d.getDate() + amount * 7)
  else if (unit === 'month' || unit === 'year') {
    const origDay = d.getDate()
    const origMonth = d.getMonth()
    d.setDate(1)
    if (unit === 'month') d.setMonth(d.getMonth() + amount)
    else { d.setFullYear(d.getFullYear() + amount); d.setMonth(origMonth) }
    const daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(origDay, daysInTargetMonth))
  }
  return d
}

export function calculateDifference(d1, d2) {
  let date1 = new Date(d1.year, d1.month - 1, d1.day, d1.hour, d1.minute, d1.second)
  let date2 = new Date(d2.year, d2.month - 1, d2.day, d2.hour, d2.minute, d2.second)

  let wasSwapped = false
  if (date2 < date1) { [date1, date2] = [date2, date1]; wasSwapped = true }

  let years = date2.getFullYear() - date1.getFullYear()
  let months = date2.getMonth() - date1.getMonth()
  let days = date2.getDate() - date1.getDate()
  // Bug fix: the calendar breakdown used to compare day-of-month directly
  // without accounting for time-of-day at all, so e.g. "Jan 1 11pm" to
  // "Jan 2 1am" (2 hours apart) was reported as "1 day apart" — the day
  // numbers differ even though a full day hasn't actually elapsed. Cascading
  // the borrow through seconds → minutes → hours → days (matching how you'd
  // do long subtraction by hand) fixes this for every unit, not just days.
  let hours = date2.getHours() - date1.getHours()
  let minutes = date2.getMinutes() - date1.getMinutes()
  let seconds = date2.getSeconds() - date1.getSeconds()

  if (seconds < 0) { minutes--; seconds += 60 }
  if (minutes < 0) { hours--; minutes += 60 }
  if (hours < 0) { days--; hours += 24 }
  if (days < 0) {
    months--
    const prevMonth = new Date(date2.getFullYear(), date2.getMonth(), 0)
    days += prevMonth.getDate()
  }
  if (months < 0) { years--; months += 12 }

  const diffMs = date2 - date1
  const totalSeconds = Math.floor(diffMs / 1000)
  const totalMinutes = totalSeconds / 60
  const totalHours = totalSeconds / 3600
  const totalDays = Math.floor(totalSeconds / 86400)
  const totalMonths = years * 12 + months + days / 30
  const businessDays = countBusinessDays(date1, date2)

  const parts = []
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`)
  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`)
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (parts.length < 3 && hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (parts.length < 3 && minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  if (parts.length === 0) parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`)

  return {
    wasSwapped, years, months, days, hours, minutes, seconds,
    totalDays, totalHours, totalMinutes, totalSeconds, totalMonths, businessDays,
    headline: `That's ${parts.join(', ')} apart.`,
  }
}

// Weekdays only, between two Date objects — normalizes both to midnight first
// since "business days between these dates" is conventionally a calendar-day
// question, not a fractional-time one. Uses a closed-form week calculation
// rather than iterating day-by-day, so it stays fast even decades apart.
export function countBusinessDays(start, end) {
  const oneDay = 86400000
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const totalDays = Math.round((endDay - startDay) / oneDay)
  const fullWeeks = Math.floor(totalDays / 7)
  let businessDays = fullWeeks * 5
  const remainder = totalDays % 7
  const startWeekday = startDay.getDay() // 0 = Sunday .. 6 = Saturday
  for (let i = 0; i < remainder; i++) {
    const wd = (startWeekday + i) % 7
    if (wd !== 0 && wd !== 6) businessDays++
  }
  return businessDays
}

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}