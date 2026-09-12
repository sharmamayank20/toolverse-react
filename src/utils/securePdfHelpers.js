export const MAX_FILE_BYTES = 20 * 1024 * 1024

export function validateSecurePdfFile(file) {
  if (!file) return { ok: false, msg: 'No PDF selected.' }
  const isPdf = (file.name || '').toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
  if (!isPdf) return { ok: false, msg: 'Only PDF files are accepted.' }
  if ((file.size || 0) > MAX_FILE_BYTES) return { ok: false, msg: 'File exceeds 20 MB.' }
  return { ok: true }
}

const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong']

export function computePasswordStrength(password) {
  if (!password) return { score: 0, label: '' }
  let score = 0
  if (password.length >= 6) score++
  if (password.length >= 10) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++
  score = Math.min(score, 4)
  return { score, label: STRENGTH_LABELS[score] }
}