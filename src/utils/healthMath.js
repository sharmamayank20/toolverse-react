export const clamp = (v, min, max) => Math.min(Math.max(v, min), max)
export const cmFromFtIn = (ft, inch) => (ft * 12 + inch) * 2.54
export const kgFromLbs = lbs => lbs * 0.45359237
export const lbsFromKg = kg => kg / 0.45359237
export const cmFromIn = inch => inch * 2.54
export const inFromCm = cm => cm / 2.54

export function calcBMI(heightCm, weightKg) {
  const m = heightCm / 100
  if (m <= 0 || !(weightKg > 0)) return null
  return weightKg / (m * m)
}

export function bmiCategory(b) {
  if (b < 18.5) return 'Underweight'
  if (b < 25) return 'Normal'
  if (b < 30) return 'Overweight'
  return 'Obese'
}

export function bmiWhisper(cat) {
  const map = {
    'Underweight': '"Gather strength gently; the dawn waits."',
    'Normal': '"You\'re in the green zone—steady as a heartbeat."',
    'Overweight': '"Small rituals, steady breaths—the path is patient."',
    'Obese': '"Kindness to self lights the longest roads."',
  }
  return map[cat] ?? '"This isn\'t a number—it\'s a whisper from within."'
}

export function idealWeightRange(cm) {
  const m = cm / 100
  return [18.5 * m * m, 24.9 * m * m]
}

export function bmrMifflin(gender, age, cm, kg) {
  if (!(cm > 0) || !(kg > 0) || !(age > 0)) return null
  const s = gender === 'male' ? 5 : (gender === 'female' ? -161 : -78)
  return 10 * kg + 6.25 * cm - 5 * age + s
}

export function activityFactor(level) {
  switch (level) {
    case 'sedentary': return 1.2
    case 'light': return 1.375
    case 'moderate': return 1.55
    case 'intense': return 1.725
    case 'veryintense': return 1.9
    default: return 1.2
  }
}

export function bodyFatUSNavy({ gender, waist, neck, hip, height }) {
  if (gender !== 'male' && gender !== 'female') return 'needs-gender'
  const wIn = inFromCm(waist)
  const nIn = inFromCm(neck)
  const hIn = inFromCm(height)
  const hipIn = hip ? inFromCm(hip) : null
  if (gender === 'female') {
    if (!hipIn) return null
    return 163.205 * Math.log10(wIn + hipIn - nIn) - 97.684 * Math.log10(hIn) - 78.387
  }
  return 86.010 * Math.log10(wIn - nIn) - 70.041 * Math.log10(hIn) + 36.76
}

export function bodyFatClass(gender, bf) {
  if (gender === 'female') {
    if (bf < 10) return 'Below essential'
    if (bf <= 13) return 'Essential'
    if (bf <= 20) return 'Athlete'
    if (bf <= 24) return 'Fit'
    if (bf <= 31) return 'Average'
    return 'Obese'
  }
  if (bf < 2) return 'Below essential'
  if (bf <= 5) return 'Essential'
  if (bf <= 13) return 'Athlete'
  if (bf <= 17) return 'Fit'
  if (bf <= 24) return 'Average'
  return 'Obese'
}

export const weeklyChangeNeeded = (cur, target, weeks) => weeks > 0 ? (target - cur) / weeks : null
export const kcalFromWeekly = kgPerWeek => (kgPerWeek * 7700) / 7

// Commonly-cited reference points, not personalized medical advice — used
// only to add a factual caution when a timeline implies an unusually fast
// pace or a very low daily intake, since the tool would otherwise compute
// and present those numbers with no context at all.
const SAFE_WEEKLY_CHANGE_KG = 1
const SAFE_MIN_CALORIES = { male: 1500, female: 1200, na: 1500 }

export function goalCautions(perWeek, targetDailyCalories, gender) {
  const cautions = []
  if (Math.abs(perWeek) > SAFE_WEEKLY_CHANGE_KG) {
    cautions.push(`This pace (${Math.abs(perWeek).toFixed(2)} kg/week) is faster than the ~${SAFE_WEEKLY_CHANGE_KG} kg/week most guidance considers sustainable — consider a longer timeline.`)
  }
  const floor = SAFE_MIN_CALORIES[gender] ?? SAFE_MIN_CALORIES.na
  if (targetDailyCalories != null && targetDailyCalories < floor) {
    cautions.push(`The implied daily intake (~${Math.round(targetDailyCalories)} kcal) is below the commonly-cited minimum of ${floor} kcal/day — a longer timeline or a professional's guidance is worth considering.`)
  }
  return cautions
}

export function tipsForCategory(cat) {
  if (cat === 'Underweight') return [
    'Focus on nutrient-dense meals and resistance training.',
    'Add gentle snacks between meals; prioritize sleep for recovery.',
    'Track strength progress, not just scale shifts.',
  ]
  if (cat === 'Normal') return [
    'Maintain variety: protein, colorful plants, and fiber daily.',
    'Cycle intensities: easy movement most days, a few stronger sessions.',
    'Guard sleep and hydration—they anchor everything.',
  ]
  if (cat === 'Overweight') return [
    'Prioritize sleep, hydration, and sustainable movement.',
    'Aim for small, consistent calorie deficits; avoid extremes.',
    'Walk after meals; build a simple strength routine.',
  ]
  return [
    'Start with breath, then steps. The journey is yours.',
    'Create gentle habits: short walks, protein at each meal.',
    'Work with professionals if possible; progress is personal.',
  ]
}